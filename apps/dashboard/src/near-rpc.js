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

export async function callView(contractId, methodName, args = {}, fetchImpl = globalThis.fetch) {
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
        finality: "final",
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
