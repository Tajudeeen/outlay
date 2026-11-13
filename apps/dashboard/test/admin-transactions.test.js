import test from "node:test";
import assert from "node:assert/strict";
import { createAdminClient, validatePolicy } from "../src/admin-transactions.js";

const policy = {
  enabled: true,
  expires_at_ns: "2000000000000000000",
  max_per_transaction: "25",
  max_total: "100",
  allowed_destinations: ["merchant.testnet"],
};

function client(overrides = {}) {
  const calls = [];
  const wallet = {
    async signAndSendTransaction(tx) {
      calls.push(tx);
      return { transaction: { hash: "wallet-returned-hash" } };
    },
  };
  return {
    calls,
    admin: createAdminClient({
      wallet, accountId: "owner.testnet", ownerId: "owner.testnet",
      networkId: "testnet", contractId: "outlay-deployer.testnet",
      ...overrides,
    }),
  };
}

test("owner can submit a policy update through the connected wallet", async () => {
  const { admin, calls } = client();
  const result = await admin.setPolicy("daily-spend", policy);
  assert.equal(result.transaction.hash, "wallet-returned-hash");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receiverId, "outlay-deployer.testnet");
  assert.deepEqual(calls[0].actions[0], {
    type: "FunctionCall",
    params: {
      methodName: "set_policy",
      args: { policy_id: "daily-spend", policy },
      gas: "50000000000000",
      deposit: "0",
    },
  });
});

test("owner can register and disable an agent", async () => {
  const { admin, calls } = client();
  await admin.registerAgent("worker.testnet", "daily-spend");
  await admin.setAgentEnabled("worker.testnet", false);
  assert.deepEqual(calls.map((call) => call.actions[0].params), [
    { methodName: "register_agent", args: { agent_id: "worker.testnet", policy_id: "daily-spend" }, gas: "50000000000000", deposit: "0" },
    { methodName: "set_agent_enabled", args: { agent_id: "worker.testnet", enabled: false }, gas: "50000000000000", deposit: "0" },
  ]);
});

test("rejects non-owner, wrong network, and missing wallet before signing", () => {
  const wallet = { signAndSendTransaction: async () => ({}) };
  assert.throws(() => createAdminClient({
    wallet, accountId: "attacker.testnet", ownerId: "owner.testnet",
    networkId: "testnet", contractId: "outlay-deployer.testnet",
  }), /OWNER_ONLY/);
  assert.throws(() => createAdminClient({
    wallet, accountId: "owner.testnet", ownerId: "owner.testnet",
    networkId: "mainnet", contractId: "outlay-deployer.testnet",
  }), /WRONG_NETWORK/);
  assert.throws(() => createAdminClient({
    accountId: "owner.testnet", ownerId: "owner.testnet",
    networkId: "testnet", contractId: "outlay-deployer.testnet",
  }), /WALLET_UNAVAILABLE/);
});

test("validates policy limits and destination scope before wallet approval", () => {
  assert.deepEqual(validatePolicy("daily-spend", policy), policy);
  assert.throws(() => validatePolicy("bad/id", policy), /POLICY_ID_INVALID/);
  assert.throws(() => validatePolicy("daily", { ...policy, max_total: "10" }), /POLICY_BUDGET_TOO_LOW/);
  assert.throws(() => validatePolicy("daily", { ...policy, allowed_destinations: [] }), /POLICY_DESTINATIONS_INVALID/);
  assert.throws(() => validatePolicy("daily", { ...policy, max_per_transaction: 0 }), /POLICY_TX_LIMIT_INVALID/);
  assert.throws(() => validatePolicy("daily", { ...policy, allowed_destinations: ["merchant.testnet", "merchant.testnet"] }), /POLICY_DESTINATIONS_DUPLICATE/);
});

test("rejects malformed agent input without calling the wallet", async () => {
  const { admin, calls } = client();
  assert.throws(() => admin.registerAgent("not an account", "daily"), /AGENT_ID_INVALID/);
  assert.throws(() => admin.setAgentEnabled("worker.testnet", "false"), /AGENT_ENABLED_INVALID/);
  assert.equal(calls.length, 0);
});
