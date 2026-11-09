# ADR 0002: authorization reserves budget but does not imply settlement

- Status: accepted
- Date: 2026-11-09

## Context

An authorization receipt can be mistaken for proof that a payment was executed or settled.

## Decision

The initial contract's successful `authorize_spend` call means only that policy checks passed and budget was reserved. It does not transfer funds, sign a transaction, or prove settlement.

## Consequences

- APIs and dashboard must use explicit lifecycle states.
- A separate execution adapter and independent transaction verification are required.
- Receipt formats must never label authorization as payment completion.
- A later release must define reservation release/expiry and reconciliation semantics.
