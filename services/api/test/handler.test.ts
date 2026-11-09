import { beforeEach, describe, expect, it } from "vitest";
import { issueAgentKey } from "@outlay/policy";
import { createApiHandler } from "../src/handler.js";
import type { ChainSnapshot, NearReader } from "../src/near-client.js";
import type { IdempotencyRecord, OutlayStore } from "../src/store.js";

class MemoryStore implements OutlayStore {
  credentials = new Map<string, { agentId: string; keyHash: string; enabled: boolean }>();
  limits = new Map<string, number>();
  idempotency = new Map<string, IdempotencyRecord>();
  async findByKeyHash(hash: string) { return this.credentials.get(hash) ?? null; }
  async issueCredential(agentId: string, keyHash: string, rotate: boolean) {
    const active = [...this.credentials.values()].some((item) => item.agentId === agentId && item.enabled);
    if (active && !rotate) throw new Error("ACTIVE_KEY_EXISTS_USE_ROTATE");
    if (rotate) for (const item of this.credentials.values()) if (item.agentId === agentId) item.enabled = false;
    this.credentials.set(keyHash, { agentId, keyHash, enabled: true });
  }
  async revokeCredentials(agentId: string) {
    let count = 0;
    for (const item of this.credentials.values()) if (item.agentId === agentId && item.enabled) {
      item.enabled = false;
      count += 1;
    }
    return count;
  }
  async consumeRateLimit(agentId: string, windowStart: number, limit: number) {
    const key = agentId + ":" + windowStart;
    const count = this.limits.get(key) ?? 0;
    if (count >= limit) return false;
    this.limits.set(key, count + 1);
    return true;
  }
  async getIdempotency(agentId: string, key: string) {
    return this.idempotency.get(agentId + ":" + key) ?? null;
  }
  async putIdempotency(agentId: string, key: string, requestHash: string, responseStatus: number, response: unknown) {
    const id = agentId + ":" + key;
    if (this.idempotency.has(id)) return false;
    this.idempotency.set(id, { requestHash, responseStatus, response });
    return true;
  }
  async ping() {}
}

const validIntent = {
  intentId: "api-intent-0001",
  agentId: "outlay-agent.testnet",
  policyId: "smoke-test",
  network: "near-testnet",
  assetId: "native-near",
  destination: "outlay-agent.testnet",
  amount: "25",
  nonce: "20",
  expiresAtNs: "1900000000000000000",
  createdAtNs: "1794200000000000000",
};

const chainSnapshot: ChainSnapshot = {
  agent: { agentId: "outlay-agent.testnet", enabled: true, policyId: "smoke-test" },
  policy: {
    policyId: "smoke-test",
    version: "1",
    enabled: true,
    expiresAtNs: "2000000000000000000",
    maxPerTransaction: "50",
    maxTotal: "100",
    reserved: "25",
    allowedDestinations: ["outlay-agent.testnet"],
  },
  blockHeight: 276884000,
  blockHash: "test-block-hash",
};

