# Execution payload specification (pre-implementation)

Status: proposed contract for signer-adapter implementation  
Date: 2026-11-09

## Hard boundary

The current Outlay intent uses `assetId: policy-unit`. Its amount is an abstract policy budget unit. It MUST NOT be interpreted as NEAR, yoctoNEAR, fungible-token units, or any real asset amount. As a result, the current intent cannot directly produce a transfer payload. No conversion, rounding, decimal scaling, or default asset may be inferred.

## Proposed envelope

The signer adapter should accept a typed envelope assembled by trusted Outlay code, not an agent-supplied transaction:

- `schemaVersion`: fixed supported version.
- `network`: configured network identifier, currently NEAR testnet only.
- `decisionId` and `intentId`: exact contract decision references.
- `policyId`, `policyVersion`, `agentId`, and `nonce`: values tied to the decision.
- `authorizedAtNs` and `expiresAtNs`: contract-recorded time bounds.
- `authorizationBlock`: finalized block height and hash used to verify the decision.
- `asset`: explicit asset identifier and denomination metadata, approved separately from policy units.
- `recipient`: canonical NEAR account ID, exactly equal to the authorized destination.
- `amount`: integer string in the asset's base unit, independently bounded and mapped to policy authorization by an explicit rule.
- `actions`: allowlisted action types only. Initial implementation should support one transfer action, with no arbitrary function calls or multi-action batches.
- `executionAttemptId`: unique, idempotent attempt identifier.

## Validation rules

1. Reject unknown fields and unsupported schema versions.
2. Require the configured network, never a caller-selected network.
3. Independently fetch and verify the decision from finalized contract state.
4. Require exact identity, recipient, nonce, policy version, and expiry matches.
5. Require the authorization to be active and unreleased, and the policy/agent still enabled according to the approved execution semantics.
6. Reject replayed decision IDs and execution attempt IDs.
7. Require an explicit, reviewed asset mapping. Never equate policy units with asset base units.
8. Require amount > 0 and within the asset-specific maximum. Reject float, exponent, negative, leading-zero, and unsafe JavaScript-number representations.
9. Permit only the allowlisted transfer action. Reject arbitrary transaction bytes, callbacks, method calls, access-key changes, and derivation paths.
10. Canonicalize the envelope, hash it, and revalidate the same hash at signer ingress.
11. Fail closed on RPC errors, stale state, inconsistent block references, missing fields, or validation errors.
12. Record signer decision, envelope hash, execution attempt, broadcast hash, and observed finality separately. A signature or broadcast is not settlement.

## Required negative tests

- recipient substitution, case/alias tricks, and destination mismatch
- amount mismatch, policy-unit conversion attempts, overflow, zero, negative, float, exponent
- wrong network and schema version
- extra action, extra field, arbitrary transaction bytes
- stale/expired/released authorization and disabled agent/policy
- consumed nonce, duplicate decision, duplicate attempt ID
- envelope mutation between validation and signing
- invalid or unapproved derivation path
- RPC timeout, inconsistent block hash, and malformed contract response

## Exit criteria

This specification is not executable approval. Implementing the validator, explicit asset model, reservation cancellation semantics, testnet signer, and independent review are all required before signing can be enabled.
