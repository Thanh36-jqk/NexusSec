package broker

import (
	"fmt"

	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/rs/zerolog"
)

const (
	// DLXName is the Dead-Letter Exchange name.
	// Nack'd messages without requeue are routed here for auditing.
	DLXName = "nexussec.dlx"

	// DLQSuffix is appended to the source queue name to form the DLQ name.
	// e.g., scan_jobs_queue → scan_jobs_queue.dlq
	DLQSuffix = ".dlq"
)

// Connection wraps an AMQP connection and channel with reconnection-friendly helpers.
type Connection struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	logger  zerolog.Logger
}

// NewConnection establishes a connection to RabbitMQ and opens a channel.
func NewConnection(uri string, logger zerolog.Logger) (*Connection, error) {
	conn, err := amqp.Dial(uri)
	if err != nil {
		return nil, fmt.Errorf("rabbitmq: failed to connect to %s: %w", uri, err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("rabbitmq: failed to open channel: %w", err)
	}

	logger.Info().Msg("connected to RabbitMQ")

	return &Connection{
		conn:    conn,
		channel: ch,
		logger:  logger,
	}, nil
}

// Channel returns the underlying AMQP channel.
func (c *Connection) Channel() *amqp.Channel {
	return c.channel
}

// DeclareQueueWithDLQ sets up the complete message topology:
//
//  1. Declares a Dead-Letter Exchange (DLX) — fanout type
//  2. Declares a Dead-Letter Queue (DLQ) — <queueName>.dlq
//  3. Binds the DLQ to the DLX
//  4. Declares the main queue with x-dead-letter-exchange pointing to the DLX
//
// When a message is Nack'd without requeue on the main queue, RabbitMQ
// automatically routes it to the DLQ via the DLX for auditing/debugging.
//
// Topology:
//
//	scan_jobs_queue ──[Nack(requeue=false)]──> nexussec.dlx ──> scan_jobs_queue.dlq
func (c *Connection) DeclareQueueWithDLQ(queueName string) (amqp.Queue, error) {
	dlqName := queueName + DLQSuffix

	// ── 1. Declare the Dead-Letter Exchange ─────────────────
	err := c.channel.ExchangeDeclare(
		DLXName,  // exchange name
		"fanout", // type: fanout routes to all bound queues
		true,     // durable
		false,    // auto-delete
		false,    // internal
		false,    // no-wait
		nil,      // arguments
	)
	if err != nil {
		return amqp.Queue{}, fmt.Errorf("rabbitmq: failed to declare DLX %q: %w", DLXName, err)
	}
	c.logger.Info().Str("exchange", DLXName).Msg("dead-letter exchange declared")

	// ── 2. Declare the Dead-Letter Queue ────────────────────
	_, err = c.channel.QueueDeclare(
		dlqName, // queue name: scan_jobs_queue.dlq
		true,    // durable
		false,   // auto-delete
		false,   // exclusive
		false,   // no-wait
		nil,     // no special arguments on the DLQ itself
	)
	if err != nil {
		return amqp.Queue{}, fmt.Errorf("rabbitmq: failed to declare DLQ %q: %w", dlqName, err)
	}
	c.logger.Info().Str("queue", dlqName).Msg("dead-letter queue declared")

	// ── 3. Bind DLQ to the DLX ──────────────────────────────
	err = c.channel.QueueBind(
		dlqName, // queue
		"",      // routing key (fanout ignores this)
		DLXName, // exchange
		false,   // no-wait
		nil,     // arguments
	)
	if err != nil {
		return amqp.Queue{}, fmt.Errorf("rabbitmq: failed to bind DLQ to DLX: %w", err)
	}

	// ── 4. Declare the main queue with DLX routing ──────────
	q, err := c.channel.QueueDeclare(
		queueName, // queue name
		true,      // durable — survives RabbitMQ restarts
		false,     // auto-delete
		false,     // exclusive
		false,     // no-wait
		amqp.Table{
			"x-dead-letter-exchange": DLXName, // Route Nack'd messages to DLX
		},
	)
	if err != nil {
		return amqp.Queue{}, fmt.Errorf("rabbitmq: failed to declare queue %q: %w", queueName, err)
	}

	c.logger.Info().
		Str("queue", queueName).
		Str("dlx", DLXName).
		Str("dlq", dlqName).
		Msg("queue declared with dead-letter routing")

	return q, nil
}

// SetPrefetch limits the number of unacknowledged messages delivered to this consumer.
// This is critical for the worker pool: it prevents RabbitMQ from flooding a single
// consumer with more work than it can handle.
func (c *Connection) SetPrefetch(count int) error {
	err := c.channel.Qos(
		count, // prefetch count
		0,     // prefetch size (0 = no limit)
		false, // global (false = per-consumer)
	)
	if err != nil {
		return fmt.Errorf("rabbitmq: failed to set prefetch to %d: %w", count, err)
	}
	return nil
}

// Close gracefully shuts down the channel and connection.
func (c *Connection) Close() {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
	c.logger.Info().Msg("RabbitMQ connection closed")
}
