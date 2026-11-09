import { describe, expect, it } from "vitest";
import { parseSpendIntent } from "../src/intent.js";

const valid = {
  intentId: "intent-001",
  agentId: "agent.testnet",
  policyId: "daily-limit",
  network: "near-testnet",
  assetId: "native-near",
  destination: "merchant.testnet",
  amount: "1000000000000000000000000",
  nonce: "1",
  expiresAtNs: "900000000000000000",
  createdAtNs: "800000000000000000",
};

describe("parseSpendIntent", () => {
  it("accepts a valid intent without Number coercion", () => {
    expect(parseSpendIntent(valid).amount).toBe(valid.amount);
  });

  it("rejects unknown fields", () => {
    expect(() => parseSpendIntent({ ...valid, unrestricted: true })).toThrow();
  });

  it("rejects non-decimal amount strings", () => {
    expect(() => parseSpendIntent({ ...valid, amount: "1e24" })).toThrow();
    expect(() => parseSpendIntent({ ...valid, amount: "-1" })).toThrow();
  });

  it("rejects invalid account identifiers", () => {
    expect(() => parseSpendIntent({ ...valid, destination: "Bad Account!" })).toThrow();
  });

  it("rejects unsupported networks", () => {
    expect(() => parseSpendIntent({ ...valid, network: "mainnet" })).toThrow();
  });

  it("rejects missing required fields", () => {
    const { nonce: _nonce, ...missingNonce } = valid;
    expect(() => parseSpendIntent(missingNonce)).toThrow();
  });
});
