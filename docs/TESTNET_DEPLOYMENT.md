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

## Upgrade an already initialized testnet contract

For a code-only upgrade where the contract state layout is unchanged, deploy the new WASM without calling `new` again. Re-running the initializer is not part of an upgrade and may fail or reset assumptions. Confirm state before and after the code deployment.

```powershell
near contract deploy <outlay-deployer.testnet> use-file <path-to-outlay_contract.wasm> network-config testnet sign-with-keychain send
```

Do not use `with-init-call new` for a code-only upgrade.

The current contract adds read-only `is_nonce_consumed(agent_id, nonce)` and `is_intent_consumed(agent_id, intent_id)` views. These do not change storage layout, but the API requires them to be present before preflight can check replay state. Verify both methods after the upgrade.

## Verify

1. Confirm the deploy transaction reached final success.
2. Inspect the account on testnet and confirm contract code is present.
3. Confirm the deployed WASM checksum matches the downloaded CI artifact checksum.
4. Call `get_decision_count` and confirm it returns `0`.
5. Call `get_policy_version` for an unknown policy and confirm it returns `0`.
6. Call `is_nonce_consumed` and `is_intent_consumed` for known and unused test values and confirm the expected booleans.
7. Save the transaction hash, account ID, commit SHA, artifact digest, and verification output in the deployment record.

Do not configure policies or register production agents until the deployment has been reviewed.

## Current limitations

- The contract authorizes and reserves budget. It does not transfer assets or sign transactions.
- No signer or Chain Signatures adapter is connected.
- Reservation release is owner-triggered and is only safe while no execution adapter can create a still-valid transaction. Do not add signing or execution until this lifecycle is redesigned and reviewed.
- Testnet success is not a security audit and does not justify production funds.

## Exact next steps for the existing Outlay testnet account

The current live state is the smoke-test baseline:
- Contract: `outlay-deployer.testnet`
- Agent: `outlay-agent.testnet`
- Policy: `smoke-test`
- Reserved budget: `25`
- Decision count: `1`
- Policy version: `1`
- Consumed nonce: `1`
- Consumed intent: `smoke-intent-001`

Download the latest successful [contract workflow artifact](https://github.com/Tajudeeen/outlay/actions/runs/42613038594), named `outlay-contract-wasm`, built from contract commit `749d202082c72559f9357381a9894891d772708c`. The GitHub artifact archive digest is `sha256:c7299466e4631d2f2abfc4986bfff50b4ac35c854e7f3481d3c5a124e59a52d4`. This is the archive digest, not the extracted WASM digest. Extract it to:

`$HOME\Downloads\outlay-contract-wasm\outlay_contract.wasm`

In Windows PowerShell, verify the artifact hash, then perform the code-only upgrade:

```powershell
Get-FileHash "$HOME\Downloads\outlay-contract-wasm\outlay_contract.wasm" -Algorithm SHA256

near contract deploy outlay-deployer.testnet use-file "$HOME\Downloads\outlay-contract-wasm\outlay_contract.wasm" network-config testnet sign-with-keychain send
```

Do not include `with-init-call new`. The existing contract state must remain intact.

Confirm the new replay views:

```powershell
near contract call-function as-read-only outlay-deployer.testnet is_nonce_consumed json-args '{\"agent_id\":\"outlay-agent.testnet\",\"nonce\":\"1\"}' network-config testnet now

near contract call-function as-read-only outlay-deployer.testnet is_intent_consumed json-args '{\"agent_id\":\"outlay-agent.testnet\",\"intent_id\":\"smoke-intent-001\"}' network-config testnet now
```

Both should return `true`. Check unused values too, which should return `false`:

```powershell
near contract call-function as-read-only outlay-deployer.testnet is_nonce_consumed json-args '{\"agent_id\":\"outlay-agent.testnet\",\"nonce\":\"999\"}' network-config testnet now

near contract call-function as-read-only outlay-deployer.testnet is_intent_consumed json-args '{\"agent_id\":\"outlay-agent.testnet\",\"intent_id\":\"smoke-intent-unused\"}' network-config testnet now
```

Then run the full live suite from the repository root:

```powershell
.\scripts\testnet-smoke.ps1
.\scripts\testnet-smoke.ps1 -Execute
```

The script stops if the starting state differs from the baseline. Its only successful spend raises reserved budget from 25 to 75. Expected final state: reserved budget `75`, decision count `2`, policy version `3`. Failed calls pay testnet gas but must not mutate contract state.
