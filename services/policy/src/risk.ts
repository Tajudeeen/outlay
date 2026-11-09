import { z } from "zod";

export const RiskCategorySchema = z.enum([
  "velocity",
  "destination_reputation",
  "anomaly",
  "source_integrity",
]);
export type RiskCategory = z.infer<typeof RiskCategorySchema>;

export const RiskDispositionSchema = z.enum(["clear", "review", "deny"]);
export type RiskDisposition = z.infer<typeof RiskDispositionSchema>;

const U64_MAX = 18_446_744_073_709_551_615n;
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).refine((value) => {
  try { return BigInt(value) <= U64_MAX; }
  catch { return false; }
});

export const RiskSignalSchema = z.object({
  signalId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  category: RiskCategorySchema,
  disposition: RiskDispositionSchema,
  sourceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  observedAtNs: uint,
  validUntilNs: uint,
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type RiskSignal = z.infer<typeof RiskSignalSchema>;

export type RiskEvaluation =
  | { decision: "clear"; reasonCode: "RISK_CLEAR"; signalIds: string[] }
  | { decision: "review"; reasonCode: "RISK_SIGNAL_REVIEW"; signalIds: string[] }
  | { decision: "deny"; reasonCode: string; signalIds: string[] };

/**
 * Deterministic risk gate over signals from explicitly trusted sources.
 * Caller-provided evidence is not trusted merely because it matches this schema.
 * This module never authorizes spend and can only clear, request review, or deny.
 */
export function evaluateRisk(
  input: unknown,
  requiredCategories: readonly RiskCategory[],
  trustedSources: readonly string[],
  nowNs: string,
  maxSignalAgeNs: string,
): RiskEvaluation {
  if (!uint.safeParse(nowNs).success || !uint.safeParse(maxSignalAgeNs).success) {
    return { decision: "deny", reasonCode: "INVALID_RISK_CLOCK", signalIds: [] };
  }

  const parsed = z.array(RiskSignalSchema).max(32).safeParse(input);
  if (!parsed.success) return { decision: "deny", reasonCode: "INVALID_RISK_SIGNAL", signalIds: [] };

  const now = BigInt(nowNs);
  const maxAge = BigInt(maxSignalAgeNs);
  const signals = parsed.data;
  const ids = signals.map((signal) => signal.signalId);

  for (const signal of signals) {
    if (!trustedSources.includes(signal.sourceId)) {
      return { decision: "deny", reasonCode: "RISK_SOURCE_UNTRUSTED", signalIds: ids };
    }
    const observed = BigInt(signal.observedAtNs);
    const validUntil = BigInt(signal.validUntilNs);
    if (observed >= validUntil) {
      return { decision: "deny", reasonCode: "RISK_SIGNAL_WINDOW_INVALID", signalIds: ids };
    }
    if (observed > now) {
      return { decision: "deny", reasonCode: "RISK_SIGNAL_FROM_FUTURE", signalIds: ids };
    }
    if (now >= validUntil || now - observed > maxAge) {
      return { decision: "deny", reasonCode: "RISK_SIGNAL_STALE", signalIds: ids };
    }
  }

  const byCategory = new Map<RiskCategory, RiskSignal[]>();
  for (const signal of signals) {
    const current = byCategory.get(signal.category) ?? [];
    current.push(signal);
    byCategory.set(signal.category, current);
  }

  for (const [category, categorySignals] of byCategory) {
    if (categorySignals.length > 1) {
      const dispositions = new Set(categorySignals.map((signal) => signal.disposition));
      if (dispositions.size > 1) {
        return { decision: "deny", reasonCode: "RISK_SIGNAL_CONFLICT", signalIds: ids };
      }
      return { decision: "deny", reasonCode: "RISK_SIGNAL_DUPLICATE", signalIds: ids };
    }
  }

  for (const category of requiredCategories) {
    if (!byCategory.has(category)) {
      return { decision: "deny", reasonCode: "RISK_SIGNAL_MISSING", signalIds: ids };
    }
  }

  if (signals.some((signal) => signal.disposition === "deny")) {
    return { decision: "deny", reasonCode: "RISK_SIGNAL_DENY", signalIds: ids };
  }
  if (signals.some((signal) => signal.disposition === "review")) {
    return { decision: "review", reasonCode: "RISK_SIGNAL_REVIEW", signalIds: ids };
  }
  return { decision: "clear", reasonCode: "RISK_CLEAR", signalIds: ids };
}
