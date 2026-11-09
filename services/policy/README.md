# @outlay/policy

Shared runtime schemas for untrusted agent spending intents and lifecycle records.

- Strict Zod objects reject unknown keys.
- Amounts, nonces, and nanosecond timestamps remain decimal strings.
- API parsing and preflight are advisory only. The NEAR contract remains the authoritative budget and authorization boundary.\n- The preflight snapshot field `reserved` includes active authorization reservations, not confirmed settled spend.
- Network is intentionally pinned to testnet in this initial schema. Mainnet support requires a deliberate schema and deployment review.

## Agent credentials

- Keys are generated with 256 bits of random entropy and use the `outlay_agent_` prefix.
- Show the raw secret once. Persist only its SHA-256 digest.
- Authenticate using a strict `Authorization: Bearer <key>` header.
- Compare digests with a constant-time byte comparison.
- Disabled or unknown credentials are rejected.
- Credential-store lookup errors fail closed and return no authenticated identity.
- `AgentCredentialStore` is an interface. A production database adapter, key rotation, revocation audit trail, and rate limiting are still required.
- Never log bearer tokens or return stored digests from public APIs.
