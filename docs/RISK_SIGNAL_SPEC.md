# Outlay risk signal specification

## Status

The deterministic evaluator and its tests are implemented. No external risk provider is connected to the API, no provider keys are configured, and no live reputation or anomaly checks are active.

## Signal contract

A provider signs each signal using Ed25519. The signal object is strict and contains:

| Field | Meaning |
|---|---|
| `signalId` | Unique provider signal identifier |
| `category` | `velocity`, `destination_reputation`, `anomaly`, or `source_integrity` |
| `disposition` | `clear`, `review`, or `deny` |
| `sourceId` | Provider identifier, mapped to a trusted public key by the caller |
| `observedAtNs` | Provider observation time in decimal nanoseconds |
| `validUntilNs` | Signal expiry in decimal nanoseconds |
| `evidenceHash` | SHA-256 digest of the provider's canonical evidence record, lowercase hex |
| `signature` | Ed25519 signature of the canonical signal payload, base64url |

Timestamps are bounded to u64. The signal must be observed no later than the evaluation time, must not be expired, and must be within the configured maximum age.

## Signature payload

The provider signs the exact UTF-8 JSON string returned by `riskSignalSigningPayload`. Its key order is fixed:

```json
{
  "signalId": "velocity-2026-0001",
  "category": "velocity",
  "disposition": "clear",
  "sourceId": "provider-a",
  "observedAtNs": "1794200000000000000",
  "validUntilNs": "1794200300000000000",
  "evidenceHash": "64-lowercase-hex-characters"
}
```

The `signature` field is excluded from the signed payload. Do not reserialize the object independently and assume equivalent JSON has the same signature. Use the shared helper to produce the exact payload.

## Evaluation behavior

- Every configured required category must have exactly one signal.
- Duplicate signals for a category fail closed.
- Conflicting dispositions fail closed.
- Untrusted source IDs and invalid signatures fail closed.
- Missing, stale, future-dated, or malformed signals fail closed.
- A `deny` disposition denies the request.
- A `review` disposition returns a review outcome.
- All required fresh signed signals with `clear` dispositions return `clear`.
- The evaluator never returns an authorization result and cannot override the NEAR contract.

## Provider integration requirements

Before connecting a provider:
1. Verify the provider's public key through an out-of-band trusted channel.
2. Store the public key in server-side configuration, never in browser code.
3. Authenticate provider delivery and prevent source ID spoofing.
4. Hash a canonical evidence record and preserve its provenance.
5. Define freshness windows and required categories per policy.
6. Test key rotation, provider outage, signature tampering, replay, stale data, and contradictory signals.
7. Keep the final authorization check in the NEAR contract.

A valid signature proves that a configured key signed the signal fields. It does not prove the provider's underlying data is accurate or independent.
