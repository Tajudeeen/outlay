# Outlay

Outlay is a security layer for autonomous agent spending. Agents may propose spending actions, but they should never hold unrestricted authority over funds.

**Core principle:** every spend must pass explicit, deterministic policy checks before execution. The system should fail closed, preserve an auditable decision trail, and make security claims only when backed by tests or verifiable evidence.

> Status: early engineering. No production or mainnet security guarantees are claimed.

## What we're building

- **Policy enforcement:** budgets, scopes, destinations, expiry, and approval requirements.
- **Spending intents:** structured requests that can be validated independently of agent behavior.
- **Decision receipts:** durable records of allow/deny outcomes and policy context.
- **NEAR integration:** contract-enforced authorization, with Chain Signatures considered only behind strict payload validation.
- **Risk engine:** additional signals that can deny or escalate requests, never silently override contract policy.
- **Adversarial testing:** replay, expiry, budget exhaustion, malformed requests, compromised-agent, and boundary tests.
- **Dashboard:** inspect policies, intents, decisions, and evidence.

## Security stance

- Deny by default.
- Never sign arbitrary agent-supplied payloads.
- Enforce limits at the trusted boundary, not only in UI or service code.
- Treat agents, their prompts, and their runtime as potentially compromised.
- Keep secrets out of source control and logs.
- Distinguish simulated flows from real on-chain execution.

## Repository map

- `contracts/`: NEAR Rust contracts.
- `services/`: TypeScript API and policy/risk services.
- `apps/`: web dashboard.
- `docs/`: architecture, threat model, decisions, and test strategy.
- `tests/`: cross-component and adversarial tests.

## Development status

See [TASKS.md](TASKS.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), and [SECURITY.md](SECURITY.md).

## License

License not yet selected. Do not assume permission to reuse this code until a license is added.
