# ADR 0003: authorization creates an expiring budget reservation

- Status: accepted
- Date: 2026-11-09

## Context

The first authorization contract reserves policy budget before any transaction execution exists. Without a lifecycle, abandoned authorizations permanently consume budget. Releasing a reservation too early could permit an agent to reuse budget while an earlier transaction is still executable.

## Decision

- Successful authorization stores a decision record and consumes its nonce.
- The reservation remains counted against the policy budget until its intent expiry.
- Only the contract owner can trigger release in this initial version.
- Release is permitted only at or after the recorded intent expiry.
- Release is idempotent and cannot be performed twice.
- Releasing a reservation does not restore the nonce.
- Release does not prove that execution failed or that funds were not transferred.

## Consequences

- The contract must store decision records and reservation release state.
- Off-chain systems must distinguish reserved budget from settled spend.
- Future execution integration must reconcile actual transaction state before making settlement claims.
- A future version may replace owner-triggered release with a permissionless, deterministic expiry path after gas and storage analysis.
- A production release needs explicit cancellation, execution, and settlement semantics plus adversarial review.