describe("Outlay API handler", () => {
  let store: MemoryStore;
  let chain: NearReader;
  let handler: ReturnType<typeof createApiHandler>;
  let apiKey: string;

  beforeEach(() => {
    store = new MemoryStore();
    const issued = issueAgentKey();
    apiKey = issued.secret;
    store.credentials.set(issued.keyHash, {
      agentId: "outlay-agent.testnet",
      keyHash: issued.keyHash,
      enabled: true,
    });
    chain = { async getAgentSnapshot() { return chainSnapshot; } };
    handler = createApiHandler({
      store,
      chain,
      contractId: "outlay-deployer.testnet",
      adminToken: "a".repeat(48),
      nowNs: () => "1794205682689443397",
      nowDate: () => new Date("2026-11-09T08:00:00.000Z"),
    });
  });

  const request = (path: string, init: RequestInit = {}) =>
    handler(new Request("https://api.outlay.test" + path, init));

  it("reports health without exposing secrets", async () => {
    const response = await request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", database: "reachable" });
  });

  it("returns advisory preflight and never claims final authorization", async () => {
    const response = await request("/v1/intents/preflight", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": "api-intent-0001",
      },
      body: JSON.stringify(validIntent),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "preflight_allowed",
      allowed: true,
      authorized: false,
      authority: "near_contract",
      remainingBudget: "50",
      chain: { blockHeight: 276884000 },
    });
  });

  it("replays the same idempotent response without another chain read", async () => {
    let reads = 0;
    chain = { async getAgentSnapshot() { reads += 1; return chainSnapshot; } };
    handler = createApiHandler({
      store, chain, contractId: "outlay-deployer.testnet", adminToken: "a".repeat(48),
      nowNs: () => "1794205682689443397",
      nowDate: () => new Date("2026-11-09T08:00:00.000Z"),
    });
    const init = {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": "api-intent-0002",
      },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0002" }),
    };
    const first = await request("/v1/intents/preflight", init);
    const second = await request("/v1/intents/preflight", init);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(reads).toBe(1);
  });

  it("rejects idempotency-key reuse with a different payload", async () => {
    const headers = {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
      "idempotency-key": "api-intent-0003",
    };
    await request("/v1/intents/preflight", {
      method: "POST", headers, body: JSON.stringify({ ...validIntent, intentId: "api-intent-0003" }),
    });
    const second = await request("/v1/intents/preflight", {
      method: "POST", headers, body: JSON.stringify({ ...validIntent, intentId: "api-intent-0003", amount: "26" }),
    });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("rejects an intent that claims another agent identity", async () => {
    const response = await request("/v1/intents/preflight", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": "api-intent-0004",
      },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0004", agentId: "other-agent.testnet" }),
    });
    expect(response.status).toBe(403);
  });

  it("rejects calls from disabled credentials", async () => {
    for (const credential of store.credentials.values()) credential.enabled = false;
    const response = await request("/v1/intents/preflight", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": "api-intent-0005",
      },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0005" }),
    });
    expect(response.status).toBe(401);
  });

  it("denies preflight if chain policy denies the destination", async () => {
    chain = { async getAgentSnapshot() {
      return { ...chainSnapshot, policy: { ...chainSnapshot.policy!, allowedDestinations: ["other.testnet"] } };
    } };
    handler = createApiHandler({
      store, chain, contractId: "outlay-deployer.testnet", adminToken: "a".repeat(48),
      nowNs: () => "1794205682689443397",
      nowDate: () => new Date("2026-11-09T08:00:00.000Z"),
    });
    const response = await request("/v1/intents/preflight", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": "api-intent-0006",
      },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0006" }),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "preflight_denied", reasonCode: "DESTINATION_DENIED", authorized: false });
  });

  it("issues keys only for enabled on-chain agents and returns them once", async () => {
    const response = await request("/v1/admin/agent-keys", {
      method: "POST",
      headers: { "x-outlay-admin-token": "a".repeat(48), "content-type": "application/json" },
      body: JSON.stringify({ agentId: "outlay-agent.testnet", rotate: true }),
    });
    expect(response.status).toBe(201);
    const body = await response.json() as { apiKey: string; shownOnce: boolean };
    expect(body.apiKey.startsWith("outlay_agent_")).toBe(true);
    expect(body.shownOnce).toBe(true);
    expect([...store.credentials.values()].some((item) => item.keyHash === body.apiKey)).toBe(false);
  });

  it("revokes all active agent keys through the admin route", async () => {
    const response = await request("/v1/admin/agent-keys/revoke", {
      method: "POST",
      headers: { "x-outlay-admin-token": "a".repeat(48), "content-type": "application/json" },
      body: JSON.stringify({ agentId: "outlay-agent.testnet" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ agentId: "outlay-agent.testnet", revoked: 1 });
    expect([...store.credentials.values()].every((item) => !item.enabled)).toBe(true);
  });

  it("fails closed when the chain snapshot is unavailable", async () => {
    chain = { async getAgentSnapshot() { throw new Error("rpc unavailable"); } };
    handler = createApiHandler({
      store, chain, contractId: "outlay-deployer.testnet", adminToken: "a".repeat(48),
      nowNs: () => "1794205682689443397",
      nowDate: () => new Date("2026-11-09T08:00:00.000Z"),
    });
    const response = await request("/v1/intents/preflight", {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "idempotency-key": "api-intent-0010",
      },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0010" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "CHAIN_SNAPSHOT_UNAVAILABLE", authorized: false });
  });

  it("rejects admin key issuance without the admin token", async () => {
    const response = await request("/v1/admin/agent-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "outlay-agent.testnet" }),
    });
    expect(response.status).toBe(401);
  });

  it("applies the per-agent request limit", async () => {
    handler = createApiHandler({
      store, chain, contractId: "outlay-deployer.testnet", adminToken: "a".repeat(48),
      rateLimitPerMinute: 1,
      nowNs: () => "1794205682689443397",
      nowDate: () => new Date("2026-11-09T08:00:00.000Z"),
    });
    const headers = {
      authorization: "Bearer " + apiKey,
      "content-type": "application/json",
    };
    const first = await request("/v1/intents/preflight", {
      method: "POST", headers: { ...headers, "idempotency-key": "api-intent-0007" },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0007" }),
    });
    const second = await request("/v1/intents/preflight", {
      method: "POST", headers: { ...headers, "idempotency-key": "api-intent-0008" },
      body: JSON.stringify({ ...validIntent, intentId: "api-intent-0008" }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("rejects an invalid or missing idempotency key", async () => {
    const response = await request("/v1/intents/preflight", {
      method: "POST",
      headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" },
      body: JSON.stringify(validIntent),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});
