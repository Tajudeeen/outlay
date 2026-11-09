/**
 * Parse NEAR JSON while preserving integer tokens as strings. Contract u64/u128
 * values must never pass through JavaScript Number.
 */
export function parseNearJson(source: string): unknown {
  let normalized = "";
  let inString = false;
  let escaped = false;
  let index = 0;

  while (index < source.length) {
    const character = source[index] ?? "";
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
      if (!match) throw new Error("INVALID_NEAR_JSON_NUMBER");
      const token = match[0];
      normalized += /[.eE]/.test(token) ? token : JSON.stringify(token);
      index += token.length;
      continue;
    }
    normalized += character;
    index += 1;
  }
  return JSON.parse(normalized) as unknown;
}
