# Outlay demo runbook

## Public dashboard

Open https://outlay-dashboard.vercel.app. The dashboard is read-only and queries finalized NEAR testnet contract state. The current smoke-test identifiers are prefilled:

- contract: `outlay-deployer.testnet`
- policy: `smoke-test`
- agent: `outlay-agent.testnet`
- decision: `outlay:276883946:1`

Deployment note: the alias was last confirmed on a READY deployment built from commit `8fa1206ca865163cde77843e34b2ba0443fddd56`. A later deployment attempt for `b8841f1aea640d5031c29bef300bc4ae9aa1e24d` was canceled. Confirm the alias and deployed commit again before recording a demo. Do not imply the canceled build is live.

## Two-minute demo sequence

### 0:00-0:15 - Problem

"Autonomous agents can make useful spending decisions, but giving an agent unrestricted signing authority creates a dangerous failure mode. Outlay puts a deterministic policy boundary between the agent and spending authority."

### 0:15-0:35 - Live contract state

Open the dashboard and refresh. Show the finalized NEAR testnet connection, policy, agent grant, and decision receipt. Point out the displayed block height and full block hash. All views are pinned to that same finalized block, making the snapshot reproducible. Point out the lifecycle strip: authorization is on-chain, execution is not implemented, settlement is not claimed, and execution verification is unavailable. Show the selected decision's reservation state, which is read from the same finalized block as the receipt. The dashboard does not submit transactions.

### 0:35-0:55 - Policy boundary

Show the `smoke-test` policy: 50 units maximum per request, 100 total units, and one allowed destination. Explain that these are contract accounting units for this test, not NEAR transferred.

### 0:55-1:20 - Successful authorization

Open the successful authorization transaction in NEAR Explorer. Show that `outlay-agent.testnet` called `authorize_spend`, the contract checked the registered grant and policy, and the contract stored a decision with cumulative reserved amount 25. Return to the dashboard and show the RPC-read consistency checks, explaining that they are not an independent cryptographic proof.

### 1:20-1:45 - Denial evidence

Open the failed over-limit and unlisted-destination transactions. Then show the nonce and intent replay attempts. Explain that NEAR's transaction output exposes a generic WebAssembly trap for these panics, while the Rust unit tests assert the exact expected panic codes.

### 1:45-2:00 - Honest boundary

"Outlay currently enforces authorization and reserves policy budget on-chain. It does not sign transactions, transfer tokens, or claim settlement. The dashboard is read-only. Execution integration remains a separate security milestone."

## Evidence links

- TypeScript workflow: https://github.com/Tajudeeen/outlay/actions/runs/43411852846
- Contract workflow and WASM artifact: https://github.com/Tajudeeen/outlay/actions/runs/43409204168

The TypeScript workflow was checked on commit `8fa1206ca865163cde77843e34b2ba0443fddd56`. The contract workflow was checked on contract source commit `60337e0e5ace73e34a6473c0a97db058b6a51189`. These are not the same SHA as the later `main` commit.

- Policy creation: https://explorer.testnet.near.org/transactions/C6niQsAExNooj3UEdxS7QiEcveTdemxf75YNqyqwi46q
- Agent registration: https://explorer.testnet.near.org/transactions/2tgPt6UzBxgyTJUE8UiizCkuUpRpy7VY78jhEUUuVoeM
- Successful 25-unit authorization: https://explorer.testnet.near.org/transactions/5afzEhAYg9tX48sydKYcwnLBTy2S3hLh4J4Tp6rzYh8N
- Over-limit rejection: https://explorer.testnet.near.org/transactions/FpnPtfrnjGk919BuCt4bud7u7C5TfUNtTQLZM65CEkMK
- Unlisted-destination rejection: https://explorer.testnet.near.org/transactions/2yz7oybTZ7B35kpZR9EqsQBqfavnBe7JVS1wrCy7eUVe
- Nonce replay rejection: https://explorer.testnet.near.org/transactions/4knqhraRngDbH7QyVdLcHHkyDY9agYauXmQ9uGmHiZpU
- Intent replay rejection: https://explorer.testnet.near.org/transactions/EJiTEMpVrVb2bgQoFK6mmQYLBZCDfQ4nikWbW82nYexS

## Recording checklist

- Use a desktop browser at 100% zoom.
- Refresh the dashboard so the block height and state are current.
- Keep explorer tabs ready for the success and denial transactions.
- Show the agent as the transaction signer, not the owner.
- Do not show keychain contents, private keys, seed phrases, or account recovery material.
- Keep the screen recording focused on the actual interface and on-chain evidence.
- Never describe a reservation as a payment or settlement.
