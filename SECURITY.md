# Outlay security model

## Status

This is an initial threat model, not an audit. Outlay is early engineering. No funds should be entrusted to it based on this document.

## Assets to protect

- User-controlled funds and signing authority.
- Policy configuration, budgets, and spending scopes.
- Agent identities and delegated permissions.
- Integrity of spending intents and decision records.
- Availability and correctness of the authorization path.
- Confidentiality of credentials and sensitive transaction metadata.

## Adversaries

Assume an attacker can:
- fully control an agent, prompt, or agent runtime;
- submit malformed, oversized, repeated, or strategically timed requests;
- replay previously approved requests;
- race multiple requests against a shared budget;
- compromise an API key or service process;
- exploit stale policy, stale price/risk data, or unavailable dependencies;
- attempt to trick a signer into authorizing a payload different from the user's intent.

## Trust boundaries

1. **Agent → API:** all agent input is untrusted.
2. **API → policy engine:** normalized intent is still untrusted until validated.
3. **Policy engine → contract:** contract state and caller authorization are authoritative.
4. **Contract → signer:** signer payload must be constructed and validated by trusted code.
5. **External data → risk engine:** treat external values as stale, incomplete, or adversarial.
6. **Receipt → verifier:** receipts must be cryptographically and contextually verified.

## Initial security invariants

- No registered agent receives unrestricted account authority.
- Every contract authorization is bound to an agent grant, policy, destination, amount, nonce, and expiry. The API currently accepts only an abstract `policy-unit` marker. No transferable asset is supported or enforced.
- Budget accounting is atomic and cannot be bypassed by concurrent requests.
- Rejected requests do not mutate spending state.
- A request cannot be replayed after its authorization window or nonce is consumed.
- Missing configuration, failed verification, or unavailable critical controls produce denial.
- Policy changes are authenticated, scoped, and auditable.
- Future signing must be restricted to validated transaction payloads and derivation paths. No signer is currently implemented.
- Receipt claims distinguish authorization from execution and settlement. The current dashboard checks field consistency from finalized contract views, not independent cryptographic proof.
- Admin and upgrade authority are documented and minimized.

## Threat scenarios to test

- Budget overspend through concurrent requests.
- Reuse of an approved intent or nonce.
- Expired policy or intent accepted due to clock/state confusion.
- Destination or asset substitution between approval and signing.
- Agent requests a payload outside its scope.
- Policy update races an in-flight intent.
- Risk service outage incorrectly results in allow.
- Chain Signature payload constructed from attacker-controlled fields.
- Receipt claims successful settlement without transaction proof.
- Unauthorized policy update or agent registration.

## Security process

- Tests must include expected denials and state invariants.
- Any unresolved critical/high issue blocks release.
- Testnet evidence is not a mainnet audit.
- External audit and responsible disclosure process are required before production use.

## Implemented controls in the testnet prototype

- The NEAR contract is the final authorization boundary. It enforces agent registration, policy state, expiry, destination allowlists, per-request and total budget limits, nonce replay protection, and intent replay protection.
- Successful authorizations atomically reserve policy budget and emit structured events.
- The API validates strict intent schemas, bounds integer fields to the contract's u64/u128 types, binds bearer credentials to an on-chain agent account, and reads policy state from one pinned finalized block.
- Agent API keys contain 256 bits of random entropy. PostgreSQL stores only SHA-256 digests. Rotation and revocation are transactional and generate audit events.
- The API uses per-agent rate limits and 24-hour idempotency records. A preflight allow is advisory and never claims contract authorization.
- The risk evaluator verifies Ed25519 signatures from configured source public keys and rejects missing, stale, future-dated, duplicate, contradictory, tampered, and untrusted signals. It can return clear, review, or deny, but it cannot authorize spending. No provider keys or live provider are configured yet.
- CI runs policy, API, dashboard, and PostgreSQL integration tests and builds the API container image.

## Known gaps and residual risks

- The API is not deployed. A managed PostgreSQL database, secret management, HTTPS gateway, backups, monitoring, and operational ownership are still required.
- The risk evaluator is a library primitive. No trusted live reputation, velocity, or anomaly provider is connected.
- No transaction signer, Chain Signatures adapter, token transfer, broadcast, or settlement verification exists.
- The current contract stores abstract policy units. It does not bind a reservation to a token contract, token standard, or asset denomination.
- Dashboard receipt checks are consistency checks over NEAR RPC results, not independent cryptographic verification.
- The owner account and deployment key remain high-value administrative authorities.
- Owner-triggered reservation release must be redesigned before any execution adapter is added. A still-valid transaction must never remain executable after its budget reservation is released.
- Testnet results do not establish mainnet safety. No production funds should be used.
