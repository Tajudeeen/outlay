import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { PgOutlayStore } from "../src/store.js";

const enabled = Boolean(process.env.DATABASE_URL);
describe.skipIf(!enabled)("PgOutlayStore integration", () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(process.env.PGSSL === "require" ? { ssl: { rejectUnauthorized: true } } : {}),
  });
  const store = new PgOutlayStore(pool);
  const agentId = "store-test-agent.testnet";

  beforeAll(async () => {
    const migration = await readFile(resolve(process.cwd(), "migrations/001_initial.sql"), "utf8");
    await pool.query(migration);
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM idempotency_records WHERE agent_id = $1", [agentId]);
    await pool.query("DELETE FROM agent_rate_limits WHERE agent_id = $1", [agentId]);
    await pool.query("DELETE FROM agent_key_events WHERE agent_id = $1", [agentId]);
    await pool.query("DELETE FROM agent_credentials WHERE agent_id = $1", [agentId]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("stores only credential digests and resolves enabled credentials", async () => {
    const digest = "a".repeat(64);
    await store.issueCredential(agentId, digest, false);
    await expect(store.findByKeyHash(digest)).resolves.toEqual({
      agentId, keyHash: digest, enabled: true,
    });
    const rows = await pool.query("SELECT key_hash FROM agent_credentials WHERE agent_id = $1", [agentId]);
    expect(rows.rows[0]?.key_hash).toBe(digest);
  });

  it("serializes concurrent first-time key issuance for one agent", async () => {
    const results = await Promise.allSettled([
      store.issueCredential(agentId, "1".repeat(64), false),
      store.issueCredential(agentId, "2".repeat(64), false),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const active = await pool.query(
      "SELECT COUNT(*)::int AS count FROM agent_credentials WHERE agent_id = $1 AND enabled = TRUE",
      [agentId],
    );
    expect(active.rows[0]?.count).toBe(1);
    const events = await pool.query(
      "SELECT COUNT(*)::int AS count FROM agent_key_events WHERE agent_id = $1",
      [agentId],
    );
    expect(events.rows[0]?.count).toBe(1);
  });

  it("requires explicit rotation and revokes previous credentials atomically", async () => {
    const oldDigest = "b".repeat(64);
    const newDigest = "c".repeat(64);
    await store.issueCredential(agentId, oldDigest, false);
    await expect(store.issueCredential(agentId, newDigest, false)).rejects.toThrow("ACTIVE_KEY_EXISTS_USE_ROTATE");
    await store.issueCredential(agentId, newDigest, true);
    await expect(store.findByKeyHash(oldDigest)).resolves.toMatchObject({ enabled: false });
    await expect(store.findByKeyHash(newDigest)).resolves.toMatchObject({ enabled: true });
    const events = await pool.query(
      "SELECT event_type FROM agent_key_events WHERE agent_id = $1 ORDER BY id",
      [agentId],
    );
    expect(events.rows.map((row) => row.event_type)).toEqual(["issued", "rotated", "rotated"]);
  });

  it("revokes every active key and records the revocation", async () => {
    await store.issueCredential(agentId, "d".repeat(64), false);
    await store.issueCredential(agentId, "e".repeat(64), true);
    await expect(store.revokeCredentials(agentId)).resolves.toBe(1);
    await expect(store.findByKeyHash("e".repeat(64))).resolves.toMatchObject({ enabled: false });
  });

  it("enforces the fixed-window rate limit atomically", async () => {
    const window = Math.floor(Date.now() / 60_000);
    await expect(store.consumeRateLimit(agentId, window, 2)).resolves.toBe(true);
    await expect(store.consumeRateLimit(agentId, window, 2)).resolves.toBe(true);
    await expect(store.consumeRateLimit(agentId, window, 2)).resolves.toBe(false);
  });

  it("stores and replays idempotency responses", async () => {
    const response = { status: "preflight_allowed", authorized: false };
    const expiry = new Date(Date.now() + 60_000);
    await expect(store.putIdempotency(agentId, "store-test-key-01", "f".repeat(64), 200, response, expiry))
      .resolves.toBe(true);
    await expect(store.putIdempotency(agentId, "store-test-key-01", "f".repeat(64), 200, response, expiry))
      .resolves.toBe(false);
    await expect(store.getIdempotency(agentId, "store-test-key-01")).resolves.toEqual({
      requestHash: "f".repeat(64), responseStatus: 200, response,
    });
  });
});
