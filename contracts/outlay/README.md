# Outlay contract

This crate contains the first NEAR authorization contract.

## Current behavior

- Owner configures policies and registers agents.
- Each agent is bound to one policy.
- Authorization checks agent status, policy status, expiry, destination allowlist, per-transaction limit, total budget, nonce replay, and duplicate intent IDs.
- Successful authorization atomically reserves policy budget and stores a decision record. Intent IDs are unique per agent and remain consumed even if an expired reservation is released.
- Every policy update increments a monotonic version, and each decision records the version it evaluated.
- Read-only replay views expose consumed nonce and intent status for advisory preflight. The authorization method repeats these checks atomically.\n- The owner can release a reservation only after its intent expiry. The consumed nonce remains consumed.

## Critical limitation

This contract **does not transfer tokens or sign transactions**. A successful result means the contract authorized and reserved an amount. An expired reservation can be released by the owner for budget reconciliation, but that does not prove a transaction failed. Execution and settlement are separate milestones.

## Build and test

Requires Rust and the NEAR SDK toolchain dependencies.

```sh
cd contracts/outlay
cargo fmt --check
cargo test
cargo build --target wasm32-unknown-unknown --release
```

Do not deploy with real funds before a full review, adversarial tests, and an external audit.
