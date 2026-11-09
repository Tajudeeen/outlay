# @outlay/policy

Shared runtime schemas for untrusted agent spending intents and lifecycle records.

- Strict Zod objects reject unknown keys.
- Amounts, nonces, and nanosecond timestamps remain decimal strings.
- API parsing and preflight are advisory only. The NEAR contract remains the authoritative budget and authorization boundary.\n- The preflight snapshot field `reserved` includes active authorization reservations, not confirmed settled spend.
- Network is intentionally pinned to testnet in this initial schema. Mainnet support requires a deliberate schema and deployment review.
