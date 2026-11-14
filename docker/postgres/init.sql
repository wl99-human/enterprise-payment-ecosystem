-- ==============================================================================
-- Enterprise Payment & Ledger Ecosystem PostgreSQL DDL & Seeds
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Accounts Table (Pessimistic balance validation & optimistic versioning)
CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(64) PRIMARY KEY,
    owner_id VARCHAR(64) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    balance NUMERIC(18, 4) NOT NULL CHECK (balance >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Double-Entry Journal Entries (Strict balance conservation: Debits == Credits)
CREATE TABLE IF NOT EXISTS journal_entries (
    id BIGSERIAL PRIMARY KEY,
    transaction_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(64) NOT NULL REFERENCES accounts(id),
    direction VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount NUMERIC(18, 4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_journal_tx ON journal_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_journal_account ON journal_entries(account_id, created_at DESC);

-- 3. Transactional Outbox Table (Guaranteed at-least-once delivery into Kafka)
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    payload TEXT NOT NULL, -- Serialized JSON/Protobuf payload
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, created_at ASC) WHERE status = 'PENDING';

-- 4. Consumer Idempotency Log (Prevents duplicate Kafka message processing)
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id VARCHAR(128) PRIMARY KEY,
    consumer_group VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initial Accounts Seed
INSERT INTO accounts (id, owner_id, currency, balance, version) VALUES
    ('acc_alice', 'usr_alice_001', 'USD', 10000.0000, 0),
    ('acc_bob', 'usr_bob_002', 'USD', 5000.0000, 0),
    ('acc_charlie', 'usr_charlie_003', 'USD', 2500.0000, 0),
    ('acc_treasury', 'usr_corp_vault', 'USD', 100000.0000, 0)
ON CONFLICT (id) DO NOTHING;
