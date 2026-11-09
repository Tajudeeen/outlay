import { describe, expect, it } from "vitest";
import {
  validateExecutionEnvelope,
  type AssetMapping,
  type VerifiedAuthorization,
} from "../src/execution.js";

const authorization: VerifiedAuthorization = {
  decisionId: "decision-001",
  intentId: "intent-001",
  policyId: "daily-limit",
  policyVersion: "3",
  agentId: "agent.testnet",
  nonce: "7",
  destination: "merchant.testnet",
  amount: "100",
  expiresAtNs: "900",
  blockHeight: "12345",
  blockHash: "a".repeat(64),
  active: true,
  released: false,
};

const mapping: AssetMapping = {
  assetId: "demo-token",
  network: "near-testnet",
  decimals: 6,
  baseUnitsNumerator: "1000",
  baseUnitsDenominator: "1",
  maxTransferBaseUnits: "1000000",
  mappingVersion: "1",
};

const input = {
  authorization,
  mapping,
  executionAttemptId: "attempt-001",
  network: "near-testnet" as const,
  nowNs: "800",
};

describe("validateExecutionEnvelope", () => {
  it("builds a deterministic envelope from verified authorization and explicit mapping", () => {
    const first = validateExecutionEnvelope(input);
    const second = validateExecutionEnvelope(input);
    expect(first.valid).toBe(true);
    if (!first.valid || !second.valid) throw new Error("expected valid envelope");
    expect(first.envelope.transferAmountBaseUnits).toBe("100000");
    expect(first.envelope.recipient).toBe("merchant.testnet");
    expect(first.envelopeHash).toBe(second.envelopeHash);
    expect(first.envelope.policyAmount).toBe("100");
  });

  it("rejects released or inactive reservations", () => {
    expect(validateExecutionEnvelope({
      ...input, authorization: { ...authorization, released: true },
    })).toMatchObject({ valid: false, reasonCode: "RESERVATION_RELEASED" });
    expect(validateExecutionEnvelope({
      ...input, authorization: { ...authorization, active: false },
    })).toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_INACTIVE" });
  });

  it("rejects expired authorization", () => {
    expect(validateExecutionEnvelope({ ...input, nowNs: "900" }))
      .toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_EXPIRED" });
  });

  it("rejects an invalid asset mapping", () => {
    expect(validateExecutionEnvelope({
      ...input, mapping: { ...mapping, baseUnitsDenominator: "0" },
    })).toMatchObject({ valid: false, reasonCode: "ASSET_MAPPING_INVALID" });
  });

  it("rejects inexact integer conversion instead of rounding", () => {
    expect(validateExecutionEnvelope({
      ...input,
      authorization: { ...authorization, amount: "101" },
      mapping: { ...mapping, baseUnitsNumerator: "1", baseUnitsDenominator: "2" },
    })).toMatchObject({ valid: false, reasonCode: "AMOUNT_MAPPING_INEXACT" });
  });

  it("rejects transfer amounts above the explicit asset cap", () => {
    expect(validateExecutionEnvelope({
      ...input, mapping: { ...mapping, maxTransferBaseUnits: "99999" },
    })).toMatchObject({ valid: false, reasonCode: "TRANSFER_AMOUNT_OUT_OF_RANGE" });
  });

  it("rejects malformed authorization block evidence", () => {
    expect(validateExecutionEnvelope({
      ...input, authorization: { ...authorization, blockHash: "not-a-hash" },
    })).toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_EVIDENCE_INVALID" });
  });

  it("rejects extra authorization fields and values outside contract integer bounds", () => {
    expect(validateExecutionEnvelope({
      ...input, authorization: { ...authorization, unrestricted: true } as VerifiedAuthorization,
    })).toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_EVIDENCE_INVALID" });
    expect(validateExecutionEnvelope({
      ...input, authorization: { ...authorization, nonce: "18446744073709551616" },
    })).toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_EVIDENCE_INVALID" });
  });

  it("rejects malformed or unsafe numeric values", () => {
    expect(validateExecutionEnvelope({
      ...input, authorization: { ...authorization, amount: "1e2" },
    })).toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_EVIDENCE_INVALID" });
    expect(validateExecutionEnvelope({
      ...input, nowNs: "-1",
    })).toMatchObject({ valid: false, reasonCode: "AUTHORIZATION_NUMERIC_INVALID" });
  });

  it("rejects extra fields in an asset mapping", () => {
    expect(validateExecutionEnvelope({
      ...input, mapping: { ...mapping, transferCall: "arbitrary" } as AssetMapping,
    })).toMatchObject({ valid: false, reasonCode: "ASSET_MAPPING_INVALID" });
  });
});
