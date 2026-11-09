import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  combineContractAndRisk,
  evaluateRisk,
  riskSignalSigningPayload,
  type RiskEvaluation,
  type RiskSignal,
  type UnsignedRiskSignal,
} from "../src/risk.js";

const source = "risk-provider-v1";
const now = "1000000000";
const keys = generateKeyPairSync("ed25519");
const trustedSources = {
  [source]: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
};

const signal = (overrides: Partial<UnsignedRiskSignal> = {}): RiskSignal => {
  const unsigned: UnsignedRiskSignal = {
    signalId: "velocity-check-1",
    category: "velocity",
    disposition: "clear",
    sourceId: source,
    observedAtNs: "999000000",
    validUntilNs: "1100000000",
    evidenceHash: "a".repeat(64),
    ...overrides,
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(riskSignalSigningPayload(unsigned)), keys.privateKey).toString("base64url"),
  };
};

describe("evaluateRisk", () => {
  it("clears only when every required category has fresh trusted signed evidence", () => {
    const signals = [
      signal(),
      signal({
        signalId: "destination-check-1",
        category: "destination_reputation",
        evidenceHash: "b".repeat(64),
      }),
    ];
    expect(evaluateRisk(
      signals,
      ["velocity", "destination_reputation"],
      trustedSources,
      now,
      "5000000",
    )).toEqual({
      decision: "clear",
      reasonCode: "RISK_CLEAR",
      signalIds: ["velocity-check-1", "destination-check-1"],
    });
  });

  it("denies missing required evidence", () => {
    expect(evaluateRisk([signal()], ["velocity", "anomaly"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_MISSING" });
  });

  it("denies stale or future-dated evidence", () => {
    expect(evaluateRisk([signal({ observedAtNs: "1" })], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_STALE" });
    expect(evaluateRisk([signal({ observedAtNs: "1000000001" })], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_FROM_FUTURE" });
  });

  it("denies evidence from untrusted sources", () => {
    expect(evaluateRisk([signal({ sourceId: "unknown-provider" })], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SOURCE_UNTRUSTED" });
  });

  it("denies signatures that do not match the signal contents", () => {
    const signed = signal();
    const tampered = { ...signed, disposition: "deny" as const };
    expect(evaluateRisk([tampered], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNATURE_INVALID" });
  });

  it("denies contradictory or duplicate signals for one category", () => {
    expect(evaluateRisk([
      signal(),
      signal({ signalId: "velocity-check-2", disposition: "deny" }),
    ], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_CONFLICT" });
    expect(evaluateRisk([
      signal(),
      signal({ signalId: "velocity-check-2" }),
    ], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_DUPLICATE" });
  });

  it("routes review and deny dispositions without granting authorization", () => {
    expect(evaluateRisk([signal({ disposition: "review" })], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "review", reasonCode: "RISK_SIGNAL_REVIEW" });
    expect(evaluateRisk([signal({ disposition: "deny" })], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_DENY" });
  });

  it("rejects malformed signal data and invalid clock inputs", () => {
    expect(evaluateRisk([signal({ evidenceHash: "bad" })], ["velocity"], trustedSources, now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "INVALID_RISK_SIGNAL" });
    expect(evaluateRisk([signal()], ["velocity"], trustedSources, "not-a-time", "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "INVALID_RISK_CLOCK" });
  });
});

describe("combineContractAndRisk", () => {
  const clear: RiskEvaluation = { decision: "clear", reasonCode: "RISK_CLEAR", signalIds: [] };
  const review: RiskEvaluation = { decision: "review", reasonCode: "RISK_SIGNAL_REVIEW", signalIds: [] };
  const deny: RiskEvaluation = { decision: "deny", reasonCode: "RISK_SIGNAL_DENY", signalIds: [] };

  it("never lets clear risk evidence override a contract denial", () => {
    expect(combineContractAndRisk(
      { allowed: false, reasonCode: "DESTINATION_DENIED" },
      clear,
    )).toEqual({
      allowed: false,
      authority: "contract",
      reasonCode: "DESTINATION_DENIED",
    });
  });

  it("fails closed when contract denies without a reason code", () => {
    expect(combineContractAndRisk({ allowed: false }, clear)).toEqual({
      allowed: false,
      authority: "contract",
      reasonCode: "CONTRACT_POLICY_DENIED",
    });
  });

  it("allows only a contract-allowed intent with a clear risk result through the advisory gate", () => {
    expect(combineContractAndRisk({ allowed: true }, clear)).toEqual({
      allowed: true,
      authority: "risk_gate",
      reasonCode: "RISK_CLEAR",
    });
  });

  it("keeps review and deny outcomes blocked when the contract preflight allows", () => {
    expect(combineContractAndRisk({ allowed: true }, review)).toEqual({
      allowed: false,
      authority: "risk_gate",
      reasonCode: "RISK_SIGNAL_REVIEW",
    });
    expect(combineContractAndRisk({ allowed: true }, deny)).toEqual({
      allowed: false,
      authority: "risk_gate",
      reasonCode: "RISK_SIGNAL_DENY",
    });
  });
});
