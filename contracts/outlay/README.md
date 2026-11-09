# Outlay contract

This crate contains the first NEAR authorization contract.

## Current behavior

- Owner configures policies and registers agents.
- Each agent is bound to one policy.
- Authorization checks agent status, policy status, expiry, destination allowlist, per-transaction limit, total budget, and nonce replay.
- Successful authorization atomically reserves policy budget and returns a decision record.

## Critical limitation

This contract **does not transfer tokens or sign transactions**. A successful result means the contract authorized and reserved an amount. Execution and settlement are separate milestones.

## Build and test

Requires Rust and the NEAR SDK toolchain dependencies.

```sh
cd contracts/outlay
cargo fmt --check
cargo test
cargo build --target wasm32-unknown-unknown --release
```

Do not deploy with real funds before a full review, adversarial tests, and an external audit.
