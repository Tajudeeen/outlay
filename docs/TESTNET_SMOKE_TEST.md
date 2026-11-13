# Testnet adversarial smoke suite

This suite runs against the dedicated NEAR testnet deployment. It uses the existing accounts:

- contract owner: `outlay-deployer.testnet`
- test agent: `outlay-agent.testnet`
- policy: `smoke-test`

The amounts are contract accounting units, not NEAR transfers.

## Preconditions

- Deploy the latest successful `outlay-contract-wasm` artifact to `outlay-deployer.testnet` without calling `new()` again.
- Confirm the starting state is reserved budget 25, decision count 1, policy version 1, and enabled agent.
- Confirm the replay views report the known nonce and intent as consumed and unused values as clear.
- Keep both account keys in the local NEAR CLI keychain. Never export or paste private keys.
- Read `docs/TESTNET_DEPLOYMENT.md` and verify the current finalized state before submitting transactions.

## Run on Windows PowerShell

From a local clone after pulling the intended branch:

```powershell
.\scripts\testnet-smoke.ps1
.\scripts\testnet-smoke.ps1 -Execute
```

The first invocation is a dry-run notice. The second submits transactions and spends testnet gas.

## Important: one-shot stateful test

This is not a repeatable test fixture. The successful 50-unit authorization changes the live contract state. The script expects reserved budget 25, decision count 1, and policy version 1 before it starts. Its expected final state is reserved budget 75, decision count 2, and policy version 3.

Run the live suite once only after confirming the baseline. Do not rerun it after success, and do not weaken the baseline guard to force a second run. If the baseline differs, stop and inspect finalized contract state.

## Scenarios

| Case | Expected outcome |
|---|---|
| valid 50-unit request | succeeds, cumulative reservation becomes 75 |
| 26-unit request after 75 reserved | rejected by total budget |
| owner account acting as agent | rejected as unregistered caller |
| disabled agent | rejected |
| disabled policy | rejected |
| already expired intent | rejected |
| intent expiry beyond policy expiry | rejected |
| policy cap reduced below 75 reserved | rejected by `BUDGET_BELOW_RESERVED` |

The script also checks the existing over-limit, unlisted destination, nonce replay, and intent replay conditions. Those failed transactions may appear in the CLI as generic WebAssembly traps. Contract unit tests assert the precise panic codes. A failed live transaction plus unchanged state confirms rejection, but the CLI output alone does not prove which guard produced the trap.

## Scope

This is a smoke/regression suite, not a load test, formal verification, or security audit. It does not test concurrent requests, signing, token transfers, or settlement. No execution adapter is connected.
