# Outlay architecture

## Goal

Put a deterministic authorization boundary between autonomous agents and spending capability. Agents express intent; trusted components decide whether the intent is permitted; execution occurs only through constrained authority.

## Components

### 1. Agent / caller
- Sends a structured spending intent.
- Has no authority to set policy or bypass enforcement.
- Is treated as compromised by default.

### 2. API and intent normalization
- Authenticates the caller.
- Validates schema and size limits.
- Resolves agent identity and policy reference.
- Produces a canonical intent representation.
- Does not make final authorization decisions.

### 3. Policy contract (NEAR, Rust)
- Stores agent registrations, policy scopes, budget state, and replay protection.
- Enforces deterministic rules at the trusted boundary.
- Rejects unknown, expired, out-of-scope, or over-budget requests.
- Emits events or records decisions with enough context for verification.
- Does not trust UI or service-only checks.

### 4. Risk service (TypeScript)
- Evaluates optional risk signals such as velocity, destination reputation, anomaly flags, and data freshness.
- Can deny or require human approval.
- Cannot grant permission that contract policy denies.
- Fails closed where a required signal is unavailable.

### 5. Execution / signer adapter
- Receives only contract-authorized, canonical transaction data.
- Validates destination, asset, amount, network, and derivation path.
- Never accepts an arbitrary agent-supplied transaction hash as signing authority.
- Chain Signatures integration is a separate milestone with explicit security review.

### 6. Receipt and verification
- Separates policy decision, signing, broadcast, and settlement statuses.
- Includes stable identifiers, policy version/hash, decision, and relevant transaction references.
- Verifiers check integrity and on-chain evidence before asserting execution.

### 7. Dashboard
- Read-oriented view of policies, agents, intents, decisions, and receipts.
- Administrative changes require authenticated, scoped actions.
- UI is not a security boundary.

## Initial request lifecycle

1. Agent submits intent.
2. API authenticates and normalizes it.
3. Risk service evaluates configured signals.
4. Contract validates agent scope, policy, expiry, nonce, and budget.
5. Contract records authorization atomically and reserves policy budget. Expired reservations require explicit reconciliation.
6. Only an authorized canonical payload reaches the execution adapter.
7. Transaction status is independently observed. Authorization and reservation records are not settlement evidence.
8. Receipt records the actual lifecycle and evidence.

Exact ordering and on-chain/off-chain responsibilities will be finalized in ADRs before execution integration.

## Repository layout (target)

```
contracts/
  outlay/
services/
  api/
  policy/
  risk/
  signer-adapter/
apps/
  dashboard/
docs/
  ARCHITECTURE.md
  decisions/
tests/
  adversarial/
```

## Design constraints

- Policy checks must be deterministic and testable.
- Contract state transitions must be atomic.
- Network-specific behavior must be explicit.
- No UI-only authorization.
- Keep signing and execution separate from policy evaluation.
- Avoid claiming end-to-end protection until the entire path is tested.
