# Outlay API deployment and operations

## What is ready

The API is implemented as a Node.js 22 service with:
- PostgreSQL-backed agent credential digests.
- One-time API key display, explicit rotation, and revocation audit events.
- Finalized NEAR testnet snapshot reads pinned to one block hash.
- Strict intent validation and deterministic preflight.
- Per-agent fixed-window rate limits.
- 24-hour idempotency response storage.
- No wallet key access, signing, transaction broadcast, or asset transfer.

The service is not deployed yet. A production database and secret values must be supplied by the operator. Upgrade the existing testnet contract first so the nonce and intent replay view methods are available to API preflight.

## Required secrets and settings

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `PGSSL` | Set to `require` for hosted PostgreSQL with TLS |
| `OUTLAY_ADMIN_TOKEN` | Random admin secret, at least 32 characters |
| `OUTLAY_CONTRACT_ID` | NEAR testnet contract account |
| `NEAR_TESTNET_RPC_URL` | HTTPS NEAR testnet RPC endpoint |
| `PORT` | HTTP listen port, defaults to 8787 |

Generate an admin token on a trusted machine with:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Store it in the hosting provider's secret manager. Never put it in dashboard JavaScript, a committed file, or a browser request from an untrusted page.

## Local container run

Docker Compose is provided for environments with Docker available. Copy the API environment example, set a random admin token in a root `.env` file, then run:

```sh
docker compose up --build
```

The local compose file uses a local-only database password and should never be reused for production. It runs the idempotent initial schema migration before starting the API.

Health check:

```sh
curl http://localhost:8787/health
```

## Agent key lifecycle

Issue the first API key for an agent that already has an enabled grant on the configured contract:

```sh
curl -X POST http://localhost:8787/v1/admin/agent-keys \
  -H "content-type: application/json" \
  -H "x-outlay-admin-token: $OUTLAY_ADMIN_TOKEN" \
  -d '{"agentId":"outlay-agent.testnet"}'
```

The response contains the raw key once. Save it in the agent's secret manager. The database stores only the digest.

Rotate a key by setting `"rotate": true`. Existing active keys are revoked in the same transaction that inserts the replacement. Revoke all keys for an agent:

```sh
curl -X POST http://localhost:8787/v1/admin/agent-keys/revoke \
  -H "content-type: application/json" \
  -H "x-outlay-admin-token: $OUTLAY_ADMIN_TOKEN" \
  -d '{"agentId":"outlay-agent.testnet"}'
```

## Preflight request

The caller must send a strict intent body, an API bearer key, and a unique idempotency key. The API checks that the authenticated agent ID matches the intent and reads the current grant and policy from NEAR testnet. The current schema accepts only the `policy-unit` marker. Amounts are abstract integer policy units, not NEAR, yoctoNEAR, USDC, or a transferable asset quantity. The contract does not store or enforce an asset identifier.

```sh
curl -X POST http://localhost:8787/v1/intents/preflight \
  -H "content-type: application/json" \
  -H "authorization: Bearer $OUTLAY_AGENT_API_KEY" \
  -H "idempotency-key: intent-demo-0001" \
  -d '{
    "intentId":"intent-demo-0001",
    "agentId":"outlay-agent.testnet",
    "policyId":"smoke-test",
    "network":"near-testnet",
    "assetId":"policy-unit",
    "destination":"outlay-agent.testnet",
    "amount":"10",
    "nonce":"100",
    "expiresAtNs":"1900000000000000000",
    "createdAtNs":"1794200000000000000"
  }'
```

A 200 response means only that the advisory preflight passed against the observed finalized block. It is not an authorization. The caller still submits `authorize_spend` from the registered NEAR agent account, and the contract remains authoritative. A preflight can become stale immediately after the snapshot.

## Production checklist

- Use managed PostgreSQL with TLS, backups, point-in-time recovery, and monitoring.
- Run migrations as a one-off release step before deploying new API versions.
- Keep `OUTLAY_ADMIN_TOKEN` in a secret manager and rotate it if exposed.
- Restrict admin route access at the network or gateway layer where possible.
- Put the API behind HTTPS and an appropriate request gateway.
- Configure database connection limits and alert on connection exhaustion.
- Set log redaction rules. Never log Authorization headers, admin tokens, or API keys.
- Set a retention job for expired idempotency and rate-limit rows.
- Do not expose admin routes to browser code.
- Keep mainnet support disabled until a separate schema, contract, and operational review.

## Remaining boundary

This API does not sign, broadcast, or transfer funds. Do not add a signer adapter until reservation lifecycle semantics are redesigned and reviewed. In particular, owner-triggered reservation release is unsafe once a still-valid execution path exists.
