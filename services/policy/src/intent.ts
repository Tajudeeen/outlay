import { z } from "zod";

const accountId = z.string().min(2).max(64).regex(/^[a-z0-9._-]+$/);
const identifier = z.string().min(1).max(128);
const decimalAmount = z.string().regex(/^(0|[1-9][0-9]*)$/);

export const SpendIntentSchema = z.object({
  intentId: identifier,
  agentId: accountId,
  policyId: identifier,
  network: z.literal("near-testnet"),
  assetId: identifier,
  destination: accountId,
  amount: decimalAmount,
  nonce: z.string().regex(/^(0|[1-9][0-9]*)$/),
  expiresAtNs: z.string().regex(/^(0|[1-9][0-9]*)$/),
  createdAtNs: z.string().regex(/^(0|[1-9][0-9]*)$/),
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
