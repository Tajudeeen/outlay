import { describe, expect, it } from "vitest";
import { issueAgentKey, verifyAgentKey } from "../src/agent-key.js";

describe("agent key security", () => {
  it("issues a prefixed high-entropy secret and a digest that verifies", () => {
    const issued = issueAgentKey();
    expect(issued.secret.startsWith("outlay_agent_")).toBe(true);
    expect(issued.secret).not.toBe(issued.keyHash);
    expect(verifyAgentKey(issued.secret, issued.keyHash)).toBe(true);
  });

  it("rejects a different key", () => {
    const issued = issueAgentKey();
    const other = issueAgentKey();
    expect(verifyAgentKey(other.secret, issued.keyHash)).toBe(false);
  });

  it("rejects malformed keys and malformed stored digests", () => {
    expect(verifyAgentKey("wrong-prefix", "a".repeat(64))).toBe(false);
    expect(verifyAgentKey("outlay_agent_fake", "not-a-hash")).toBe(false);
  });

  it("issues distinct secrets", () => {
    expect(issueAgentKey().secret).not.toBe(issueAgentKey().secret);
  });
});
