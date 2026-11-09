import { describe, expect, it } from "vitest";
import { issueAgentKey } from "../src/agent-key.js";
import { authenticateAgent, type AgentCredentialStore } from "../src/authenticate.js";

describe("authenticateAgent", () => {
  it("resolves a valid bearer key to its registered agent", async () => {
    const issued = issueAgentKey();
    const store: AgentCredentialStore = {
      async findByKeyHash(hash) {
        return hash === issued.keyHash
          ? { agentId: "agent.testnet", keyHash: issued.keyHash, enabled: true }
          : null;
      },
    };

    await expect(authenticateAgent(`Bearer ${issued.secret}`, store)).resolves.toEqual({
      agentId: "agent.testnet",
    });
  });

  it("rejects missing, malformed, and unknown credentials", async () => {
    const store: AgentCredentialStore = { async findByKeyHash() { return null; } };
    await expect(authenticateAgent(undefined, store)).resolves.toBeNull();
    await expect(authenticateAgent("Basic abc", store)).resolves.toBeNull();
    await expect(authenticateAgent("Bearer malformed", store)).resolves.toBeNull();
  });

  it("rejects disabled credentials", async () => {
    const issued = issueAgentKey();
    const store: AgentCredentialStore = {
      async findByKeyHash() {
        return { agentId: "agent.testnet", keyHash: issued.keyHash, enabled: false };
      },
    };
    await expect(authenticateAgent(`Bearer ${issued.secret}`, store)).resolves.toBeNull();
  });
});
