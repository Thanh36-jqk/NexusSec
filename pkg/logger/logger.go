package logger

import (
	"os"

	"github.com/rs/zerolog"
)

// New creates a configured zerolog.Logger.
// In production (GIN_MODE=release), outputs JSON.
// In development, outputs pretty-printed console output.
func New(mode string) zerolog.Logger {
	if mode == "release" {
		return zerolog.New(os.Stdout).
			With().
			Timestamp().
			Caller().
			Logger()
	}

	// Development: human-readable colored output
	return zerolog.New(zerolog.ConsoleWriter{Out: os.Stdout}).
		With().
		Timestamp().
		Caller().
		Logger()
}
