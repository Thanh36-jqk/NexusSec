-- ============================================================
--  NexusSec — PostgreSQL Initialization Script
--  Runs automatically on first container startup via
--  /docker-entrypoint-initdb.d/ mount.
-- ============================================================

-- Enable UUID generation (pgcrypto provides gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ────────────────────────────────────────────────────────────
--  ENUM TYPES
-- ────────────────────────────────────────────────────────────

CREATE TYPE scan_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
);

CREATE TYPE scan_type AS ENUM (
    'zap',
    'nmap',
    'full'
);

-- ────────────────────────────────────────────────────────────
--  USERS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255)  NOT NULL UNIQUE,
    username      VARCHAR(100)  NOT NULL UNIQUE,
    password      VARCHAR(255),                     -- bcrypt hash (can be null for OAuth)
    role          VARCHAR(20)   NOT NULL DEFAULT 'user',
    is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
    is_verified   BOOLEAN       NOT NULL DEFAULT FALSE,
    auth_provider VARCHAR(20)   NOT NULL DEFAULT 'local',
    provider_id   VARCHAR(255),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Index for login lookups
CREATE INDEX idx_users_email         ON users (email);
CREATE INDEX idx_users_username      ON users (username);
CREATE INDEX idx_users_provider_id   ON users (auth_provider, provider_id);

-- ────────────────────────────────────────────────────────────
--  TARGETS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS targets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(255)  NOT NULL,           -- friendly label
    base_url    VARCHAR(2048) NOT NULL,           -- e.g. https://api.example.com
    description TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Each user's targets list
CREATE INDEX idx_targets_user_id ON targets (user_id);

-- ────────────────────────────────────────────────────────────
--  SCAN_JOBS TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS scan_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id       UUID          NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    scan_type       scan_type     NOT NULL DEFAULT 'full',
    status          scan_status   NOT NULL DEFAULT 'pending',
    progress        SMALLINT      NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    report_id       VARCHAR(255),              -- MongoDB ObjectID reference (string)
    error_message   TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Query patterns: list by user, filter by status, find by target
CREATE INDEX idx_scan_jobs_user_id   ON scan_jobs (user_id);
CREATE INDEX idx_scan_jobs_target_id ON scan_jobs (target_id);
CREATE INDEX idx_scan_jobs_status    ON scan_jobs (status);

-- Composite: user's jobs ordered by creation time (dashboard query)
CREATE INDEX idx_scan_jobs_user_created ON scan_jobs (user_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
--  AUTO-UPDATE updated_at TRIGGER
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_targets_updated_at
    BEFORE UPDATE ON targets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_scan_jobs_updated_at
    BEFORE UPDATE ON scan_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ────────────────────────────────────────────────────────────
--  VULNERABILITY_TRIAGE TABLE
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vulnerability_triage (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id         UUID          NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
    vuln_fingerprint  VARCHAR(512)  NOT NULL,           -- deterministic hash/string: name|url|port
    is_muted          BOOLEAN       NOT NULL DEFAULT FALSE,
    is_false_positive BOOLEAN       NOT NULL DEFAULT FALSE,
    notes             TEXT,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (target_id, vuln_fingerprint) -- A target can only have one triage state per vulnerability footprint
);

-- Fast lookup for a target's triage rules
CREATE INDEX idx_vuln_triage_target_id ON vulnerability_triage (target_id);

CREATE TRIGGER trg_vulnerability_triage_updated_at
    BEFORE UPDATE ON vulnerability_triage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
