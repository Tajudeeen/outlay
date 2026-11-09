# Outlay API

A small Node.js API for agent credentials and advisory spend-intent preflight. It is deliberately unable to sign NEAR transactions or submit contract calls.

## Routes

### Health
`GET /health`

Checks database reachability. Does not expose connection strings or secrets.

### Issue or rotate an agent API key
`POST /v1/admin/agent-keys`

Requires `x-outlay-admin-token`. Body:

```json
{ "agentId": "outlay-agent.testnet" }
```

To rotate an existing key, pass `"rotate": true`. The API first verifies that the agent has an enabled grant on the configured NEAR contract. The raw key is returned once. Only its SHA-256 digest is stored. Rotation revokes all previous active keys in the same database transaction.

### Revoke an agent's keys
`POST /v1/admin/agent-keys/revoke`

Requires `x-outlay-admin-token`. Body:

```json
{ "agentId": "outlay-agent.testnet" }
```

The API returns the number of credentials revoked. An append-only key-event record is written for each revoked key.

### Preflight an intent
`POST /v1/intents/preflight`

Requires `Authorization: Bearer outlay_agent_...` and an `Idempotency-Key` header containing 8-128 safe characters. The body follows the strict `SpendIntentSchema`. The only accepted asset marker is `policy-unit`, which represents abstract integer policy units. Amounts are not token denominations or payment amounts.

The API resolves the agent from the credential, checks the identity matches the intent, reads finalized grant/policy/version/reserved-budget state plus consumed nonce and intent status from one pinned NEAR testnet block, and runs deterministic BigInt preflight checks. Requests are limited to 60 per agent per minute by default. Idempotency results are retained for 24 hours.

A positive result is `preflight_allowed`, never `authorized`. It includes the finalized block reference and tells the caller to submit `authorize_spend` from the registered NEAR account. Only the contract can make the final authorization decision and reserve budget. This API does not possess agent wallet keys.

## Persistence

PostgreSQL stores credential digests, key lifecycle audit events, fixed-window rate counters, and idempotency results. The migration is in `migrations/001_initial.sql`.

## Run locally

Requires Node.js 22+, pnpm 10+, and PostgreSQL.

```sh
pnpm install
pnpm --filter @outlay/policy build
pnpm --filter @outlay/api build
cp .env.example .env
# Set real local DATABASE_URL and a random OUTLAY_ADMIN_TOKEN in your shell.
pnpm --filter @outlay/api migrate
pnpm --filter @outlay/api start
```

Do not commit `.env`. Use a managed PostgreSQL provider with TLS in hosted environments. Keep the admin token in the deployment secret manager.

## Security boundaries and remaining work

- This service is an API and preflight layer, not the contract authority.
- A successful preflight can become stale immediately. Always submit to the contract and trust its result.
- The API never signs, broadcasts, or transfers funds.
- The current testnet account is a test fixture. Mainnet is rejected by the shared intent schema.
- Configure a database backup policy, rotation alerts, and operational monitoring before production use.
- Do not expose the admin token to browser code.
- CORS is intentionally not enabled by default. Put an authenticated gateway in front of browser clients if browser access is later required.
