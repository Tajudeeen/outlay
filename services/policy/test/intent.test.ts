import { describe, expect, it } from "vitest";
import { parseSpendIntent } from "../src/intent.js";

const valid = {
  intentId: "intent-001",
  agentId: "agent.testnet",
  policyId: "daily-limit",
  network: "near-testnet",
  assetId: "policy-unit",
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
  it("accepts the maximum contract u128 amount", () => {
    expect(parseSpendIntent({
      ...valid,
      amount: "340282366920938463463374607431768211455",
    }).amount).toBe("340282366920938463463374607431768211455");
  });

  it("rejects amounts outside the contract u128 range", () => {
    expect(() => parseSpendIntent({
      ...valid,
      amount: "340282366920938463463374607431768211456",
    })).toThrow();
  });

  it("rejects nonce and timestamps outside the contract u64 range", () => {
    const tooLarge = "18446744073709551616";
    expect(() => parseSpendIntent({ ...valid, nonce: tooLarge })).toThrow();
    expect(() => parseSpendIntent({ ...valid, expiresAtNs: tooLarge })).toThrow();
    expect(() => parseSpendIntent({ ...valid, createdAtNs: tooLarge })).toThrow();
  });

  it("accepts only the explicit abstract policy-unit asset marker", () => {
    expect(() => parseSpendIntent({ ...valid, assetId: "native-near" })).toThrow();
    expect(() => parseSpendIntent({ ...valid, assetId: "usdc" })).toThrow();
  });

  it("rejects intent and policy identifiers outside contract-safe characters", () => {
    expect(() => parseSpendIntent({ ...valid, intentId: "intent/one" })).toThrow();
    expect(() => parseSpendIntent({ ...valid, policyId: "daily policy" })).toThrow();
  });

});
