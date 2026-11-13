# Outlay dashboard

The dashboard has two surfaces:

- `/` is the complete workspace UI preview. It exposes the product areas for overview, policy management, agent registry, intent intake, decision history, risk review, execution boundary, audit log, and settings.
- The Overview includes a finalized on-chain snapshot of the known `smoke-test` policy and `outlay-agent.testnet` grant, read from one consistent NEAR testnet block.
- `/live.html` is the read-only NEAR testnet contract inspector. It reads finalized contract state and shows the current policy, agent grant, decision receipt, reservation state, and historical transaction evidence.

## Workspace preview

The workspace uses clearly labelled sample records so the complete product experience can be reviewed before backend and contract integration. Policy creation, agent registration, intent simulation, risk review, and status toggles only change in-memory preview data. They do not call the API, connect a wallet, issue keys, consume nonces, reserve budget, submit transactions, sign, transfer assets, or claim settlement.

## Live contract inspector

The Overview's live snapshot and the live inspector call finalized NEAR JSON-RPC view methods. Overview snapshot reads are pinned to the same finalized block and reject mixed-block results. They are read-only and do not imply that sample workspace records are live.

The live inspector calls finalized NEAR JSON-RPC view methods:

- `get_decision_count`
- `get_policy`
- `get_policy_version`
- `get_policy_spend`
- `get_agent_grant`
- `get_decision`
- `is_reservation_released`

The RPC adapter preserves integer values as strings so u64/u128 amounts and timestamps are not rounded by JavaScript's Number type. The selected receipt shows whether its budget reservation is still reserved or has been released, using a view pinned to the same finalized block.

## Security boundary

The dashboard is not an authorization boundary. The contract remains authoritative. The current prototype authorizes and reserves policy budget only. It does not sign, broadcast, transfer tokens, or prove settlement. A preview action must never be treated as an actual policy mutation or on-chain decision.

## Preview locally

From the repository root:

```powershell
python -m http.server 4173 --directory apps/dashboard
```

Open http://localhost:4173.
