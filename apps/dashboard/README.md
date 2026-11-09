# Outlay dashboard

A static, read-only control plane for the Outlay NEAR testnet contract.

## Preview locally

From the repository root:

```powershell
python -m http.server 4173 --directory apps/dashboard
```

Open http://localhost:4173.

## What it reads

The dashboard calls finalized NEAR JSON-RPC view methods:

- `get_decision_count`
- `get_policy`
- `get_policy_version`
- `get_policy_spend`
- `get_agent_grant`
- `get_decision`
- `is_reservation_released`

The RPC adapter preserves integer values as strings so u64/u128 amounts and timestamps are not rounded by JavaScript's Number type. The selected receipt also shows whether its budget reservation is still reserved or has been released, using a view pinned to the same finalized block.

## Security boundary

This dashboard is read-only. It does not connect a wallet, sign transactions, edit policies, register agents, transfer tokens, or claim settlement. Owner and agent transactions are submitted separately through the NEAR CLI in this testnet prototype.

Public testnet RPC availability and browser CORS policy are external dependencies. A dashboard query failure must never be interpreted as an authorization allow.
