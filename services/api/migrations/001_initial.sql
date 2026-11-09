CREATE TABLE IF NOT EXISTS agent_credentials (
  key_hash CHAR(64) PRIMARY KEY
    CHECK (length(key_hash) = 64 AND key_hash !~ '[^a-f0-9]'),
  agent_id VARCHAR(64) NOT NULL
    CHECK (length(agent_id) BETWEEN 2 AND 64),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_credentials_active_agent_idx
  ON agent_credentials (agent_id, created_at DESC)
  WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS agent_key_events (
  id BIGSERIAL PRIMARY KEY,
  agent_id VARCHAR(64) NOT NULL
    CHECK (length(agent_id) BETWEEN 2 AND 64),
  event_type VARCHAR(16) NOT NULL
    CHECK (event_type IN ('issued', 'rotated', 'revoked')),
  key_hash CHAR(64)
    CHECK (key_hash IS NULL OR (length(key_hash) = 64 AND key_hash !~ '[^a-f0-9]')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_key_events_agent_idx
  ON agent_key_events (agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_rate_limits (
  agent_id VARCHAR(64) NOT NULL,
  window_start BIGINT NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY (agent_id, window_start),
  CHECK (length(agent_id) BETWEEN 2 AND 64),
  CHECK (window_start >= 0)
);

CREATE INDEX IF NOT EXISTS agent_rate_limits_window_idx
  ON agent_rate_limits (window_start);

CREATE TABLE IF NOT EXISTS idempotency_records (
  agent_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash CHAR(64) NOT NULL
    CHECK (length(request_hash) = 64 AND request_hash !~ '[^a-f0-9]'),
  response_status SMALLINT NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, idempotency_key),
  CHECK (length(agent_id) BETWEEN 2 AND 64),
  CHECK (length(idempotency_key) BETWEEN 8 AND 128)
);

CREATE INDEX IF NOT EXISTS idempotency_records_expiry_idx
  ON idempotency_records (expires_at);
