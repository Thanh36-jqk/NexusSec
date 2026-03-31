package config

import (
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/spf13/viper"
)

// Config holds all configuration for all services (Gateway + Scanner).
// Values are loaded from environment variables or a config file.
type Config struct {
	Server   ServerConfig
	Postgres PostgresConfig
	Mongo    MongoConfig
	Redis    RedisConfig
	RabbitMQ RabbitMQConfig
	JWT      JWTConfig
	CORS     CORSConfig
	Proxy    ProxyConfig
	Scanner  ScannerConfig
}

// ScannerConfig holds configuration for the Scanner Engine worker.
type ScannerConfig struct {
	// Concurrency is the number of goroutines in the worker pool.
	// Each goroutine processes one scan job at a time.
	Concurrency int `mapstructure:"SCANNER_CONCURRENCY"`

	// ScanNetwork is the isolated Docker network for scan containers.
	// SECURITY: This MUST NOT be nexussec-network. Scan containers get
	// outbound internet access only, with zero access to internal services.
	ScanNetwork string `mapstructure:"SCANNER_NETWORK"`
}

type ServerConfig struct {
	Port         string        `mapstructure:"GATEWAY_PORT"`
	ReadTimeout  time.Duration `mapstructure:"SERVER_READ_TIMEOUT"`
	WriteTimeout time.Duration `mapstructure:"SERVER_WRITE_TIMEOUT"`
	Mode         string        `mapstructure:"GIN_MODE"` // debug | release | test
}

type PostgresConfig struct {
	Host     string `mapstructure:"POSTGRES_HOST"`
	Port     string `mapstructure:"POSTGRES_PORT"`
	User     string `mapstructure:"POSTGRES_USER"`
	Password string `mapstructure:"POSTGRES_PASSWORD"`
	DB       string `mapstructure:"POSTGRES_DB"`
	SSLMode  string `mapstructure:"POSTGRES_SSL_MODE"`
}

// DSN returns the PostgreSQL connection string.
func (p *PostgresConfig) DSN() string {
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		p.Host, p.Port, p.User, p.Password, p.DB, p.SSLMode,
	)
}

type MongoConfig struct {
	Host     string `mapstructure:"MONGO_HOST"`
	Port     string `mapstructure:"MONGO_PORT"`
	User     string `mapstructure:"MONGO_INITDB_ROOT_USERNAME"`
	Password string `mapstructure:"MONGO_INITDB_ROOT_PASSWORD"`
	DB       string `mapstructure:"MONGO_INITDB_DATABASE"`
}

// URI returns the MongoDB connection string.
func (m *MongoConfig) URI() string {
	return fmt.Sprintf("mongodb://%s:%s@%s:%s/%s?authSource=admin",
		m.User, m.Password, m.Host, m.Port, m.DB,
	)
}

type RedisConfig struct {
	Host     string `mapstructure:"REDIS_HOST"`
	Port     string `mapstructure:"REDIS_PORT"`
	Password string `mapstructure:"REDIS_PASSWORD"`
	DB       int    `mapstructure:"REDIS_DB"`
}

// Addr returns host:port for the Redis client.
func (r *RedisConfig) Addr() string {
	return fmt.Sprintf("%s:%s", r.Host, r.Port)
}

type RabbitMQConfig struct {
	Host     string `mapstructure:"RABBITMQ_HOST"`
	Port     string `mapstructure:"RABBITMQ_PORT"`
	User     string `mapstructure:"RABBITMQ_DEFAULT_USER"`
	Password string `mapstructure:"RABBITMQ_DEFAULT_PASS"`
}

// URI returns the AMQP connection string.
func (r *RabbitMQConfig) URI() string {
	return fmt.Sprintf("amqp://%s:%s@%s:%s/",
		r.User, r.Password, r.Host, r.Port,
	)
}

type JWTConfig struct {
	PrivateKeyPath  string        `mapstructure:"JWT_PRIVATE_KEY_PATH"` // PEM file — used by Auth Service to SIGN
	PublicKeyPath   string        `mapstructure:"JWT_PUBLIC_KEY_PATH"`  // PEM file — used by Gateway to VERIFY
	Expiration      time.Duration `mapstructure:"JWT_EXPIRATION"`
	Issuer          string        `mapstructure:"JWT_ISSUER"`
	RefreshDuration time.Duration `mapstructure:"JWT_REFRESH_DURATION"`
}

type CORSConfig struct {
	AllowedOrigins []string `mapstructure:"CORS_ALLOWED_ORIGINS"`
}

type ProxyConfig struct {
	ScannerEngineURL string        `mapstructure:"SCANNER_ENGINE_URL"`
	Timeout          time.Duration `mapstructure:"PROXY_TIMEOUT"`
}

