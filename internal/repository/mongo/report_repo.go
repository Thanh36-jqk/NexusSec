package mongorepo

import (
	"context"
	"fmt"
	"time"

	"github.com/nexussec/nexussec/internal/domain/model"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	// collectionName matches the collection created in init-mongo.js.
	collectionName = "reports"

	// defaultTimeout for individual DB operations.
	// Prevents a single slow query from blocking the worker goroutine.
	defaultTimeout = 10 * time.Second
)

// ReportRepo implements model.ReportRepository using MongoDB.
// Uses the official go.mongodb.org/mongo-driver with proper context timeouts.
type ReportRepo struct {
	collection *mongo.Collection
}

// NewReportRepo creates a new report repository from a mongo.Database reference.
func NewReportRepo(db *mongo.Database) *ReportRepo {
	return &ReportRepo{
		collection: db.Collection(collectionName),
	}
}

// Compile-time interface compliance check.
var _ model.ReportRepository = (*ReportRepo)(nil)

// ──────────────────────────────────────────────────────────────
//  Interface Implementation
// ──────────────────────────────────────────────────────────────

// Create inserts a new vulnerability report and returns the generated MongoDB ObjectID.
//
// The report is stored as an unstructured BSON document that can hold deeply
// nested scan tool output without schema constraints (MongoDB's strength over PG).
//
// The init-mongo.js validator ensures required fields are present.
func (repo *ReportRepo) Create(ctx context.Context, report *model.Report) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, defaultTimeout)
	defer cancel()

	// Build BSON document explicitly for full control over field names
	doc := bson.M{
		"scan_job_id":     report.ScanJobID,
		"target_url":      report.TargetURL,
		"scan_type":       report.ScanType,
		"summary":         report.Summary,
		"vulnerabilities": report.Vulnerabilities,
		"created_at":      report.CreatedAt,
	}

	result, err := repo.collection.InsertOne(ctx, doc)
	if err != nil {
		return "", fmt.Errorf("mongodb: InsertOne failed: %w", err)
	}

	// Extract the generated ObjectID as a hex string
	objectID, ok := result.InsertedID.(primitive.ObjectID)
	if !ok {
		return "", fmt.Errorf("mongodb: unexpected InsertedID type: %T", result.InsertedID)
	}

	return objectID.Hex(), nil
}

// GetByID fetches a report by its MongoDB ObjectID (hex string).
//
// Example:
//
//	report, err := repo.GetByID(ctx, "507f1f77bcf86cd799439011")
func (repo *ReportRepo) GetByID(ctx context.Context, id string) (*model.Report, error) {
	ctx, cancel := context.WithTimeout(ctx, defaultTimeout)
	defer cancel()

	objectID, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, fmt.Errorf("mongodb: invalid ObjectID %q: %w", id, err)
	}

	filter := bson.M{"_id": objectID}

	var report model.Report
	err = repo.collection.FindOne(ctx, filter).Decode(&report)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("report %s not found", id)
		}
		return nil, fmt.Errorf("mongodb: FindOne failed: %w", err)
	}

	return &report, nil
}

// GetByScanJobID fetches the report associated with a specific scan job.
// Uses the unique index on scan_job_id for O(1) lookup.
//
// Example:
//
//	report, err := repo.GetByScanJobID(ctx, "550e8400-e29b-41d4-a716-446655440000")
func (repo *ReportRepo) GetByScanJobID(ctx context.Context, scanJobID string) (*model.Report, error) {
	ctx, cancel := context.WithTimeout(ctx, defaultTimeout)
	defer cancel()

	filter := bson.M{"scan_job_id": scanJobID}

	var report model.Report
	err := repo.collection.FindOne(ctx, filter).Decode(&report)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return nil, fmt.Errorf("report for scan job %s not found", scanJobID)
		}
		return nil, fmt.Errorf("mongodb: FindOne by scan_job_id failed: %w", err)
	}

	return &report, nil
}
