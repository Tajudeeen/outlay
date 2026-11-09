import { hashAgentKey, verifyAgentKey } from "./agent-key.js";

export type AgentCredentialRecord = {
  agentId: string;
  keyHash: string;
  enabled: boolean;
};

export type AgentCredentialStore = {
  findByKeyHash(keyHash: string): Promise<AgentCredentialRecord | null>;
};

/**
 * Resolves a bearer token to its registered agent identity.
 * The backing store must index keyHash and must never store the raw secret.
 */
export async function authenticateAgent(
  authorization: string | undefined,
  store: AgentCredentialStore,
): Promise<{ agentId: string } | null> {
  if (!authorization) return null;

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match) return null;

  const secret = match[1];
  if (!secret || !/^outlay_agent_[A-Za-z0-9_-]{43}$/.test(secret)) return null;

  const keyHash = hashAgentKey(secret);
  let credential: AgentCredentialRecord | null;
  try {
    credential = await store.findByKeyHash(keyHash);
  } catch {
    // An unavailable credential store must never authenticate a caller.
    return null;
  }
  if (!credential || !credential.enabled) return null;
  if (!verifyAgentKey(secret, credential.keyHash)) return null;

  return { agentId: credential.agentId };
}