// Load reads configuration from the .env file and environment variables.
// Environment variables take precedence over file values.
func Load() (*Config, error) {
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	viper.AutomaticEnv()

	// Defaults — sensible values for local development
	setDefaults()

	// Attempt to read .env file; ignore if not found (env vars are sufficient)
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			log.Println("[config] .env file not found, using environment variables only")
		} else if errors.Is(err, os.ErrNotExist) {
			log.Println("[config] .env file not found, using environment variables only")
		} else {
			return nil, fmt.Errorf("config: failed to read config file: %w", err)
		}
	}

	cfg := &Config{
		Server: ServerConfig{
			Port:         viper.GetString("GATEWAY_PORT"),
			ReadTimeout:  viper.GetDuration("SERVER_READ_TIMEOUT"),
			WriteTimeout: viper.GetDuration("SERVER_WRITE_TIMEOUT"),
			Mode:         viper.GetString("GIN_MODE"),
		},
		Postgres: PostgresConfig{
			Host:     viper.GetString("POSTGRES_HOST"),
			Port:     viper.GetString("POSTGRES_PORT"),
			User:     viper.GetString("POSTGRES_USER"),
			Password: viper.GetString("POSTGRES_PASSWORD"),
			DB:       viper.GetString("POSTGRES_DB"),
			SSLMode:  viper.GetString("POSTGRES_SSL_MODE"),
		},
		Mongo: MongoConfig{
			Host:     viper.GetString("MONGO_HOST"),
			Port:     viper.GetString("MONGO_PORT"),
			User:     viper.GetString("MONGO_INITDB_ROOT_USERNAME"),
			Password: viper.GetString("MONGO_INITDB_ROOT_PASSWORD"),
			DB:       viper.GetString("MONGO_INITDB_DATABASE"),
		},
		Redis: RedisConfig{
			Host:     viper.GetString("REDIS_HOST"),
			Port:     viper.GetString("REDIS_PORT"),
			Password: viper.GetString("REDIS_PASSWORD"),
			DB:       viper.GetInt("REDIS_DB"),
		},
		RabbitMQ: RabbitMQConfig{
			Host:     viper.GetString("RABBITMQ_HOST"),
			Port:     viper.GetString("RABBITMQ_PORT"),
			User:     viper.GetString("RABBITMQ_DEFAULT_USER"),
			Password: viper.GetString("RABBITMQ_DEFAULT_PASS"),
		},
		JWT: JWTConfig{
			PrivateKeyPath:  viper.GetString("JWT_PRIVATE_KEY_PATH"),
			PublicKeyPath:   viper.GetString("JWT_PUBLIC_KEY_PATH"),
			Expiration:      viper.GetDuration("JWT_EXPIRATION"),
			Issuer:          viper.GetString("JWT_ISSUER"),
			RefreshDuration: viper.GetDuration("JWT_REFRESH_DURATION"),
		},
		CORS: CORSConfig{
			AllowedOrigins: viper.GetStringSlice("CORS_ALLOWED_ORIGINS"),
		},
		Proxy: ProxyConfig{
			ScannerEngineURL: viper.GetString("SCANNER_ENGINE_URL"),
			Timeout:          viper.GetDuration("PROXY_TIMEOUT"),
		},
		Scanner: ScannerConfig{
			Concurrency: viper.GetInt("SCANNER_CONCURRENCY"),
			ScanNetwork: viper.GetString("SCANNER_NETWORK"),
		},
	}

	return cfg, nil
}

func setDefaults() {
	// Server
	viper.SetDefault("GATEWAY_PORT", "8080")
	viper.SetDefault("SERVER_READ_TIMEOUT", "15s")
	viper.SetDefault("SERVER_WRITE_TIMEOUT", "15s")
	viper.SetDefault("GIN_MODE", "debug")

	// PostgreSQL
	viper.SetDefault("POSTGRES_HOST", "localhost")
	viper.SetDefault("POSTGRES_PORT", "5432")
	viper.SetDefault("POSTGRES_SSL_MODE", "disable")

	// MongoDB
	viper.SetDefault("MONGO_HOST", "localhost")
	viper.SetDefault("MONGO_PORT", "27017")

	// Redis
	viper.SetDefault("REDIS_HOST", "localhost")
	viper.SetDefault("REDIS_PORT", "6379")
	viper.SetDefault("REDIS_DB", 0)

	// RabbitMQ
	viper.SetDefault("RABBITMQ_HOST", "localhost")
	viper.SetDefault("RABBITMQ_PORT", "5672")

	// JWT (RS256)
	viper.SetDefault("JWT_PRIVATE_KEY_PATH", "keys/private.pem")
	viper.SetDefault("JWT_PUBLIC_KEY_PATH", "keys/public.pem")
	viper.SetDefault("JWT_EXPIRATION", "24h")
	viper.SetDefault("JWT_ISSUER", "nexussec")
	viper.SetDefault("JWT_REFRESH_DURATION", "168h") // 7 days

	// CORS
	viper.SetDefault("CORS_ALLOWED_ORIGINS", []string{"http://localhost:3000"})

	// Proxy
	viper.SetDefault("SCANNER_ENGINE_URL", "http://127.0.0.1:8081")
	viper.SetDefault("PROXY_TIMEOUT", "5s") // strict: backend MUST return 202 immediately

	// Scanner Engine
	viper.SetDefault("SCANNER_CONCURRENCY", 3)
	viper.SetDefault("SCANNER_NETWORK", "scan-network") // isolated from nexussec-network
}
