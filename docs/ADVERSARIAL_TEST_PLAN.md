# Outlay adversarial test plan

This document separates deterministic local checks from live-network checks. A passing unit test is not evidence of an actual concurrent chain execution.

## Contract authorization and budget invariants

The contract must preserve these invariants:

1. Reserved spend for a policy never exceeds its configured total budget.
2. Every accepted decision consumes exactly one agent-scoped nonce and one agent-scoped intent ID.
3. A rejected authorization does not increment decision count, reserve budget, or consume its nonce/intent.
4. Two agents assigned to one policy share the same policy budget.
5. Policy updates cannot reduce the total budget below current reservations.
6. Policy version is captured in each decision and increments on each policy replacement.
7. A released reservation does not restore replay identifiers.
8. Reservation release is owner-only, after intent expiry, and one-time.
9. Authorization is not execution, payment, or settlement.

## Automated adversarial cases

| Attack | Expected outcome | Evidence |
|---|---|---|
| Agent A reserves 60, Agent B reserves 60 from a 100-unit shared policy | Second call traps, reserved remains 60 | Contract test |
| Sequential 40 + 60 reservations | Both succeed, reserved exactly 100 | Contract test |
| Additional 1-unit reservation after budget reaches 100 | Traps, count and reserved unchanged | Contract test |
| u128 max reservation followed by +1 | Checked overflow traps, state unchanged | Contract test |
| Reuse nonce with new intent | Denied | Contract + testnet smoke |
| Reuse intent with new nonce | Denied | Contract + testnet smoke |
| Destination or transaction cap bypass | Denied | Contract + testnet smoke |
| Disable agent or policy between calls | New authorization denied | Contract + testnet smoke |
| RPC unavailable or inconsistent block data | API preflight returns unavailable, no authorization claim | API/RPC tests |
| Credential DB unavailable | Authentication fails closed | API failure-injection test |
| Idempotency DB read/write unavailable | API returns 503 | API failure-injection tests |
| Rate-limit DB unavailable | API returns 503 | API failure-injection test |
| Concurrent initial API key issuance | Only one active credential | PostgreSQL integration test |

## Live testnet procedure

Run only after the code-only contract upgrade and confirm the replay views:

1. Record policy spend, decision count, and version before the suite.
2. Execute the PowerShell smoke suite once from its documented baseline.
3. Verify every rejected call leaves spend and decision count unchanged.
4. Verify successful calls increment state exactly as the script expects.
5. Query consumed nonce and intent views after successful calls.
6. Save transaction hashes, block heights, and command output.
7. Do not repeat the stateful suite without resetting/reconciling its expected baseline.

## Still not tested

- True simultaneous chain transactions competing for the same policy budget. NEAR serializes contract execution, and the unit tests model the sequential state transition, not network contention.
- Signer payload confusion, transaction substitution, derivation-path misuse, or execution replay.
- Token transfers, settlement, and external protocol failures.
- Independent third-party review.

The contract's atomic checks are the protection against concurrent spend attempts. Do not claim a live race test until two competing transactions have been submitted and their on-chain outcomes inspected.
