CREATE TABLE IF NOT EXISTS agent_credentials (
  key_hash CHAR(64) PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_credentials_active_agent_idx
  ON agent_credentials (agent_id, created_at DESC)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS agent_key_events (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(16) NOT NULL CHECK (event_type IN ('issued', 'rotated', 'revoked')),
  key_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_key_events_agent_idx
  ON agent_key_events (agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_rate_limits (
  agent_id VARCHAR(64) NOT NULL,
  window_start BIGINT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (agent_id, window_start)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  agent_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status SMALLINT NOT NULL,
  response_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idempotency_records_expiry_idx
  ON idempotency_records (expires_at);
