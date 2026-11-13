# Outlay submission readiness

## Verified repository and CI snapshot

Snapshot checked on 2026-11-13.

- Repository: https://github.com/Tajudeeen/outlay
- Main branch at review time: `b8841f1aea640d5031c29bef300bc4ae9aa1e24d`
- Latest checked TypeScript workflow: run [43411852846](https://github.com/Tajudeeen/outlay/actions/runs/43411852846), successful for commit `8fa1206ca865163cde77843e34b2ba0443fddd56`.
- Latest checked contract workflow: run [43409204168](https://github.com/Tajudeeen/outlay/actions/runs/43409204168), Rust job successful for contract source commit `60337e0e5ace73e34a6473c0a97db058b6a51189`.
- Contract artifact: `outlay-contract-wasm`, uploaded by run 43409204168. The archive and extracted WASM checksums are recorded in `docs/TESTNET_DEPLOYMENT.md`.
- Vercel production alias: last checked READY deployment was built from `8fa1206ca865163cde77843e34b2ba0443fddd56`. The later attempt for `b8841f1aea640d5031c29bef300bc4ae9aa1e24d` was canceled. Recheck the alias before demo day.

These checks refer to different commits. Do not present them as one clean, green CI run for the current main SHA.

## Product boundary

Outlay currently provides deterministic policy evaluation and on-chain authorization/reservation records. The dashboard reads finalized testnet state and is read-only.

- No wallet signing or transaction broadcasting by the dashboard.
- No token transfer, payment, settlement, or execution adapter.
- No mainnet deployment.
- Risk review uses deterministic local rules, not a live external risk provider.
- Some dashboard sections are preview-only. Do not present unfinished management flows as fully operational.
- The API requires configured PostgreSQL and secrets for a real deployment. Do not claim the hosted API is production-ready without verifying its database and environment configuration.

## Release blockers before a strong public demo

- [ ] Recheck current main branch CI after the readiness changes are pushed.
- [ ] Verify the production alias points to the intended deployment and inspect the deployed commit.
- [ ] Run a desktop and mobile visual pass on the live dashboard.
- [ ] Re-read finalized NEAR testnet state for the contract, policy, agent, decision, replay markers, and code hash.
- [ ] Confirm whether the current deployed contract already exposes both replay views. Do not upgrade until the pre-upgrade state has been recorded.
- [ ] If upgrading, use the successful CI artifact, perform a code-only deployment without `new`, then compare finalized state before and after.
- [ ] Run the stateful adversarial suite only if its exact starting baseline is present. It changes testnet state and must not be repeated after success.
- [ ] Verify API database and environment configuration before demonstrating API-backed flows.
- [ ] Record the demo using actual dashboard and explorer evidence. Keep the execution and settlement limitations explicit.

## Demo story

1. Show the problem: autonomous agents need bounded spending authority.
2. Show the policy: per-request cap, total budget, destination allowlist.
3. Show the registered agent and finalized contract snapshot.
4. Open the successful authorization transaction and the stored decision.
5. Show denial evidence for replay, destination, and budget violations.
6. Close by stating clearly that Outlay authorizes and reserves. It does not sign, transfer, or settle funds.

## Submission description

Outlay is a NEAR-based authorization layer for autonomous-agent spending. It evaluates requests against deterministic policies before recording an on-chain authorization decision and budget reservation. Its read-only dashboard presents finalized contract state and an auditable view of policy, agent, and decision data. The current testnet prototype does not sign transactions, transfer assets, or claim settlement.
