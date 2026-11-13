const ACCOUNT_ID = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const MAX_DESTINATIONS = 32;
const GAS = "50000000000000";

function assertAccountId(value, label) {
  if (typeof value !== "string" || value.length < 2 || value.length > 64 || !ACCOUNT_ID.test(value)) {
    throw new Error(label + "_INVALID");
  }
}

function assertUint(value, label, allowZero = false) {
  if (typeof value !== "string" || !UINT.test(value) || (!allowZero && value === "0")) {
    throw new Error(label + "_INVALID");
  }
}

export function validatePolicy(policyId, policy) {
  if (typeof policyId !== "string" || policyId.length < 1 || policyId.length > 128
    || !/^[a-zA-Z0-9._-]+$/.test(policyId)) throw new Error("POLICY_ID_INVALID");
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new Error("POLICY_INVALID");
  if (typeof policy.enabled !== "boolean") throw new Error("POLICY_ENABLED_INVALID");
  assertUint(policy.expires_at_ns, "POLICY_EXPIRY");
  assertUint(policy.max_per_transaction, "POLICY_TX_LIMIT");
  assertUint(policy.max_total, "POLICY_BUDGET");
  if (BigInt(policy.max_total) < BigInt(policy.max_per_transaction)) throw new Error("POLICY_BUDGET_TOO_LOW");
  if (!Array.isArray(policy.allowed_destinations) || policy.allowed_destinations.length < 1
    || policy.allowed_destinations.length > MAX_DESTINATIONS) throw new Error("POLICY_DESTINATIONS_INVALID");
  for (const destination of policy.allowed_destinations) assertAccountId(destination, "DESTINATION");
  if (new Set(policy.allowed_destinations).size !== policy.allowed_destinations.length) {
    throw new Error("POLICY_DESTINATIONS_DUPLICATE");
  }
  return {
    enabled: policy.enabled,
    expires_at_ns: policy.expires_at_ns,
    max_per_transaction: policy.max_per_transaction,
    max_total: policy.max_total,
    allowed_destinations: [...policy.allowed_destinations],
  };
}

/**
 * Owner-only NEAR testnet transaction adapter.
 * It never holds keys. The connected wallet signs every function call.
 * A returned wallet outcome is not treated as finalized state. Refresh views
 * at finality before presenting a mutation as complete.
 */
export function createAdminClient({ wallet, accountId, ownerId, networkId, contractId }) {
  if (!wallet || typeof wallet.signAndSendTransaction !== "function") throw new Error("WALLET_UNAVAILABLE");
  assertAccountId(accountId, "WALLET_ACCOUNT");
  assertAccountId(ownerId, "CONTRACT_OWNER");
  assertAccountId(contractId, "CONTRACT_ID");
  if (networkId !== "testnet") throw new Error("WRONG_NETWORK");
  if (accountId !== ownerId) throw new Error("OWNER_ONLY");

  async function send(methodName, args) {
    return wallet.signAndSendTransaction({
      receiverId: contractId,
      actions: [{
        type: "FunctionCall",
        params: {
          methodName,
          args,
          gas: GAS,
          deposit: "0",
        },
      }],
    });
  }

  return Object.freeze({
    setPolicy(policyId, policy) {
      const safePolicy = validatePolicy(policyId, policy);
      return send("set_policy", { policy_id: policyId, policy: safePolicy });
    },
    registerAgent(agentId, policyId) {
      assertAccountId(agentId, "AGENT_ID");
      if (typeof policyId !== "string" || policyId.length < 1 || policyId.length > 128
        || !/^[a-zA-Z0-9._-]+$/.test(policyId)) throw new Error("POLICY_ID_INVALID");
      return send("register_agent", { agent_id: agentId, policy_id: policyId });
    },
    setAgentEnabled(agentId, enabled) {
      assertAccountId(agentId, "AGENT_ID");
      if (typeof enabled !== "boolean") throw new Error("AGENT_ENABLED_INVALID");
      return send("set_agent_enabled", { agent_id: agentId, enabled });
    },
  });
}
