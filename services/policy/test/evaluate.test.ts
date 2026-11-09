import { describe, expect, it } from "vitest";
import { evaluatePreflight, type AgentSnapshot, type PolicySnapshot } from "../src/evaluate.js";
import { parseSpendIntent } from "../src/intent.js";

const intent = parseSpendIntent({
  intentId: "intent-1",
  agentId: "agent.testnet",
  policyId: "daily",
  network: "near-testnet",
  assetId: "native-near",
  destination: "merchant.testnet",
  amount: "40",
  nonce: "1",
  expiresAtNs: "500",
  createdAtNs: "100",
});
const agent: AgentSnapshot = { agentId: "agent.testnet", enabled: true, policyId: "daily" };
const policy: PolicySnapshot = {
  policyId: "daily",
  version: "1",
  enabled: true,
  expiresAtNs: "1000",
  maxPerTransaction: "60",
  maxTotal: "100",
  spent: "20",
  allowedDestinations: ["merchant.testnet"],
};

describe("evaluatePreflight", () => {
  it("allows in-scope spend and returns exact remaining budget", () => {
    expect(evaluatePreflight(intent, agent, policy, "200")).toEqual({
      allowed: true, reasonCode: "PREFLIGHT_ALLOWED", remainingBudget: "40",
    });
  });

  it("fails closed when agent snapshot is missing", () => {
    expect(evaluatePreflight(intent, null, policy, "200")).toEqual({
      allowed: false, reasonCode: "AGENT_UNKNOWN",
    });
  });

  it("denies a destination outside policy", () => {
    const altered = parseSpendIntent({ ...intent, destination: "attacker.testnet" });
    expect(evaluatePreflight(altered, agent, policy, "200")).toEqual({
      allowed: false, reasonCode: "DESTINATION_DENIED",
    });
  });

  it("denies total budget overflow", () => {
    expect(evaluatePreflight(intent, agent, { ...policy, spent: "70" }, "200")).toEqual({
      allowed: false, reasonCode: "BUDGET_EXCEEDED",
    });
  });

  it("denies expired intent", () => {
    expect(evaluatePreflight(intent, agent, policy, "500")).toEqual({
      allowed: false, reasonCode: "INTENT_EXPIRED",
    });
  });

  it("uses bigint math for values above JavaScript safe integer", () => {
    const huge = parseSpendIntent({ ...intent, amount: "9007199254740993" });
    const hugePolicy = { ...policy, maxPerTransaction: "9007199254740993", maxTotal: "9007199254740993", spent: "0" };
    expect(evaluatePreflight(huge, agent, hugePolicy, "200")).toMatchObject({
      allowed: true, remainingBudget: "0",
    });
  });
});
