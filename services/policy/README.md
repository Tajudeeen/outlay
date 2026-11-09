# @outlay/policy

Shared runtime schemas for untrusted agent spending intents and lifecycle records.

- Strict Zod objects reject unknown keys.
- Amounts, nonces, and nanosecond timestamps remain decimal strings. Amount is bounded to u128, nonce and timestamps to u64, and the only supported asset marker is `policy-unit` for abstract policy accounting.
- API parsing and preflight are advisory only. The NEAR contract remains the authoritative budget and authorization boundary.\n- The preflight snapshot field `reserved` includes active authorization reservations, not confirmed settled spend.
- Network is intentionally pinned to testnet in this initial schema. Mainnet support requires a deliberate schema and deployment review.

## Agent credentials

- Keys are generated with 256 bits of random entropy and use the `outlay_agent_` prefix.
- Show the raw secret once. Persist only its SHA-256 digest.
- Authenticate using a strict `Authorization: Bearer <key>` header.
- Compare digests with a constant-time byte comparison.
- Disabled or unknown credentials are rejected.
- Credential-store lookup errors fail closed and return no authenticated identity.
- `AgentCredentialStore` is an interface. The API package now includes a PostgreSQL adapter, explicit key rotation, revocation audit events, fixed-window rate limits, and idempotency storage. A managed production database and operational monitoring still need configuration.
- Never log bearer tokens or return stored digests from public APIs.

## Deterministic risk gate

- `evaluateRisk` validates signal schema, trusted source IDs, evidence hashes, freshness windows, and required signal categories.
- Missing, stale, future-dated, duplicate, contradictory, or untrusted signals fail closed.
- A signal may clear, request review, or deny. The evaluator cannot authorize a spend.
- The risk evaluator is a tested library primitive. It is not yet connected to a live external risk provider or the API route. Provider public keys and source operations still need configuration. Do not claim live reputation or anomaly detection until trusted providers are integrated.

## Pre-sign execution envelope validator

- `validateExecutionEnvelope` builds a strict envelope from verified authorization facts and an explicit asset mapping. It does not accept arbitrary agent transaction objects.
- Conversion from abstract policy units to asset base units uses an explicit rational mapping and rejects inexact conversion, expired/inactive/released authorization, malformed chain evidence, and amounts above the configured asset cap.
- The envelope hash is a deterministic SHA-256 digest of the validated canonical field order.
- This is a pre-sign validation primitive only. No signer, Chain Signatures call, broadcast, or settlement is implemented. No asset mapping is approved or enabled by default. Production use requires independent verification of the supplied authorization facts and reviewed asset configuration.
