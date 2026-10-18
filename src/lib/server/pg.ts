import "server-only";
import { Pool, type PoolClient } from "pg";

/**
 * Every collection lives in one table as JSONB rows keyed by (collection, id).
 * `seq` keeps insertion order so arrays load back in the order they were built.
 */
const SCHEMA = `
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
`;

/** Serializes writers across every server instance sharing the database. */
const LOCK_KEY = 727_451_001;

export const usePostgres = Boolean(process.env.DATABASE_URL);

const globalPg = globalThis as unknown as { __mpPool?: Pool; __mpSchema?: Promise<void> };

function pool(): Pool {
  globalPg.__mpPool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return globalPg.__mpPool;
}

function ready(): Promise<void> {
  globalPg.__mpSchema ??= pool()
    .query(SCHEMA)
    .then(() => undefined)
    .catch((err) => {
      globalPg.__mpSchema = undefined;
      throw err;
    });
  return globalPg.__mpSchema;
}

export type Collections = Record<string, { id: string }[]>;

/**
 * Loads every collection inside a locked transaction, runs `fn`, then writes
 * only the rows that were added, changed or removed.
 */
export async function withPgCollections<T>(
  names: readonly string[],
  fn: (data: Collections) => Promise<{ result: T; data: Collections }>,
): Promise<T> {
  await ready();
  const client: PoolClient = await pool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_KEY]);
    const { rows } = await client.query<{ collection: string; id: string; data: { id: string } }>(
      "SELECT collection, id, data FROM records ORDER BY collection, seq",
    );

    const loaded: Collections = Object.fromEntries(names.map((name) => [name, []]));
    const before = new Map<string, string>();
    for (const row of rows) {
      (loaded[row.collection] ??= []).push(row.data);
      before.set(`${row.collection}\u0000${row.id}`, JSON.stringify(row.data));
    }

    const { result, data } = await fn(loaded);

    const upCollections: string[] = [];
    const upIds: string[] = [];
    const upData: string[] = [];
    const seen = new Set<string>();
    for (const name of names) {
      for (const item of data[name] ?? []) {
        const key = `${name}\u0000${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const json = JSON.stringify(item);
        if (before.get(key) === json) continue;
        upCollections.push(name);
        upIds.push(item.id);
        upData.push(json);
      }
    }
    const delCollections: string[] = [];
    const delIds: string[] = [];
    for (const key of before.keys()) {
      if (seen.has(key)) continue;
      const [name, id] = key.split("\u0000");
      if (!names.includes(name)) continue;
      delCollections.push(name);
      delIds.push(id);
    }

    if (upIds.length) {
      await client.query(
        `INSERT INTO records (collection, id, data)
         SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[])
         ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [upCollections, upIds, upData],
      );
    }
    if (delIds.length) {
      await client.query(
        `DELETE FROM records r USING unnest($1::text[], $2::text[]) AS d(collection, id)
         WHERE r.collection = d.collection AND r.id = d.id`,
        [delCollections, delIds],
      );
    }
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function pgPutUpload(name: string, contentType: string, data: Buffer): Promise<void> {
  await ready();
  await pool().query(
    "INSERT INTO uploads (name, content_type, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
    [name, contentType, data],
  );
}

export async function pgGetUpload(name: string): Promise<Buffer | null> {
  await ready();
  const { rows } = await pool().query<{ data: Buffer }>("SELECT data FROM uploads WHERE name = $1", [name]);
  return rows[0]?.data ?? null;
}
