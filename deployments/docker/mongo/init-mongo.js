
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE || 'nexussec_reports');

// Create the reports collection with a JSON Schema validator
db.createCollection('reports', {
    validator: {
        $jsonSchema: {
            bsonType: 'object',
            required: ['scan_job_id', 'target_url', 'scan_type', 'created_at'],
            properties: {
                scan_job_id: {
                    bsonType: 'string',
                    description: 'UUID reference to PostgreSQL scan_jobs.id'
                },
                target_url: {
                    bsonType: 'string',
                    description: 'The scanned target URL'
                },
                scan_type: {
                    enum: ['zap', 'nmap', 'full'],
                    description: 'Type of scan performed'
                },
                summary: {
                    bsonType: 'object',
                    description: 'Aggregated vulnerability counts by severity'
                },
                vulnerabilities: {
                    bsonType: 'array',
                    description: 'Array of vulnerability findings'
                },
                raw_output: {
                    bsonType: 'object',
                    description: 'Raw tool output preserved for debugging'
                },
                created_at: {
                    bsonType: 'date',
                    description: 'Report creation timestamp'
                }
            }
        }
    }
});

// Indexes for common query patterns
db.reports.createIndex({ scan_job_id: 1 }, { unique: true });
db.reports.createIndex({ created_at: -1 });

print('✅ MongoDB initialized: nexussec_reports.reports collection created');
