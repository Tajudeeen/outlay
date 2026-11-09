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
- Every spend is bound to a policy, asset, destination, amount, nonce/idempotency key, and expiry as applicable.
- Budget accounting is atomic and cannot be bypassed by concurrent requests.
- Rejected requests do not mutate spending state.
- A request cannot be replayed after its authorization window or nonce is consumed.
- Missing configuration, failed verification, or unavailable critical controls produce denial.
- Policy changes are authenticated, scoped, and auditable.
- Signing is restricted to validated transaction payloads and derivation paths.
- Receipt claims distinguish authorization from execution and settlement.
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
