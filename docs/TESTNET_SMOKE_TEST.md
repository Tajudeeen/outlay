# Testnet adversarial smoke suite

This suite runs against the dedicated NEAR testnet deployment. It uses the existing accounts:

- contract owner: `outlay-deployer.testnet`
- test agent: `outlay-agent.testnet`
- policy: `smoke-test`

The amounts are contract accounting units, not NEAR transfers.

## Preconditions

- Deploy the latest successful `outlay-contract-wasm` artifact to `outlay-deployer.testnet` without calling `new()` again.
- Confirm the starting state is reserved budget 25, decision count 1, policy version 1, and enabled agent.
- Keep both account keys in the local NEAR CLI keychain. Never export or paste private keys.

## Run on Windows PowerShell

From a local clone after pulling the latest `main`:

```powershell
.\scripts\testnet-smoke.ps1
.\scripts\testnet-smoke.ps1 -Execute
```

The first invocation is a dry-run notice. The second submits the transactions.

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

The script checks final invariants: reserved budget 75, decision count 2, policy version 3. It stops if the starting state differs, so it cannot silently run against unexpected state.

The earlier manual session separately exercised an over-limit request, unlisted destination, nonce replay, and intent replay. Those failed transactions appeared in the CLI as generic WebAssembly traps. Contract unit tests assert the precise panic codes. A failed live transaction plus unchanged state confirms rejection, but the CLI output alone does not prove which guard produced the trap.

## Scope

This is a smoke/regression suite, not a load test, formal verification, or security audit. It does not test concurrent requests, signing, token transfers, or settlement. No execution adapter is connected.
