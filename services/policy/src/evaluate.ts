import type { SpendIntent } from "./intent.js";

export type PolicySnapshot = {
  policyId: string;
  version: string;
  enabled: boolean;
  expiresAtNs: string;
  maxPerTransaction: string;
  maxTotal: string;
  reserved: string;
  allowedDestinations: readonly string[];
};

export type AgentSnapshot = {
  agentId: string;
  enabled: boolean;
  policyId: string;
};

export type PreflightResult =
  | { allowed: true; reasonCode: "PREFLIGHT_ALLOWED"; remainingBudget: string }
  | { allowed: false; reasonCode: string };

const uint = /^(0|[1-9][0-9]*)$/;

function parseUint(value: string, field: string): bigint {
  if (!uint.test(value)) throw new Error(`INVALID_UINT:${field}`);
  return BigInt(value);
}

/**
 * Advisory deterministic preflight. This never replaces contract enforcement.
 * It deliberately returns denial for stale/mismatched snapshots.
 */
export function evaluatePreflight(
  intent: SpendIntent,
  agent: AgentSnapshot | null,
  policy: PolicySnapshot | null,
  nowNs: string,
): PreflightResult {
  if (!agent) return { allowed: false, reasonCode: "AGENT_UNKNOWN" };
  if (!agent.enabled) return { allowed: false, reasonCode: "AGENT_DISABLED" };
  if (agent.agentId !== intent.agentId) return { allowed: false, reasonCode: "AGENT_MISMATCH" };
  if (agent.policyId !== intent.policyId) return { allowed: false, reasonCode: "POLICY_BINDING_MISMATCH" };
  if (!policy) return { allowed: false, reasonCode: "POLICY_UNKNOWN" };
  if (policy.policyId !== intent.policyId) return { allowed: false, reasonCode: "POLICY_MISMATCH" };
  if (!policy.enabled) return { allowed: false, reasonCode: "POLICY_DISABLED" };

  const now = parseUint(nowNs, "nowNs");
  const intentExpiry = parseUint(intent.expiresAtNs, "intent.expiresAtNs");
  const policyExpiry = parseUint(policy.expiresAtNs, "policy.expiresAtNs");
  const amount = parseUint(intent.amount, "intent.amount");
  const perTx = parseUint(policy.maxPerTransaction, "policy.maxPerTransaction");
  const maxTotal = parseUint(policy.maxTotal, "policy.maxTotal");
  const reserved = parseUint(policy.reserved, "policy.reserved");

  if (now >= intentExpiry) return { allowed: false, reasonCode: "INTENT_EXPIRED" };
  if (now >= policyExpiry) return { allowed: false, reasonCode: "POLICY_EXPIRED" };
  if (intentExpiry > policyExpiry) return { allowed: false, reasonCode: "INTENT_OUTLIVES_POLICY" };
  if (amount === 0n) return { allowed: false, reasonCode: "AMOUNT_ZERO" };
  if (amount > perTx) return { allowed: false, reasonCode: "TX_LIMIT_EXCEEDED" };
  if (!policy.allowedDestinations.includes(intent.destination)) {
    return { allowed: false, reasonCode: "DESTINATION_DENIED" };
  }

  const nextSpend = reserved + amount;
  if (nextSpend > maxTotal) return { allowed: false, reasonCode: "BUDGET_EXCEEDED" };

  return {
    allowed: true,
    reasonCode: "PREFLIGHT_ALLOWED",
    remainingBudget: (maxTotal - nextSpend).toString(),
  };
}
