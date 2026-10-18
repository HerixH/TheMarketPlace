// Copies data/db.json and data/uploads into the Postgres database at DATABASE_URL.
// Existing rows with the same id are overwritten; nothing is deleted.
// Run with: npm run db:import
import { promises as fs } from "fs";
import path from "path";
import pg from "pg";

const COLLECTIONS = ["products", "orders", "reviews", "accounts", "sessions", "reports", "payouts", "support"];
const TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
const DATA_DIR = path.join(process.cwd(), "data");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const db = JSON.parse(await fs.readFile(path.join(DATA_DIR, "db.json"), "utf8"));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS records (
      collection text NOT NULL,
      id text NOT NULL,
      data jsonb NOT NULL,
      seq bigserial,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX IF NOT EXISTS records_seq ON records (collection, seq);
    CREATE TABLE IF NOT EXISTS uploads (
      name text PRIMARY KEY,
      content_type text NOT NULL,
      data bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await client.query("BEGIN");
  for (const name of COLLECTIONS) {
    const items = (db[name] ?? []).filter((item) => item && item.id);
    for (const item of items) {
      await client.query(
        `INSERT INTO records (collection, id, data) VALUES ($1, $2, $3)
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [name, item.id, JSON.stringify(item)],
      );
    }
    console.log(`${name}: ${items.length}`);
  }
  await client.query("COMMIT");

  const files = await fs.readdir(path.join(DATA_DIR, "uploads")).catch(() => []);
  let images = 0;
  for (const file of files) {
    const type = TYPES[path.extname(file).slice(1)];
    if (!type) continue;
    const data = await fs.readFile(path.join(DATA_DIR, "uploads", file));
    await client.query(
      "INSERT INTO uploads (name, content_type, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
      [file, type, data],
    );
    images++;
  }
  console.log(`uploads: ${images}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw err;
} finally {
  await client.end();
}
