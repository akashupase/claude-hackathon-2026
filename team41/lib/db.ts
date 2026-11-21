import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon Postgres serverless client (HTTP driver: one stateless query per call,
// no connection pooling to manage). All server-side data loading goes through
// here; the schema and feeds are provisioned by `npm run db:seed`.

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

export function db(): Sql {
  if (!client) client = connect();
  return client;
}

function connect() {
  const url = process.env.DB_URL;
  if (!url) {
    throw new Error(
      "DB_URL is not set. Put the Neon Postgres connection string in .env (DB_URL=postgres://...) — see db/schema.sql and scripts/seed-neon.ts.",
    );
  }
  return neon(url);
}

// Fetch a pre-computed UI feed from the json_feeds table (null if not seeded).
export async function getFeed<T>(feedKey: string): Promise<T | null> {
  const rows = (await db().query("SELECT payload FROM json_feeds WHERE feed_key = $1", [feedKey])) as {
    payload: T;
  }[];
  return rows.length ? rows[0].payload : null;
}
