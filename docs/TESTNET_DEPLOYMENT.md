# NEAR testnet deployment runbook

## Status

The contract builds as WASM in GitHub Actions and the CI workflow publishes an artifact named `outlay-contract-wasm`. This runbook is for a testnet deployment only. No mainnet deployment is authorized by this document.

## Prerequisites

- A NEAR testnet account dedicated to Outlay.
- Access to that account through the NEAR CLI secure keychain.
- The current `outlay-contract-wasm` artifact from a successful contract workflow run.
- A clean CI run for the exact commit being deployed.

Install and configure the current Rust-based NEAR CLI by following the official guide: https://github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md

Do not paste seed phrases or private keys into chat, GitHub issues, source files, shell history, or CI logs.

## Build provenance

Before deployment, record:
- Git commit SHA.
- GitHub Actions workflow run URL.
- Artifact name and SHA-256 digest.
- Local WASM SHA-256 digest after downloading the artifact.

The WASM must come from a successful CI run for the intended commit. Do not deploy a locally rebuilt or unverified binary as if it were the CI artifact.

## Deploy and initialize

Download and extract the `outlay-contract-wasm` artifact from the successful GitHub Actions run. Then deploy to the dedicated testnet account:

```sh
near contract deploy <outlay-contract.testnet> \
  use-file <path-to-outlay_contract.wasm> \
  with-init-call new \
  json-args '{}' \
  prepaid-gas '100 TGas' \
  attached-deposit '0 NEAR' \
  network-config testnet \
  sign-with-keychain \
  send
```

The initializer sets the contract owner to the account that signs the deployment transaction. Use the dedicated contract account so that policy administration is controlled by that account.

## Verify

1. Confirm the deploy transaction reached final success.
2. Inspect the account on testnet and confirm contract code is present.
3. Confirm the deployed WASM checksum matches the downloaded CI artifact checksum.
4. Call `get_decision_count` and confirm it returns `0`.
5. Call `get_policy_version` for an unknown policy and confirm it returns `0`.
6. Save the transaction hash, account ID, commit SHA, artifact digest, and verification output in the deployment record.

Do not configure policies or register production agents until the deployment has been reviewed.

## Current limitations

- The contract authorizes and reserves budget. It does not transfer assets or sign transactions.
- No signer or Chain Signatures adapter is connected.
- Reservation release is owner-triggered and is only safe while no execution adapter can create a still-valid transaction. Do not add signing or execution until this lifecycle is redesigned and reviewed.
- Testnet success is not a security audit and does not justify production funds.
