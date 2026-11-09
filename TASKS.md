# Outlay implementation plan

Status key: `[ ]` not started, `[x]` verified complete. Do not mark a task complete without evidence.

## Milestone 0: foundation
- [x] Create public repository.
- [x] Establish README, engineering rules, initial architecture, and threat model.
- [ ] Choose license and contribution policy.
- [ ] Pin toolchain and dependency versions.
- [ ] Add CI for formatting, linting, type checks, and tests.

## Milestone 1: contract authorization core
- [ ] Initialize Rust workspace and NEAR contract.
- [ ] Define canonical spending intent and policy types.
- [ ] Add owner/admin and agent registration with least privilege.
- [ ] Add policy creation/update with explicit scope and limits.
- [ ] Implement deterministic authorization decision.
- [ ] Implement atomic budget accounting.
- [ ] Add nonce/replay protection and expiry.
- [ ] Emit decision events with stable identifiers.
- [ ] Unit tests for all allow/deny branches and state invariants.
- [ ] Contract tests for unauthorized and adversarial calls.

## Milestone 2: intent API and policy service
- [x] TypeScript strict intent schema and decimal-string boundaries (CI pending).
- [ ] Authentication and agent-to-policy mapping.
- [ ] Idempotency and request limits.
- [ ] API integration tests against contract behavior.
- [x] Deterministic fail-closed preflight evaluator and unit cases (CI pending).\n- [ ] Fail-closed behavior for critical dependency failures.

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
- [ ] Replay and expired-intent attacks.
- [ ] Agent scope escalation.
- [ ] Destination/amount substitution.
- [ ] Unauthorized policy mutation.
- [ ] Signer payload confusion.
- [ ] Failure injection and fail-closed tests.

## Milestone 6: dashboard and evidence
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
