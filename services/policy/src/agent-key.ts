import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const KEY_PREFIX = "outlay_agent_";
const KEY_BYTES = 32;

export type IssuedAgentKey = {
  secret: string;
  keyHash: string;
};

/**
 * Issues a high-entropy agent key. Persist only keyHash, show secret once.
 * Callers must deliver the secret over a trusted channel and never log it.
 */
export function issueAgentKey(): IssuedAgentKey {
  const secret = KEY_PREFIX + randomBytes(KEY_BYTES).toString("base64url");
  return { secret, keyHash: hashAgentKey(secret) };
}

export function hashAgentKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/**
 * Compare a presented key against the stored SHA-256 digest without a
 * content-dependent early exit. The stored digest must be 64-char lowercase hex.
 */
export function verifyAgentKey(secret: string, expectedHash: string): boolean {
  if (!secret.startsWith(KEY_PREFIX) || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }

  const actual = Buffer.from(hashAgentKey(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
