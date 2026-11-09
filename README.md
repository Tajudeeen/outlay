# Outlay

Outlay is a security layer for autonomous agent spending. Agents may propose spending actions, but they should never hold unrestricted authority over funds.

**Core principle:** every spend must pass explicit, deterministic policy checks before execution. The system should fail closed, preserve an auditable decision trail, and make security claims only when backed by tests or verifiable evidence.

> Status: early engineering. No production or mainnet security guarantees are claimed.

## What we're building

- **Policy enforcement:** contract-enforced budgets, agent scopes, destination allowlists, expiry, and replay protection.
- **Agent authentication:** high-entropy bearer keys with digest-only storage and constant-time verification.
- **Spending intents:** structured requests that can be validated independently of agent behavior.
- **Decision receipts:** on-chain records of successful authorizations and budget reservations. Preflight denials are API responses, not on-chain decision records.
- **NEAR integration:** contract-enforced authorization, with Chain Signatures considered only behind strict payload validation.
- **Risk evaluator prototype:** deterministic signal checks for clear, review, and deny outcomes. No live external risk provider is connected yet.
- **Adversarial testing:** replay, expiry, budget exhaustion, malformed requests, compromised-agent, and boundary tests.
- **Dashboard:** inspect on-chain policies, agent grants, decision receipts, and testnet evidence.

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
- `apps/dashboard/`: read-only NEAR testnet control plane for policies, agent grants, and authorization receipts.
- `docs/`: architecture, threat model, decisions, and test strategy.
- `tests/`: cross-component and adversarial tests.

## Development status

Open the [live read-only testnet dashboard](https://outlay-dashboard.vercel.app). The [agent API](services/api/README.md) and [API deployment runbook](docs/API_DEPLOYMENT.md) are now implemented, but the API still needs a managed PostgreSQL instance and deployment secrets before it can be hosted. See [TASKS.md](TASKS.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [SECURITY.md](SECURITY.md), the [testnet deployment runbook](docs/TESTNET_DEPLOYMENT.md), and the [two-minute demo runbook](docs/DEMO_RUNBOOK.md). Preview the read-only dashboard with `python -m http.server 4173 --directory apps/dashboard` and open `http://localhost:4173`. See [the testnet adversarial smoke suite](docs/TESTNET_SMOKE_TEST.md) for the repeatable PowerShell test runner.

## License

License not yet selected. Do not assume permission to reuse this code until a license is added.


## Local development

Requires Node.js 22+ and pnpm 10+.

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

The root commands build the shared policy package before checking or testing dependent services. PostgreSQL integration tests run when `DATABASE_URL` is configured. GitHub Actions runs them against a disposable PostgreSQL service.
