import { z } from "zod";

const accountId = z.string().min(2).max(64).regex(/^[a-z0-9._-]+$/);
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const U64_MAX = 18_446_744_073_709_551_615n;
const U128_MAX = 340_282_366_920_938_463_463_374_607_431_768_211_455n;
const decimalU64 = decimal.refine((value) => BigInt(value) <= U64_MAX);
const decimalU128 = decimal.refine((value) => BigInt(value) <= U128_MAX);

export const SpendIntentSchema = z.object({
  intentId: identifier,
  agentId: accountId,
  policyId: identifier,
  network: z.literal("near-testnet"),
  assetId: z.literal("policy-unit"),
  destination: accountId,
  amount: decimalU128,
  nonce: decimalU64,
  expiresAtNs: decimalU64,
  createdAtNs: decimalU64,
}).strict();

export type SpendIntent = z.infer<typeof SpendIntentSchema>;

export const DecisionStatusSchema = z.enum([
  "denied",
  "authorized",
  "execution_pending",
  "executed",
  "settled",
  "failed",
  "expired",
]);

export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DecisionRecordSchema = z.object({
  decisionId: identifier,
  intentId: identifier,
  status: DecisionStatusSchema,
  reasonCode: identifier,
  policyVersion: z.string().regex(/^(0|[1-9][0-9]*)$/),
  decidedAtNs: z.string().regex(/^(0|[1-9][0-9]*)$/),
  transactionHash: z.string().optional(),
}).strict();

export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

/**
 * Parse untrusted agent input. Unknown fields are rejected, never stripped
 * silently, so a caller cannot believe an ignored field affected authorization.
 */
export function parseSpendIntent(input: unknown): SpendIntent {
  return SpendIntentSchema.parse(input);
}

/**
 * Amounts and timestamps remain decimal strings at API boundaries to avoid
 * JavaScript Number precision loss for u128 and nanosecond values.
 */
