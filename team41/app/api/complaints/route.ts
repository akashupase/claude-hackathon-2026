import { db } from "@/lib/db";

// GET /api/complaints?ward_code=&status=&language=&channel=&limit=&offset=
// Paginated complaints straight from the relational complaints table.

const MAX_LIMIT = 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of [
    ["ward_code", "ward_code"],
    ["status", "status"],
    ["language", "language"],
    ["channel", "channel"],
  ] as const) {
    const value = searchParams.get(key);
    if (value) {
      params.push(value);
      conditions.push(`${col} = $${params.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = db();
  const totalRows = (await sql.query(`SELECT count(*) AS total FROM complaints ${where}`, params)) as {
    total: string;
  }[];
  params.push(limit, offset);
  const rows = (await sql.query(
    `SELECT complaint_id, received_at, channel, category_reported, description, language,
            locality_text, ward_code, lat, lon, upvotes, status, resolved_at
     FROM complaints ${where}
     ORDER BY received_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )) as Record<string, unknown>[];

  return Response.json({
    total: Number(totalRows[0]?.total ?? 0),
    limit,
    offset,
    complaints: rows,
  });
}
