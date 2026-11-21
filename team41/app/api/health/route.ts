import { db } from "@/lib/db";

// GET /api/health — DB liveness plus row counts per table and feed freshness.

const COUNT_QUERY = `
  SELECT 'wards' AS table_name, count(*) AS row_count FROM wards
  UNION ALL SELECT 'roads', count(*) FROM roads
  UNION ALL SELECT 'contractors', count(*) FROM contractors
  UNION ALL SELECT 'complaints', count(*) FROM complaints
  UNION ALL SELECT 'work_orders', count(*) FROM work_orders
  UNION ALL SELECT 'social_posts', count(*) FROM social_posts
  UNION ALL SELECT 'audit_flags', count(*) FROM audit_flags
  UNION ALL SELECT 'rate_card', count(*) FROM rate_card
  UNION ALL SELECT 'flood_hotspots', count(*) FROM flood_hotspots
  UNION ALL SELECT 'accidents', count(*) FROM accidents
  UNION ALL SELECT 'facilities', count(*) FROM facilities
  UNION ALL SELECT 'rainfall_daily', count(*) FROM rainfall_daily
  UNION ALL SELECT 'tides', count(*) FROM tides
  UNION ALL SELECT 'traffic', count(*) FROM traffic
  UNION ALL SELECT 'localities', count(*) FROM localities
  UNION ALL SELECT 'json_feeds', count(*) FROM json_feeds
  ORDER BY table_name`;

export async function GET() {
  const sql = db();
  try {
    const counts = (await sql.query(COUNT_QUERY)) as { table_name: string; row_count: string }[];
    const feeds = (await sql.query(
      "SELECT feed_key, updated_at FROM json_feeds ORDER BY feed_key",
    )) as { feed_key: string; updated_at: string }[];
    return Response.json({
      status: "ok",
      database: "up",
      tables: Object.fromEntries(counts.map((r) => [r.table_name, Number(r.row_count)])),
      feeds: feeds.map((f) => ({ feed_key: f.feed_key, updated_at: f.updated_at })),
    });
  } catch (err) {
    return Response.json(
      { status: "error", database: "down", message: err instanceof Error ? err.message : String(err) },
      { status: 503 },
    );
  }
}
