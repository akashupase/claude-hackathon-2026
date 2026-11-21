import { db } from "@/lib/db";

// GET /api/audit-flags?ward_code=&flag=&confidence=&limit=&offset=
// Per-flag rows from the relational audit_flags table plus rollup summaries.

const MAX_LIMIT = 1000;

type FlagRow = {
  work_order_id: string;
  ward_code: string;
  road_id: string;
  road_name: string;
  contractor_name: string;
  flag: string;
  confidence: string;
  reason: string;
  cost_inr: number | string;
  inr_at_risk: number | string;
  method: string;
  work_type: string;
  ratio: number | null;
  expected_inr: number | null;
  twin: string;
  gap_days: number | null;
  resurfaced: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 500, 1), MAX_LIMIT);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];
  for (const [key, col] of [
    ["ward_code", "ward_code"],
    ["flag", "flag"],
    ["confidence", "confidence"],
  ] as const) {
    const value = searchParams.get(key);
    if (value) {
      params.push(value);
      conditions.push(`${col} = $${params.length}`);
    }
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = db();
  const totalRows = (await sql.query(
    `SELECT count(*) AS total, COALESCE(sum(inr_at_risk), 0) AS total_at_risk FROM audit_flags ${where}`,
    params,
  )) as { total: string; total_at_risk: string }[];

  params.push(limit, offset);
  const flags = (await sql.query(
    `SELECT work_order_id, ward_code, road_id, road_name, contractor_name, flag, confidence, reason,
            cost_inr, inr_at_risk, method, work_type, ratio, expected_inr, twin, gap_days, resurfaced
     FROM audit_flags ${where}
     ORDER BY inr_at_risk DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )) as unknown as FlagRow[];

  const byFlag = (await sql.query(
    `SELECT flag, count(*) AS count, COALESCE(sum(inr_at_risk), 0) AS inr_at_risk
     FROM audit_flags ${where} GROUP BY flag ORDER BY inr_at_risk DESC`,
    params.slice(0, params.length - 2),
  )) as { flag: string; count: string; inr_at_risk: string }[];

  const byWard = (await sql.query(
    `SELECT ward_code, count(*) AS flagged_orders, COALESCE(sum(inr_at_risk), 0) AS inr_at_risk
     FROM audit_flags ${where} GROUP BY ward_code ORDER BY inr_at_risk DESC`,
    params.slice(0, params.length - 2),
  )) as { ward_code: string; flagged_orders: string; inr_at_risk: string }[];

  return Response.json({
    total: Number(totalRows[0]?.total ?? 0),
    total_inr_at_risk: Number(totalRows[0]?.total_at_risk ?? 0),
    limit,
    offset,
    summary: {
      by_flag: byFlag.map((r) => ({ flag: r.flag, count: Number(r.count), inr_at_risk: Number(r.inr_at_risk) })),
      by_ward: byWard.map((r) => ({
        ward_code: r.ward_code,
        flagged_orders: Number(r.flagged_orders),
        inr_at_risk: Number(r.inr_at_risk),
      })),
    },
    flags: flags.map((r) => ({
      ...r,
      cost_inr: Number(r.cost_inr),
      inr_at_risk: Number(r.inr_at_risk),
    })),
  });
}
