import { describe, expect, it } from "vitest";
import { evaluateRisk, type RiskSignal } from "../src/risk.js";

const source = "risk-provider-v1";
const now = "1000000000";
const signal = (overrides: Partial<RiskSignal> = {}): RiskSignal => ({
  signalId: "velocity-check-1",
  category: "velocity",
  disposition: "clear",
  sourceId: source,
  observedAtNs: "999000000",
  validUntilNs: "1100000000",
  evidenceHash: "a".repeat(64),
  ...overrides,
});

describe("evaluateRisk", () => {
  it("clears only when every required category has fresh trusted evidence", () => {
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
      [source],
      now,
      "5000000",
    )).toEqual({
      decision: "clear",
      reasonCode: "RISK_CLEAR",
      signalIds: ["velocity-check-1", "destination-check-1"],
    });
  });

  it("denies missing required evidence", () => {
    expect(evaluateRisk([signal()], ["velocity", "anomaly"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_MISSING" });
  });

  it("denies stale or future-dated evidence", () => {
    expect(evaluateRisk([signal({ observedAtNs: "1" })], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_STALE" });
    expect(evaluateRisk([signal({ observedAtNs: "1000000001" })], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_FROM_FUTURE" });
  });

  it("denies evidence from untrusted sources", () => {
    expect(evaluateRisk([signal({ sourceId: "unknown-provider" })], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SOURCE_UNTRUSTED" });
  });

  it("denies contradictory or duplicate signals for one category", () => {
    expect(evaluateRisk([
      signal(),
      signal({ signalId: "velocity-check-2", disposition: "deny" }),
    ], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_CONFLICT" });
    expect(evaluateRisk([
      signal(),
      signal({ signalId: "velocity-check-2" }),
    ], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_DUPLICATE" });
  });

  it("routes review and deny dispositions without granting authorization", () => {
    expect(evaluateRisk([signal({ disposition: "review" })], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "review", reasonCode: "RISK_SIGNAL_REVIEW" });
    expect(evaluateRisk([signal({ disposition: "deny" })], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "RISK_SIGNAL_DENY" });
  });

  it("rejects malformed signal data and invalid clock inputs", () => {
    expect(evaluateRisk([{ ...signal(), evidenceHash: "bad" }], ["velocity"], [source], now, "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "INVALID_RISK_SIGNAL" });
    expect(evaluateRisk([signal()], ["velocity"], [source], "not-a-time", "5000000"))
      .toMatchObject({ decision: "deny", reasonCode: "INVALID_RISK_CLOCK" });
  });
});
