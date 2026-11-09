# @outlay/policy

Shared runtime schemas for untrusted agent spending intents and lifecycle records.

- Strict Zod objects reject unknown keys.
- Amounts, nonces, and nanosecond timestamps remain decimal strings.
- API parsing is validation only. The NEAR contract remains the authoritative budget and authorization boundary.
- Network is intentionally pinned to testnet in this initial schema. Mainnet support requires a deliberate schema and deployment review.
