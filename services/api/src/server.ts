import { createServer } from "node:http";
import { Pool } from "pg";
import { NearRpcReader } from "./near-client.js";
import { createApiHandler } from "./handler.js";
import { PgOutlayStore } from "./store.js";

const databaseUrl = process.env.DATABASE_URL;
const adminToken = process.env.OUTLAY_ADMIN_TOKEN;
const contractId = process.env.OUTLAY_CONTRACT_ID ?? "outlay-deployer.testnet";
const port = Number(process.env.PORT ?? "8787");

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminToken || adminToken.length < 32) throw new Error("OUTLAY_ADMIN_TOKEN must contain at least 32 characters");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT is invalid");

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ...(process.env.PGSSL === "require" ? { ssl: { rejectUnauthorized: true } } : {}),
});
const store = new PgOutlayStore(pool);
const chain = new NearRpcReader(process.env.NEAR_TESTNET_RPC_URL ?? "https://rpc.testnet.fastnear.com");
const handler = createApiHandler({ store, chain, contractId, adminToken });

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 16 * 1024) {
        outgoing.writeHead(413, { "content-type": "application/json" });
        outgoing.end(JSON.stringify({ error: "BODY_TOO_LARGE" }));
        return;
      }
      chunks.push(buffer);
    }
    const method = incoming.method ?? "GET";
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) for (const item of value) headers.append(key, item);
      else if (value !== undefined) headers.set(key, value);
    }
    const body = method === "GET" || method === "HEAD" ? undefined : Buffer.concat(chunks).toString("utf8");
    const request = new Request(`http://127.0.0.1:${port}${incoming.url ?? "/"}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
    outgoing.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`outlay-api listening on :${port}\n`);
});

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}
process.on("SIGINT", () => { void shutdown().finally(() => process.exit(0)); });
process.on("SIGTERM", () => { void shutdown().finally(() => process.exit(0)); });
