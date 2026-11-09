import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * This module validates a proposed transfer envelope against independently
 * verified authorization facts. It does not sign, broadcast, or settle.
 * The asset mapping is explicit configuration, never inferred from policy-unit.
 */
const accountId = z.string().min(2).max(64).regex(/^[a-z0-9._-]+$/);
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const positiveDecimal = decimal.refine((v) => BigInt(v) > 0n);
const U64_MAX = 18_446_744_073_709_551_615n;
const U128_MAX = 340_282_366_920_938_463_463_374_607_431_768_211_455n;
const u64 = decimal.refine((v) => BigInt(v) <= U64_MAX);
const u128 = decimal.refine((v) => BigInt(v) <= U128_MAX);
const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const AssetMappingSchema = z.object({
  assetId: identifier,
  network: z.literal("near-testnet"),
  decimals: z.number().int().min(0).max(24),
  baseUnitsNumerator: positiveDecimal,
  baseUnitsDenominator: positiveDecimal,
  maxTransferBaseUnits: positiveDecimal,
  mappingVersion: positiveDecimal,
}).strict();

export type AssetMapping = z.infer<typeof AssetMappingSchema>;

export const ExecutionEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  network: z.literal("near-testnet"),
  action: z.literal("transfer"),
  decisionId: identifier,
  intentId: identifier,
  policyId: identifier,
  policyVersion: positiveDecimal,
  agentId: accountId,
  nonce: decimal,
  recipient: accountId,
  policyAmount: positiveDecimal,
  assetId: identifier,
  assetDecimals: z.number().int().min(0).max(24),
  transferAmountBaseUnits: positiveDecimal,
  mappingVersion: positiveDecimal,
  authorizationBlockHeight: decimal,
  authorizationBlockHash: hash,
  expiresAtNs: positiveDecimal,
  executionAttemptId: identifier,
}).strict();

export type ExecutionEnvelope = z.infer<typeof ExecutionEnvelopeSchema>;

export type VerifiedAuthorization = {
  decisionId: string;
  intentId: string;
  policyId: string;
  policyVersion: string;
  agentId: string;
  nonce: string;
  destination: string;
  amount: string;
  expiresAtNs: string;
  blockHeight: string;
  blockHash: string;
  active: boolean;
  released: boolean;
};

export type EnvelopeValidation =
  | { valid: true; envelope: ExecutionEnvelope; envelopeHash: string }
  | { valid: false; reasonCode: string };

function fail(reasonCode: string): EnvelopeValidation {
  return { valid: false, reasonCode };
}

/**
 * Builds a canonical, validated transfer envelope from a verified contract
 * decision and an explicitly configured asset mapping. It never accepts an
 * agent-supplied transaction object.
 */
export function validateExecutionEnvelope(input: {
  authorization: VerifiedAuthorization;
  mapping: AssetMapping;
  executionAttemptId: string;
  network: "near-testnet";
  nowNs: string;
}): EnvelopeValidation {
  const mappingResult = AssetMappingSchema.safeParse(input.mapping);
  if (!mappingResult.success) return fail("ASSET_MAPPING_INVALID");
  const mapping = mappingResult.data;

  if (input.network !== "near-testnet" || mapping.network !== input.network) {
    return fail("NETWORK_MISMATCH");
  }

  const auth = authorizationResult.data;
  if (!auth.active) return fail("AUTHORIZATION_INACTIVE");
  if (auth.released) return fail("RESERVATION_RELEASED");

  let now: bigint;
  let expiry: bigint;
  let policyAmount: bigint;
  let numerator: bigint;
  let denominator: bigint;
  let maxTransfer: bigint;
  try {
    now = BigInt(input.nowNs);
    expiry = BigInt(auth.expiresAtNs);
    policyAmount = BigInt(auth.amount);
    numerator = BigInt(mapping.baseUnitsNumerator);
    denominator = BigInt(mapping.baseUnitsDenominator);
    maxTransfer = BigInt(mapping.maxTransferBaseUnits);
    if (!/^(0|[1-9][0-9]*)$/.test(input.nowNs) ||
        !/^(0|[1-9][0-9]*)$/.test(auth.expiresAtNs) ||
        !/^(0|[1-9][0-9]*)$/.test(auth.amount)) return fail("AUTHORIZATION_NUMERIC_INVALID");
  } catch {
    return fail("AUTHORIZATION_NUMERIC_INVALID");
  }

  if (now >= expiry) return fail("AUTHORIZATION_EXPIRED");
  if (policyAmount <= 0n || numerator <= 0n || denominator <= 0n) {
    return fail("AMOUNT_MAPPING_INVALID");
  }

  const scaled = policyAmount * numerator;
  if (scaled % denominator !== 0n) return fail("AMOUNT_MAPPING_INEXACT");
  const transferAmount = scaled / denominator;
  if (transferAmount <= 0n || transferAmount > maxTransfer) {
    return fail("TRANSFER_AMOUNT_OUT_OF_RANGE");
  }

  const candidate = {
    schemaVersion: 1 as const,
    network: input.network,
    action: "transfer" as const,
    decisionId: auth.decisionId,
    intentId: auth.intentId,
    policyId: auth.policyId,
    policyVersion: auth.policyVersion,
    agentId: auth.agentId,
    nonce: auth.nonce,
    recipient: auth.destination,
    policyAmount: auth.amount,
    assetId: mapping.assetId,
    assetDecimals: mapping.decimals,
    transferAmountBaseUnits: transferAmount.toString(),
    mappingVersion: mapping.mappingVersion,
    authorizationBlockHeight: auth.blockHeight,
    authorizationBlockHash: auth.blockHash,
    expiresAtNs: auth.expiresAtNs,
    executionAttemptId: input.executionAttemptId,
  };

  const parsed = ExecutionEnvelopeSchema.safeParse(candidate);
  if (!parsed.success) return fail("EXECUTION_ENVELOPE_INVALID");

  const canonical = JSON.stringify(parsed.data);
  const envelopeHash = createHash("sha256").update(canonical, "utf8").digest("hex");
  return { valid: true, envelope: parsed.data, envelopeHash };
}
