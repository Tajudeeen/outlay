import type { AgentCredentialRecord, AgentCredentialStore } from "@outlay/policy";
import type { Pool } from "pg";

export type IdempotencyRecord = {
  requestHash: string;
  responseStatus: number;
  response: unknown;
};

export interface OutlayStore extends AgentCredentialStore {
  issueCredential(agentId: string, keyHash: string, rotate: boolean): Promise<void>;
  revokeCredentials(agentId: string): Promise<number>;
  consumeRateLimit(agentId: string, windowStart: number, limit: number): Promise<boolean>;
  getIdempotency(agentId: string, key: string): Promise<IdempotencyRecord | null>;
  putIdempotency(
    agentId: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    response: unknown,
    expiresAt: Date,
  ): Promise<boolean>;
  ping(): Promise<void>;
}

export class PgOutlayStore implements OutlayStore {
  constructor(private readonly pool: Pool) {}

  async findByKeyHash(keyHash: string): Promise<AgentCredentialRecord | null> {
    const result = await this.pool.query<{
      agent_id: string;
      key_hash: string;
      enabled: boolean;
    }>(
      "SELECT agent_id, key_hash, enabled FROM agent_credentials WHERE key_hash = $1 LIMIT 1",
      [keyHash],
    );
    const row = result.rows[0];
    return row ? { agentId: row.agent_id, keyHash: row.key_hash, enabled: row.enabled } : null;
  }

  async issueCredential(agentId: string, keyHash: string, rotate: boolean): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize issuance and rotation per agent. The transaction lock is released on commit/rollback.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [agentId]);
      const active = await client.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM agent_credentials WHERE agent_id = $1 AND enabled = TRUE",
        [agentId],
      );
      const hasActive = Number(active.rows[0]?.count ?? "0") > 0;
      if (rotate && hasActive) {
        const revoked = await client.query<{ key_hash: string }>(
          "UPDATE agent_credentials SET enabled = FALSE, revoked_at = NOW() WHERE agent_id = $1 AND enabled = TRUE RETURNING key_hash",
          [agentId],
        );
        for (const row of revoked.rows) {
          await client.query(
            "INSERT INTO agent_key_events (agent_id, event_type, key_hash) VALUES ($1, 'rotated', $2)",
            [agentId, row.key_hash],
          );
        }
      } else if (hasActive) {
        throw new Error("ACTIVE_KEY_EXISTS_USE_ROTATE");
      }
      await client.query(
        "INSERT INTO agent_credentials (key_hash, agent_id, enabled) VALUES ($1, $2, TRUE)",
        [keyHash, agentId],
      );
      await client.query(
        "INSERT INTO agent_key_events (agent_id, event_type, key_hash) VALUES ($1, $2, $3)",
        [agentId, rotate && hasActive ? "rotated" : "issued", keyHash],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeCredentials(agentId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [agentId]);
      const result = await client.query<{ key_hash: string }>(
        "UPDATE agent_credentials SET enabled = FALSE, revoked_at = NOW() WHERE agent_id = $1 AND enabled = TRUE RETURNING key_hash",
        [agentId],
      );
      for (const row of result.rows) {
        await client.query(
          "INSERT INTO agent_key_events (agent_id, event_type, key_hash) VALUES ($1, 'revoked', $2)",
          [agentId, row.key_hash],
        );
      }
      await client.query("COMMIT");
      return result.rowCount ?? 0;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async consumeRateLimit(agentId: string, windowStart: number, limit: number): Promise<boolean> {
    // Opportunistic daily cleanup keeps fixed-window counters bounded.
    if (windowStart % 1440 === 0) {
      await this.pool.query("DELETE FROM agent_rate_limits WHERE window_start < $1", [windowStart - 1440]);
    }
    const result = await this.pool.query<{ request_count: number }>(
      `INSERT INTO agent_rate_limits (agent_id, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (agent_id, window_start)
       DO UPDATE SET request_count = agent_rate_limits.request_count + 1
       WHERE agent_rate_limits.request_count < $3
       RETURNING request_count`,
      [agentId, windowStart, limit],
    );
    return result.rowCount === 1;
  }

  async getIdempotency(agentId: string, key: string): Promise<IdempotencyRecord | null> {
    const result = await this.pool.query<{
      request_hash: string;
      response_status: number;
      response_json: unknown;
    }>(
      "SELECT request_hash, response_status, response_json FROM idempotency_records WHERE agent_id = $1 AND idempotency_key = $2 AND expires_at > NOW()",
      [agentId, key],
    );
    const row = result.rows[0];
    return row
      ? { requestHash: row.request_hash, responseStatus: row.response_status, response: row.response_json }
      : null;
  }

  async putIdempotency(
    agentId: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    response: unknown,
    expiresAt: Date,
  ): Promise<boolean> {
    await this.pool.query("DELETE FROM idempotency_records WHERE expires_at <= NOW()");
    const result = await this.pool.query(
      `INSERT INTO idempotency_records
       (agent_id, idempotency_key, request_hash, response_status, response_json, expires_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (agent_id, idempotency_key) DO NOTHING`,
      [agentId, key, requestHash, responseStatus, JSON.stringify(response), expiresAt],
    );
    return result.rowCount === 1;
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }
}
