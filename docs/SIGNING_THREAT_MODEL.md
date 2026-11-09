# Outlay signing and execution threat model

Status: design baseline, not signer approval  
Date: 2026-11-09

## Security objective

A compromised agent must not turn an authorization receipt into arbitrary signing authority. The signer may act only on a narrowly scoped, canonical execution envelope that has been independently tied to a valid on-chain authorization and a supported asset mapping.

## Assets to protect

- Signer derivation keys and signing capability.
- User funds and contract policy budgets.
- Integrity of authorization, execution, and settlement records.
- Separation between policy units and real asset denominations.
- Network and recipient integrity.

## Trust boundaries

| Component | Trust assumption | Authority |
| --- | --- | --- |
| Agent | untrusted, may be prompt-injected or compromised | submit intent only |
| API | trusted to authenticate and normalize, but not final authority | advisory preflight, persistence |
| NEAR contract | authoritative for policy authorization and reservation | record/reject authorization |
| Risk sources | untrusted until signature, freshness, and identity checks pass | add review/deny, never authorize |
| Payload builder | trusted code, deterministic and reviewed | construct constrained envelope |
| Signer | high-value boundary, isolated | sign only validated envelope |
| RPC/indexer | data source, may be stale or inconsistent | evidence only after independent verification |
| Dashboard | untrusted presentation layer | read-only inspection |

## Threats and required controls

### Prompt injection or compromised agent
Control: agents never supply arbitrary transaction objects, function calls, access keys, derivation paths, or signer instructions. Accept only the strict intent schema.

### Destination substitution
Control: recipient must match both the contract-authorized destination and the final envelope. Revalidate immediately before signing. Reject aliases or implicit recipient resolution.

### Amount / denomination confusion
Control: `policy-unit` is abstract budget accounting. It is not NEAR, yoctoNEAR, FT units, or a conversion rate. No signer may convert policy-unit amounts into asset amounts. Execution remains blocked until an explicit asset mapping and denomination model is approved.

### Network substitution
Control: pin the chain/network identifier in server configuration and envelope. Never trust a network value supplied only by the agent. Reject mainnet/testnet mismatch.

### Replay and duplicate execution
Control: bind envelope to decision ID, intent ID, consumed nonce, policy version, and a unique execution attempt. Maintain signer-side idempotency and check on-chain state before any signing. Contract authorization replay protection remains final for authorization, but does not alone prevent a duplicated off-chain broadcast.

### Payload mutation / confused deputy
Control: build payload from verified contract state and canonical intent data. Hash the canonical envelope. Recompute and compare all security-sensitive fields at signer ingress. Do not accept opaque serialized transactions from agents.

### Expired or revoked authorization
Control: check authorization expiry, policy/agent enabled state, and execution status at a coherent chain snapshot immediately before signing. Reservation release is not cancellation proof. If an authorization can still execute after release, signing must remain disabled.

### Compromised API or database
Control: API and DB cannot mint contract authorization. Signer independently verifies the contract decision and expected fields. Database records are indexes, not authority.

### RPC lies, forks, or inconsistent reads
Control: use finalized state, pin related reads to one block, retain block hash, and verify transaction/receipt evidence independently. Fail closed on unavailable or inconsistent RPC.

### Key exfiltration
Control: no raw keys in API, agent, logs, or dashboard. Signer isolation, least privilege, rotation/revocation, audit logs, rate limits, and incident response are mandatory. Chain Signatures derivation paths require allowlisting and review.

## Minimum signer gate

Signing stays disabled until all are true:

- An approved asset and denomination mapping exists.
- A canonical execution envelope and strict validator are implemented.
- The signer independently verifies contract authorization, recipient, amount, network, expiry, and replay status.
- Reservation lifecycle prevents release while a transaction can still execute.
- Replay, substitution, mutation, derivation-path, and expiry tests pass.
- Testnet execution is demonstrated with transaction evidence.
- Independent security review finds no unresolved critical/high issues.

## Explicit non-goals

This document does not authorize signing, token transfer, Chain Signatures, mainnet, or settlement claims. It is a threat model and review baseline only.
