import test from "node:test";
import assert from "node:assert/strict";
import { callView, decodeNearResult, encodeJsonArgs, parseNearJson, TESTNET_RPC, verifyDecisionReceipt } from "../src/near-rpc.js";

test("encodes JSON arguments as UTF-8 base64", () => {
  assert.equal(encodeJsonArgs({ policy_id: "smoke-test" }), "eyJwb2xpY3lfaWQiOiJzbW9rZS10ZXN0In0=");
  assert.equal(encodeJsonArgs({}), "e30=");
});

test("preserves large integer tokens exactly", () => {
  const parsed = parseNearJson('{"amount":340282366920938463463374607431768211455,"label":"amount 25","nonce":7}');
  assert.equal(parsed.amount, "340282366920938463463374607431768211455");
  assert.equal(parsed.nonce, "7");
  assert.equal(parsed.label, "amount 25");
});

test("decodes NEAR view return bytes", () => {
  const bytes = Array.from(new TextEncoder().encode('{"enabled":true,"max_total":100}'));
  assert.deepEqual(decodeNearResult(bytes), { enabled: true, max_total: "100" });
  assert.equal(decodeNearResult([]), null);
});

test("calls a finalized read-only NEAR contract method", async () => {
  let requestedUrl;
  let requestedBody;
  const fetchImpl = async (url, options) => {
    requestedUrl = url;
    requestedBody = JSON.parse(options.body);
    const bytes = Array.from(new TextEncoder().encode("1"));
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "outlay-dashboard",
      result: { result: bytes, logs: [], block_height: 123, block_hash: "block-hash" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const result = await callView("outlay-deployer.testnet", "get_decision_count", {}, fetchImpl);
  assert.equal(requestedUrl, TESTNET_RPC);
  assert.equal(requestedBody.params.request_type, "call_function");
  assert.equal(requestedBody.params.finality, "final");
  assert.equal(requestedBody.params.account_id, "outlay-deployer.testnet");
  assert.equal(requestedBody.params.method_name, "get_decision_count");
  assert.equal(result.value, "1");
  assert.equal(result.blockHeight, 123);
});


test("verifies receipt fields without claiming cryptographic proof", () => {
  const decision = {
    decision_id: "outlay:100:1",
    agent_id: "agent.testnet",
    policy_id: "daily",
    amount: "25",
    policy_version: "1",
    intent_expires_at_ns: "900",
    policy_expires_at_ns: "1000",
    authorized_at_ns: "500",
    cumulative_spend: "25",
    nonce: "4",
  };
  const expected = {
    decisionId: "outlay:100:1",
    agentId: "agent.testnet",
    policyId: "daily",
    currentPolicyVersion: "2",
  };
  assert.equal(verifyDecisionReceipt(decision, expected).valid, true);
  assert.equal(verifyDecisionReceipt({ ...decision, amount: "0" }, expected).valid, false);
  assert.equal(verifyDecisionReceipt({ ...decision, agent_id: "attacker.testnet" }, expected).valid, false);
});

test("rejects malformed expiry and future policy version in receipt checks", () => {
  const decision = {
    decision_id: "outlay:100:1", agent_id: "agent.testnet", policy_id: "daily",
    amount: "25", policy_version: "9", intent_expires_at_ns: "bad",
    policy_expires_at_ns: "1000", authorized_at_ns: "500",
    cumulative_spend: "25", nonce: "4",
  };
  const result = verifyDecisionReceipt(decision, {
    decisionId: "outlay:100:1", agentId: "agent.testnet", policyId: "daily", currentPolicyVersion: "2",
  });
  assert.equal(result.valid, false);
});


test("pins follow-up view calls to the selected finalized block hash", async () => {
  let requestedBody;
  const fetchImpl = async (_url, options) => {
    requestedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "outlay-dashboard",
      result: {
        result: Array.from(new TextEncoder().encode("1")),
        logs: [],
        block_height: 123,
        block_hash: "pinned-block-hash",
      },
    }), { status: 200 });
  };
  await callView("outlay-deployer.testnet", "get_decision_count", {}, fetchImpl, "pinned-block-hash");
  assert.equal(requestedBody.params.block_id, "pinned-block-hash");
  assert.equal("finality" in requestedBody.params, false);
});


test("reads reservation release state from a pinned finalized block", async () => {
  let requestedBody;
  const fetchImpl = async (_url, options) => {
    requestedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "outlay-dashboard",
      result: {
        result: Array.from(new TextEncoder().encode("true")),
        logs: [],
        block_height: 123,
        block_hash: "pinned-block-hash",
      },
    }), { status: 200 });
  };
  const result = await callView(
    "outlay-deployer.testnet",
    "is_reservation_released",
    { decision_id: "outlay:123:1" },
    fetchImpl,
    "pinned-block-hash",
  );
  assert.equal(result.value, true);
  assert.equal(requestedBody.params.method_name, "is_reservation_released");
  assert.equal(requestedBody.params.block_id, "pinned-block-hash");
});
