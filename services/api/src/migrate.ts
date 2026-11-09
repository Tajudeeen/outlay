import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
  ...(process.env.PGSSL === "require" ? { ssl: { rejectUnauthorized: true } } : {}),
});

try {
  const migration = await readFile(resolve(process.cwd(), "migrations/001_initial.sql"), "utf8");
  await pool.query(migration);
  process.stdout.write("Outlay API schema is up to date.\n");
} finally {
  await pool.end();
}
