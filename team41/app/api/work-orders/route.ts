import { db } from "@/lib/db";

// GET /api/work-orders?ward_code=&contractor_id=&sla_met=&repair_method=&limit=&offset=
// Paginated work orders from the relational work_orders table.

const MAX_LIMIT = 1000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), MAX_LIMIT);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of [
    ["ward_code", "ward_code"],
    ["contractor_id", "contractor_id"],
    ["repair_method", "repair_method"],
  ] as const) {
    const value = searchParams.get(key);
    if (value) {
      params.push(value);
      conditions.push(`${col} = $${params.length}`);
    }
  }
  const sla = searchParams.get("sla_met");
  if (sla === "Y" || sla === "N") {
    params.push(sla === "Y");
    conditions.push(`sla_met = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = db();
  const totalRows = (await sql.query(
    `SELECT count(*) AS total, COALESCE(sum(cost_inr), 0) AS total_cost FROM work_orders ${where}`,
    params,
  )) as { total: string; total_cost: string }[];

  params.push(limit, offset);
  const rows = (await sql.query(
    `SELECT work_order_id, ward_code, road_id, work_type, repair_method, contractor_id, contractor_name,
            assigned_at, work_started_at, completed_at, area_sqm, cost_inr, sla_hours, sla_met,
            reopened_within_30d, linked_complaint_ids
     FROM work_orders ${where}
     ORDER BY assigned_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )) as Record<string, unknown>[];

  return Response.json({
    total: Number(totalRows[0]?.total ?? 0),
    total_cost_inr: Number(totalRows[0]?.total_cost ?? 0),
    limit,
    offset,
    // cost_inr is BIGINT (int8) and arrives as a string — expose it as a number.
    work_orders: rows.map((r) => ({ ...r, cost_inr: Number(r.cost_inr ?? 0) })),
  });
}
