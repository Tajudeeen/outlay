export const TESTNET_RPC = "https://rpc.testnet.fastnear.com";

export function encodeJsonArgs(args = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(args));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Preserve u64/u128 JSON integer tokens as strings. Parsing them as Number
 * would silently round values above Number.MAX_SAFE_INTEGER.
 */
export function parseNearJson(source) {
  let normalized = "";
  let inString = false;
  let escaped = false;
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (inString) {
      normalized += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      normalized += character;
      index += 1;
      continue;
    }

    if (character === "-" || (character >= "0" && character <= "9")) {
      const match = /^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(index));
      if (!match) throw new Error("invalid numeric token in NEAR response");
      const token = match[0];
      normalized += /[.eE]/.test(token) ? token : '"' + token + '"';
      index += token.length;
      continue;
    }

    normalized += character;
    index += 1;
  }

  return JSON.parse(normalized);
}

export function decodeNearResult(resultBytes) {
  if (!Array.isArray(resultBytes)) throw new Error("NEAR RPC returned no result bytes");
  const decoded = new TextDecoder().decode(Uint8Array.from(resultBytes));
  if (decoded.length === 0) return null;
  return parseNearJson(decoded);
}

export async function callView(contractId, methodName, args = {}, fetchImpl = globalThis.fetch, blockHash = null) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");
  const response = await fetchImpl(TESTNET_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "outlay-dashboard",
      method: "query",
      params: {
        request_type: "call_function",
        ...(blockHash ? { block_id: blockHash } : { finality: "final" }),
        account_id: contractId,
        method_name: methodName,
        args_base64: encodeJsonArgs(args),
      },
    }),
  });

  if (!response.ok) throw new Error("NEAR RPC HTTP " + response.status);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || "NEAR RPC request failed");
  if (body.result?.error) throw new Error(body.result.error);
  return {
    value: decodeNearResult(body.result?.result),
    blockHeight: body.result?.block_height ?? null,
    blockHash: body.result?.block_hash ?? null,
  };
}

function isUint(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value);
}

/**
 * Checks internal consistency of fields read from the finalized contract.
 * This is not a cryptographic proof or an independent transaction receipt.
 */
export function verifyDecisionReceipt(decision, expected) {
  const checks = [
    { label: "decision id matches requested receipt", passed: decision?.decision_id === expected.decisionId },
    { label: "agent matches selected on-chain grant", passed: decision?.agent_id === expected.agentId },
    { label: "policy matches selected policy", passed: decision?.policy_id === expected.policyId },
    { label: "amount is a positive integer", passed: isUint(decision?.amount) && BigInt(decision.amount) > 0n },
    { label: "policy version is valid", passed: isUint(decision?.policy_version) && isUint(expected.currentPolicyVersion) && BigInt(decision.policy_version) > 0n && BigInt(decision.policy_version) <= BigInt(expected.currentPolicyVersion) },
    { label: "intent expiry does not exceed policy expiry", passed: isUint(decision?.intent_expires_at_ns) && isUint(decision?.policy_expires_at_ns) && BigInt(decision.intent_expires_at_ns) <= BigInt(decision.policy_expires_at_ns) },
    { label: "authorization occurred before intent expiry", passed: isUint(decision?.authorized_at_ns) && isUint(decision?.intent_expires_at_ns) && BigInt(decision.authorized_at_ns) < BigInt(decision.intent_expires_at_ns) },
    { label: "cumulative reservation covers this decision", passed: isUint(decision?.cumulative_spend) && isUint(decision?.amount) && BigInt(decision.cumulative_spend) >= BigInt(decision.amount) },
    { label: "nonce is a valid integer", passed: isUint(decision?.nonce) },
  ];
  return { valid: checks.every((check) => check.passed), checks };
}
