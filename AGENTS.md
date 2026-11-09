# Engineering rules for Outlay

## Required workflow

1. Read `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, and relevant decision records before changing behavior.
2. State the threat or user problem the change addresses.
3. Make the smallest coherent implementation.
4. Add deterministic tests, including denial and failure cases.
5. Run formatting, linting, type checks, and tests. Report commands and results accurately.
6. Review changed code for trust-boundary mistakes, authorization bypasses, replay, and unsafe defaults.
7. Update docs and task status only after verification.
8. Commit in focused units. Never claim a check passed if it was not run.

## Security invariants

- Default to deny when policy, identity, state, or verification is missing or ambiguous.
- The agent is untrusted. It may propose an intent, never define its own authority.
- Authorization is checked at the trusted execution boundary.
- Never sign arbitrary bytes, hashes, or transactions supplied by an agent.
- Spending limits must be enforced atomically against authoritative state.
- Expiry, replay protection, and idempotency must be explicit.
- A receipt is evidence of a decision, not proof that funds moved unless a transaction is independently verified.
- No secrets, private keys, seed phrases, or production credentials in repository files, tests, logs, or screenshots.

## Implementation discipline

- Prefer explicit types and narrow interfaces.
- Avoid mock security in production paths.
- Test edge cases and adversarial input.
- Keep external calls out of deterministic policy logic.
- Separate policy decision from transaction execution.
- Do not add dependencies without a clear reason.
- Do not silently broaden permissions or upgrade authority.

## Reporting

Every milestone report must distinguish:
- implemented,
- tested locally,
- verified on testnet,
- verified on mainnet,
- not yet verified.
