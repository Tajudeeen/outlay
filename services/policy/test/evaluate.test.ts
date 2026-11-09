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
  reserved: "20",
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
    expect(evaluatePreflight(intent, agent, { ...policy, reserved: "70" }, "200")).toEqual({
      allowed: false, reasonCode: "BUDGET_EXCEEDED",
    });
  });

  it("denies expired intent", () => {
    expect(evaluatePreflight(intent, agent, policy, "500")).toEqual({
      allowed: false, reasonCode: "INTENT_EXPIRED",
    });
  });

  it("denies intents created in the future", () => {
    const future = parseSpendIntent({ ...intent, createdAtNs: "201" });
    expect(evaluatePreflight(future, agent, policy, "200")).toEqual({
      allowed: false, reasonCode: "INTENT_FROM_FUTURE",
    });
  });

  it("denies invalid intent time windows", () => {
    const invalid = parseSpendIntent({ ...intent, createdAtNs: "500" });
    expect(evaluatePreflight(invalid, agent, policy, "200")).toEqual({
      allowed: false, reasonCode: "INVALID_INTENT_WINDOW",
    });
  });

  it("uses bigint math for values above JavaScript safe integer", () => {
    const huge = parseSpendIntent({ ...intent, amount: "9007199254740993" });
    const hugePolicy = { ...policy, maxPerTransaction: "9007199254740993", maxTotal: "9007199254740993", reserved: "0" };
    expect(evaluatePreflight(huge, agent, hugePolicy, "200")).toMatchObject({
      allowed: true, remainingBudget: "0",
    });
  });

  it("denies disabled agents", () => {
    expect(evaluatePreflight(intent, { ...agent, enabled: false }, policy, "200")).toEqual({
      allowed: false, reasonCode: "AGENT_DISABLED",
    });
  });

  it("denies agent identity and policy binding mismatches", () => {
    expect(evaluatePreflight(intent, { ...agent, agentId: "other.testnet" }, policy, "200")).toEqual({
      allowed: false, reasonCode: "AGENT_MISMATCH",
    });
    expect(evaluatePreflight(intent, { ...agent, policyId: "other-policy" }, policy, "200")).toEqual({
      allowed: false, reasonCode: "POLICY_BINDING_MISMATCH",
    });
  });

  it("denies a disabled policy and a mismatched policy snapshot", () => {
    expect(evaluatePreflight(intent, agent, { ...policy, enabled: false }, "200")).toEqual({
      allowed: false, reasonCode: "POLICY_DISABLED",
    });
    expect(evaluatePreflight(intent, agent, { ...policy, policyId: "other-policy" }, "200")).toEqual({
      allowed: false, reasonCode: "POLICY_MISMATCH",
    });
  });

  it("denies a policy that has expired", () => {
    expect(evaluatePreflight(intent, agent, { ...policy, expiresAtNs: "200" }, "200")).toEqual({
      allowed: false, reasonCode: "POLICY_EXPIRED",
    });
  });

  it("denies an intent that outlives its policy", () => {
    const longIntent = parseSpendIntent({ ...intent, expiresAtNs: "1001" });
    expect(evaluatePreflight(longIntent, agent, policy, "200")).toEqual({
      allowed: false, reasonCode: "INTENT_OUTLIVES_POLICY",
    });
  });

  it("denies zero and over-limit amounts", () => {
    const zero = parseSpendIntent({ ...intent, amount: "0" });
    expect(evaluatePreflight(zero, agent, policy, "200")).toEqual({
      allowed: false, reasonCode: "AMOUNT_ZERO",
    });
    const tooLarge = parseSpendIntent({ ...intent, amount: "61" });
    expect(evaluatePreflight(tooLarge, agent, policy, "200")).toEqual({
      allowed: false, reasonCode: "TX_LIMIT_EXCEEDED",
    });
  });

  it("fails closed for malformed numeric inputs and inconsistent snapshots", () => {
    expect(evaluatePreflight(intent, agent, { ...policy, reserved: "not-a-number" }, "200")).toEqual({
      allowed: false, reasonCode: "INVALID_NUMERIC_INPUT",
    });
    expect(evaluatePreflight(intent, agent, { ...policy, version: "0" }, "200")).toEqual({
      allowed: false, reasonCode: "INVALID_POLICY_SNAPSHOT",
    });
    expect(evaluatePreflight(intent, agent, { ...policy, reserved: "101" }, "200")).toEqual({
      allowed: false, reasonCode: "INVALID_POLICY_SNAPSHOT",
    });
  });

});
