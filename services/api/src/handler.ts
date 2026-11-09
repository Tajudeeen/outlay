import { createHash, timingSafeEqual } from "node:crypto";
import {
  authenticateAgent,
  evaluatePreflight,
  issueAgentKey,
  parseSpendIntent,
} from "@outlay/policy";
import type { NearReader } from "./near-client.js";
import type { OutlayStore } from "./store.js";

const MAX_BODY_BYTES = 16 * 1024;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_ID = /^[a-z0-9._-]{2,64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

type ApiDependencies = {
  store: OutlayStore;
  chain: NearReader;
  contractId: string;
  adminToken: string;
  rateLimitPerMinute?: number;
  nowNs?: () => string;
  nowDate?: () => Date;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("JSON_CONTENT_TYPE_REQUIRED");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
  try { return JSON.parse(text) as unknown; }
  catch { throw new Error("INVALID_JSON"); }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function createApiHandler(deps: ApiDependencies): (request: Request) => Promise<Response> {
  const nowNs = deps.nowNs ?? (() => (BigInt(Date.now()) * 1_000_000n).toString());
  const nowDate = deps.nowDate ?? (() => new Date());
  const rateLimit = deps.rateLimitPerMinute ?? 60;

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      try {
        await deps.store.ping();
        return json(200, { status: "ok", service: "outlay-api", database: "reachable" });
      } catch {
        return json(503, { status: "unavailable", code: "DATABASE_UNAVAILABLE" });
      }
    }

    if (request.method === "POST" && url.pathname === "/v1/admin/agent-keys") {
      const supplied = request.headers.get("x-outlay-admin-token") ?? "";
      if (!deps.adminToken || !secureEqual(supplied, deps.adminToken)) {
        return json(401, { error: "UNAUTHORIZED" });
      }
      let body: unknown;
      try { body = await readJson(request); }
      catch (error) {
        return json(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, {
          error: error instanceof Error ? error.message : "INVALID_REQUEST",
        });
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "INVALID_BODY" });
      const record = body as Record<string, unknown>;
      if (typeof record.agentId !== "string" || !ACCOUNT_ID.test(record.agentId)
        || (record.rotate !== undefined && typeof record.rotate !== "boolean")) {
        return json(400, { error: "INVALID_AGENT_KEY_REQUEST" });
      }
      try {
        const snapshot = await deps.chain.getAgentSnapshot(deps.contractId, record.agentId, "", "0");
        if (!snapshot.agent || !snapshot.agent.enabled) return json(409, { error: "AGENT_NOT_ENABLED_ON_CHAIN" });
        const issued = issueAgentKey();
        await deps.store.issueCredential(record.agentId, issued.keyHash, record.rotate === true);
        return json(201, {
          agentId: record.agentId,
          apiKey: issued.secret,
          shownOnce: true,
          warning: "Store this key securely. It cannot be retrieved again.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "KEY_ISSUANCE_FAILED";
        if (message === "ACTIVE_KEY_EXISTS_USE_ROTATE") return json(409, { error: message });
        return json(503, { error: "KEY_ISSUANCE_UNAVAILABLE" });
      }
    }

    if (request.method === "POST" && url.pathname === "/v1/admin/agent-keys/revoke") {
      const supplied = request.headers.get("x-outlay-admin-token") ?? "";
      if (!deps.adminToken || !secureEqual(supplied, deps.adminToken)) return json(401, { error: "UNAUTHORIZED" });
      let body: unknown;
      try { body = await readJson(request); }
      catch (error) {
        return json(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, {
          error: error instanceof Error ? error.message : "INVALID_REQUEST",
        });
      }
      const agentId = body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).agentId
        : null;
      if (typeof agentId !== "string" || !ACCOUNT_ID.test(agentId)) return json(400, { error: "INVALID_AGENT_ID" });
      try {
        const revoked = await deps.store.revokeCredentials(agentId);
        return json(200, { agentId, revoked });
      } catch {
        return json(503, { error: "REVOCATION_UNAVAILABLE" });
      }
    }

    if (request.method === "POST" && url.pathname === "/v1/intents/preflight") {
      const identity = await authenticateAgent(request.headers.get("authorization") ?? undefined, deps.store);
      if (!identity) return json(401, { error: "INVALID_AGENT_CREDENTIAL" });

      let body: unknown;
      try { body = await readJson(request); }
      catch (error) {
        return json(error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413 : 400, {
          error: error instanceof Error ? error.message : "INVALID_REQUEST",
        });
      }

      let intent;
      try { intent = parseSpendIntent(body); }
      catch { return json(400, { error: "INVALID_SPEND_INTENT" }); }
      if (intent.agentId !== identity.agentId) return json(403, { error: "AGENT_IDENTITY_MISMATCH" });

      const idempotencyKey = request.headers.get("idempotency-key") ?? "";
      if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
        return json(400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
      }

      const requestHash = hash(intent);
      try {
        const existing = await deps.store.getIdempotency(identity.agentId, idempotencyKey);
        if (existing) {
          if (existing.requestHash !== requestHash) return json(409, { error: "IDEMPOTENCY_KEY_REUSED" });
          return json(existing.responseStatus, existing.response);
        }
      } catch {
        return json(503, { error: "IDEMPOTENCY_STORE_UNAVAILABLE" });
      }

      const now = nowDate();
      const windowStart = Math.floor(now.getTime() / 60_000);
      try {
        const allowed = await deps.store.consumeRateLimit(identity.agentId, windowStart, rateLimit);
        if (!allowed) return json(429, { error: "RATE_LIMITED", retryAfterSeconds: 60 - Math.floor((now.getTime() % 60_000) / 1000) });
      } catch {
        return json(503, { error: "RATE_LIMIT_STORE_UNAVAILABLE" });
      }

      let snapshot;
      try { snapshot = await deps.chain.getAgentSnapshot(deps.contractId, identity.agentId, intent.intentId, intent.nonce); }
      catch {
        return json(503, { error: "CHAIN_SNAPSHOT_UNAVAILABLE", authorized: false });
      }

      const result = snapshot.nonceConsumed
        ? { allowed: false as const, reasonCode: "NONCE_REPLAY" }
        : snapshot.intentConsumed
          ? { allowed: false as const, reasonCode: "INTENT_REPLAY" }
          : evaluatePreflight(intent, snapshot.agent, snapshot.policy, nowNs());
      const response = {
        intentId: intent.intentId,
        agentId: intent.agentId,
        status: result.allowed ? "preflight_allowed" : "preflight_denied",
        allowed: result.allowed,
        authorized: false,
        authority: "near_contract",
        reasonCode: result.reasonCode,
        ...(result.allowed ? { remainingBudget: result.remainingBudget } : {}),
        observedAtNs: nowNs(),
        chain: { blockHeight: snapshot.blockHeight, blockHash: snapshot.blockHash },
        nextStep: result.allowed
          ? "Submit authorize_spend to the NEAR contract from the registered agent account. This API does not sign or submit transactions."
          : "Review the denial reason and current on-chain policy before creating another intent.",
      };
      const status = result.allowed ? 200 : 422;

      try {
        const inserted = await deps.store.putIdempotency(
          identity.agentId,
          idempotencyKey,
          requestHash,
          status,
          response,
          new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        );
        if (!inserted) {
          const raced = await deps.store.getIdempotency(identity.agentId, idempotencyKey);
          if (raced && raced.requestHash !== requestHash) return json(409, { error: "IDEMPOTENCY_KEY_REUSED" });
          if (raced) return json(raced.responseStatus, raced.response);
        }
      } catch {
        return json(503, { error: "IDEMPOTENCY_STORE_UNAVAILABLE" });
      }
      return json(status, response);
    }

    return json(404, { error: "NOT_FOUND" });
  };
}
