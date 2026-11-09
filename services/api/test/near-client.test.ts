import { describe, expect, it } from "vitest";
import { NearRpcReader } from "../src/near-client.js";

function responseFor(json: string, blockHash = "block-42", blockHeight = 42) {
  const bytes = Array.from(new TextEncoder().encode(json));
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: "outlay-api",
    result: { result: bytes, block_height: blockHeight, block_hash: blockHash },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("NearRpcReader", () => {
  it("reads grant, policy, version, and reserved budget at one finalized block", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const payloads = [
      '{"enabled":true,"policy_id":"daily"}',
      '{"enabled":true,"expires_at_ns":2000000000000000000,"max_per_transaction":50,"max_total":100,"allowed_destinations":["merchant.testnet"]}',
      "1",
      "25",
      "false",
      "false",
    ];
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { params: Record<string, unknown> };
      requests.push(body.params);
      const next = payloads.shift();
      if (!next) throw new Error("unexpected extra RPC request");
      return responseFor(next);
    };
    const reader = new NearRpcReader("https://rpc.testnet.fastnear.com", fetchImpl);
    const snapshot = await reader.getAgentSnapshot("outlay-deployer.testnet", "agent.testnet", "intent-001", "9");

    expect(snapshot.agent).toEqual({ agentId: "agent.testnet", enabled: true, policyId: "daily" });
    expect(snapshot.policy).toEqual({
      policyId: "daily",
      version: "1",
      enabled: true,
      expiresAtNs: "2000000000000000000",
      maxPerTransaction: "50",
      maxTotal: "100",
      reserved: "25",
      allowedDestinations: ["merchant.testnet"],
    });
    expect(snapshot.blockHeight).toBe(42);
    expect(snapshot.blockHash).toBe("block-42");
    expect(snapshot.nonceConsumed).toBe(false);
    expect(snapshot.intentConsumed).toBe(false);
    expect(requests).toHaveLength(6);
    expect(requests.slice(1).every((params) => params.block_id === "block-42")).toBe(true);
  });

  it("fails closed when RPC responses do not share the pinned block", async () => {
    let call = 0;
    const payloads = [
      '{"enabled":true,"policy_id":"daily"}',
      '{"enabled":true,"expires_at_ns":2000,"max_per_transaction":50,"max_total":100,"allowed_destinations":["merchant.testnet"]}',
      "1",
      "25",
      "false",
      "false",
    ];
    const fetchImpl: typeof fetch = async () => {
      const index = call++;
      const next = payloads[index];
      return responseFor(next ?? "null", index === 5 ? "different-block" : "block-42");
    };
    const reader = new NearRpcReader("https://rpc.testnet.fastnear.com", fetchImpl);
    await expect(reader.getAgentSnapshot("outlay-deployer.testnet", "agent.testnet", "intent-002", "10"))
      .rejects.toThrow("INCONSISTENT_NEAR_SNAPSHOT");
  });

  it("returns an unregistered agent without attempting policy reads", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      return responseFor("null");
    };
    const reader = new NearRpcReader("https://rpc.testnet.fastnear.com", fetchImpl);
    const snapshot = await reader.getAgentSnapshot("outlay-deployer.testnet", "unknown.testnet", "intent-003", "11");
    expect(snapshot.agent).toBeNull();
    expect(snapshot.policy).toBeNull();
    expect(calls).toBe(1);
  });

  it("rejects non-HTTPS RPC endpoints outside localhost", () => {
    expect(() => new NearRpcReader("http://rpc.example.com")).toThrow("NEAR_RPC_MUST_USE_HTTPS");
  });
});
