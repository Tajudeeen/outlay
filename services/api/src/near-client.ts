import type { AgentSnapshot, PolicySnapshot } from "@outlay/policy";
import { parseNearJson } from "./near-json.js";

export type ChainSnapshot = {
  agent: AgentSnapshot | null;
  policy: PolicySnapshot | null;
  blockHeight: number;
  blockHash: string;
};

export interface NearReader {
  getAgentSnapshot(contractId: string, agentId: string): Promise<ChainSnapshot>;
}

type RpcEnvelope = {
  error?: { message?: string };
  result?: {
    result?: number[];
    block_height?: number;
    block_hash?: string;
    error?: string;
  };
};

const accountIdPattern = /^[a-z0-9._-]{2,64}$/;

export class NearRpcReader implements NearReader {
  constructor(
    private readonly rpcUrl = "https://rpc.testnet.fastnear.com",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const parsed = new URL(rpcUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("NEAR_RPC_MUST_USE_HTTPS");
    }
  }

  async getAgentSnapshot(contractId: string, agentId: string): Promise<ChainSnapshot> {
    if (!accountIdPattern.test(contractId) || !accountIdPattern.test(agentId)) {
      throw new Error("INVALID_NEAR_ACCOUNT_ID");
    }

    const grantResult = await this.callView(contractId, "get_agent_grant", { agent_id: agentId });
    const grant = grantResult.value as { enabled?: unknown; policy_id?: unknown } | null;
    if (!grant || typeof grant.enabled !== "boolean" || typeof grant.policy_id !== "string") {
      return {
        agent: null,
        policy: null,
        blockHeight: grantResult.blockHeight,
        blockHash: grantResult.blockHash,
      };
    }

    const [policyResult, versionResult, spendResult] = await Promise.all([
      this.callView(contractId, "get_policy", { policy_id: grant.policy_id }, grantResult.blockHash),
      this.callView(contractId, "get_policy_version", { policy_id: grant.policy_id }, grantResult.blockHash),
      this.callView(contractId, "get_policy_spend", { policy_id: grant.policy_id }, grantResult.blockHash),
    ]);

    if (
      policyResult.blockHash !== grantResult.blockHash
      || versionResult.blockHash !== grantResult.blockHash
      || spendResult.blockHash !== grantResult.blockHash
      || policyResult.blockHeight !== grantResult.blockHeight
      || versionResult.blockHeight !== grantResult.blockHeight
      || spendResult.blockHeight !== grantResult.blockHeight
    ) {
      throw new Error("INCONSISTENT_NEAR_SNAPSHOT");
    }

    const rawPolicy = policyResult.value as {
      enabled?: unknown;
      expires_at_ns?: unknown;
      max_per_transaction?: unknown;
      max_total?: unknown;
      allowed_destinations?: unknown;
    } | null;

    const policy: PolicySnapshot | null = rawPolicy
      && typeof rawPolicy.enabled === "boolean"
      && typeof rawPolicy.expires_at_ns === "string"
      && typeof rawPolicy.max_per_transaction === "string"
      && typeof rawPolicy.max_total === "string"
      && Array.isArray(rawPolicy.allowed_destinations)
      && rawPolicy.allowed_destinations.every((value) => typeof value === "string")
      && typeof versionResult.value === "string"
      && typeof spendResult.value === "string"
      ? {
          policyId: grant.policy_id,
          version: versionResult.value,
          enabled: rawPolicy.enabled,
          expiresAtNs: rawPolicy.expires_at_ns,
          maxPerTransaction: rawPolicy.max_per_transaction,
          maxTotal: rawPolicy.max_total,
          reserved: spendResult.value,
          allowedDestinations: rawPolicy.allowed_destinations,
        }
      : null;

    return {
      agent: { agentId, enabled: grant.enabled, policyId: grant.policy_id },
      policy,
      blockHeight: grantResult.blockHeight,
      blockHash: grantResult.blockHash,
    };
  }

  private async callView(
    contractId: string,
    methodName: string,
    args: Record<string, string>,
    blockHash?: string,
  ): Promise<{ value: unknown; blockHeight: number; blockHash: string }> {
    const bytes = new TextEncoder().encode(JSON.stringify(args));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    const response = await this.fetchImpl(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "outlay-api",
        method: "query",
        params: {
          request_type: "call_function",
          ...(blockHash ? { block_id: blockHash } : { finality: "final" }),
          account_id: contractId,
          method_name: methodName,
          args_base64: btoa(binary),
        },
      }),
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new Error("NEAR_RPC_HTTP_" + response.status);

    const envelope = await response.json() as RpcEnvelope;
    if (envelope.error) throw new Error(envelope.error.message || "NEAR_RPC_ERROR");
    if (envelope.result?.error) throw new Error("NEAR_VIEW_ERROR");
    const result = envelope.result;
    if (!result || !Array.isArray(result.result) || typeof result.block_height !== "number" || typeof result.block_hash !== "string") {
      throw new Error("INVALID_NEAR_RPC_RESPONSE");
    }
    const decoded = new TextDecoder().decode(Uint8Array.from(result.result));
    const value = decoded.length ? parseNearJson(decoded) : null;
    return { value, blockHeight: result.block_height, blockHash: result.block_hash };
  }
}
