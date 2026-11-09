# Outlay implementation plan

Status key: `[ ]` not started, `[x]` verified complete. Do not mark a task complete without evidence.

## Milestone 0: foundation
- [x] Create public repository.
- [x] Establish README, engineering rules, initial architecture, and threat model.
- [ ] Choose license and contribution policy.
- [ ] Pin toolchain and dependency versions.
- [x] Add CI for formatting, type checks, unit tests, and WASM compilation.

## Milestone 1: contract authorization core
- [x] Initialize Rust workspace and NEAR contract.
- [x] Define canonical spending intent and policy types, with policy versions recorded in decisions.
- [x] Add owner/admin and agent registration with least privilege.
- [x] Add policy creation/update with explicit scope and limits.
- [x] Implement deterministic authorization decision.
- [x] Implement atomic budget reservation accounting.
- [x] Add nonce/replay protection and intent/policy expiry.
- [x] Emit structured authorization and reservation-release events.
- [x] Add 23 contract unit tests covering authorization, ownership, replay, budget limits, policy versions, and reservation lifecycle.
- [x] Cover unauthorized callers, invalid identifiers, replay, and expiry denial paths in contract tests.

## Milestone 2: intent API and policy service
- [x] TypeScript strict intent schema and decimal-string boundaries.
- [x] Agent key issuance, digest-only storage interface, and bearer authentication module.
- [ ] Persistent credential store, key revocation/rotation, rate limiting, and agent-to-policy mapping.
- [ ] Idempotency and request limits.
- [ ] API integration tests against contract behavior.
- [x] Deterministic fail-closed preflight evaluator and unit cases.
- [ ] Fail-closed behavior for critical dependency failures.

## Milestone 3: signing/execution boundary
- [ ] Document signing threat model and supported transaction shapes.
- [ ] Build a strict payload validator.
- [ ] Ensure contract/trusted code constructs signing payloads.
- [ ] Integrate NEAR Chain Signatures only after security review.
- [ ] Verify testnet signing and execution with transaction evidence.
- [ ] Add replay, substitution, and derivation-path tests.

## Milestone 4: risk engine
- [ ] Define risk signal schema, freshness, and provenance.
- [ ] Add deterministic risk rules and escalation outcomes.
- [ ] Test stale/missing/contradictory signals.
- [ ] Ensure risk service cannot override contract denial.

## Milestone 5: adversarial harness
- [ ] Budget race and overspend attempts.
- [x] Replay and expired-intent attacks in contract unit tests and testnet evidence.
- [x] Agent scope enforcement for registered, disabled, and unknown callers.
- [x] Destination and amount-limit denial paths.
- [x] Unauthorized policy mutation rejected by owner checks.
- [ ] Signer payload confusion.
- [x] Rejected authorization leaves budget and decision count unchanged in contract unit tests.
- [x] Malformed policy snapshots fail closed in policy-service tests.
- [ ] External dependency failure injection.

## Milestone 6: dashboard and evidence
- [x] Read-only testnet views for policy, agent grant, and decision receipt (dashboard RPC adapter tests pass; browser RPC check pending).
- [x] Clear testnet, read-only, and authorization-not-payment labels.
- [x] Read-only on-chain decision receipt display.
- [ ] Policy and agent management views.
- [ ] Intent/decision timeline.
- [ ] Receipt verification display.
- [ ] Clear labels for simulated, testnet, and verified execution.
- [ ] End-to-end demo with real testnet evidence.

## Release gates
- No unresolved critical/high security findings.
- All deterministic tests pass.
- Build and CI are reproducible.
- Testnet flow independently verified.
- Claims match evidence.
- External review before production funds.
