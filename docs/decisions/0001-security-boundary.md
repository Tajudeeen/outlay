# ADR 0001: authorization must be enforced at the trusted boundary

- Status: accepted
- Date: 2026-11-09

## Context

Autonomous agents can be prompt-injected, compromised, or simply incorrect. UI checks and API-only limits can be bypassed if an agent or service obtains broader authority.

## Decision

The NEAR contract is the authoritative enforcement boundary for permissions and budget state. Agents submit intents only. The contract validates scope, policy, expiry, replay protection, and budget before recording authorization. Signing and execution are separate, constrained stages.

## Consequences

- Contract state and logic must be designed before UI polish.
- Budget checks must be atomic.
- Policy denial cannot be overridden by risk services or dashboard actions.
- Receipts must distinguish authorization from actual execution.
- Some policy inputs may need on-chain representation or authenticated commitments; this tradeoff requires further ADRs.
