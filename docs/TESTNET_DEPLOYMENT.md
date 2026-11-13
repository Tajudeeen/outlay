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
- Git commit SHA that contains the contract source being deployed.
- GitHub Actions workflow run URL.
- Artifact name and SHA-256 digest.
- Local WASM SHA-256 digest after downloading and extracting the artifact.

The WASM must come from a successful CI run for the intended contract source. Do not deploy a locally rebuilt or unverified binary as if it were the CI artifact.

### Latest verified contract artifact

The latest successful contract workflow artifact checked for this runbook is from contract source commit `60337e0e5ace73e34a6473c0a97db058b6a51189`, workflow run [43409204168](https://github.com/Tajudeeen/outlay/actions/runs/43409204168). The Rust job completed successfully and uploaded `outlay-contract-wasm`.

- Artifact archive SHA-256: `4daf3f3c7f160dd47362480bc33e959ddd968cc5ba868b5ae340b23ea5393aef`
- Extracted `outlay_contract.wasm` SHA-256: `1308b0ae5ac08debdf80c20eb78f439c343a754fc5fecaf9ae3a28c4d426967a`

These are different files and therefore have different digests. The artifact was built from the contract source commit above, not from the later dashboard-only `main` commit.

## Deploy and initialize a fresh account

Download and extract the `outlay-contract-wasm` artifact from the successful contract workflow run. Then deploy to a fresh dedicated testnet account:

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

The initializer sets the contract owner to the account that signs the deployment transaction. Use the dedicated contract account so policy administration is controlled by that account.

## Upgrade an already initialized testnet contract

For a code-only upgrade where the contract state layout is unchanged, deploy the new WASM without calling `new` again. Re-running the initializer is not part of an upgrade. Confirm state before and after the code deployment.

```powershell
near contract deploy <outlay-deployer.testnet> use-file <path-to-outlay_contract.wasm> network-config testnet sign-with-keychain send
```

Do not use `with-init-call new` for a code-only upgrade.

The replay views `is_nonce_consumed(agent_id, nonce)` and `is_intent_consumed(agent_id, intent_id)` must be present before the smoke script can check replay state. Verify both methods after the upgrade.

## Verify a fresh deployment

These expectations apply only to a newly initialized account:

1. Confirm the deploy transaction reached final success.
2. Inspect the account on testnet and confirm contract code is present.
3. Confirm the deployed WASM checksum matches the downloaded CI artifact checksum.
4. Call `get_decision_count` and confirm it returns `0`.
5. Call `get_policy_version` for an unknown policy and confirm it returns `0`.
6. Save the transaction hash, account ID, commit SHA, artifact digest, and verification output in the deployment record.

## Verify an upgrade

Do not expect fresh-deployment zero values after upgrading an initialized account. Capture finalized state immediately before and after the code-only deployment and compare:

- Decision count.
- Policy spend and policy version for `smoke-test`.
- Agent registration and enabled status for `outlay-agent.testnet`.
- Consumed nonce and intent markers, plus unused nonce and intent values.
- Contract code hash and finalized block identifier.

The state values must remain unchanged across a code-only upgrade. Save the before/after outputs and the upgrade transaction hash. Do not run the stateful smoke suite until the upgrade and replay views have been verified.

## Current testnet smoke account record

The last documented baseline for the existing account was:

- Contract: `outlay-deployer.testnet`
- Agent: `outlay-agent.testnet`
- Policy: `smoke-test`
- Reserved budget: `25`
- Decision count: `1`
- Policy version: `1`
- Consumed nonce: `1`
- Consumed intent: `smoke-intent-001`

This is a recorded baseline, not a live RPC confirmation of the current state. Re-read finalized state before any transaction.

## Replay-view verification commands

In Windows PowerShell, pass JSON as a single argument without adding backslashes before its quotes:

```powershell
near contract call-function as-read-only outlay-deployer.testnet is_nonce_consumed json-args '{"agent_id":"outlay-agent.testnet","nonce":"1"}' network-config testnet now

near contract call-function as-read-only outlay-deployer.testnet is_intent_consumed json-args '{"agent_id":"outlay-agent.testnet","intent_id":"smoke-intent-001"}' network-config testnet now
```

Both should return `true`. Check unused values too, which should return `false`:

```powershell
near contract call-function as-read-only outlay-deployer.testnet is_nonce_consumed json-args '{"agent_id":"outlay-agent.testnet","nonce":"999"}' network-config testnet now

near contract call-function as-read-only outlay-deployer.testnet is_intent_consumed json-args '{"agent_id":"outlay-agent.testnet","intent_id":"smoke-intent-unused"}' network-config testnet now
```

## Run the live adversarial suite

The suite is stateful and submits transactions. Its only successful spend raises reserved budget from 25 to 75. It then expects decision count 2 and policy version 3. The script refuses to start unless the exact baseline matches.

Run it once only, after independently confirming the baseline and replay views:

```powershell
.\scripts\testnet-smoke.ps1
.\scripts\testnet-smoke.ps1 -Execute
```

Do not repeat the live run after success. It is not a resettable test fixture. A second run should fail the baseline guard and must not be forced through by editing the expected values.

## Current limitations

- The contract authorizes and reserves budget. It does not transfer assets or sign transactions.
- No signer or Chain Signatures adapter is connected.
- Reservation release is owner-triggered and is only safe while no execution adapter can create a still-valid transaction. Do not add signing or execution until this lifecycle is redesigned and reviewed.
- Testnet success is not a security audit and does not justify production funds.
