import { db } from "@/lib/db";

// GET /api/wards?zone=&search= — wards from the relational wards table,
// filterable by zone or a free-text search over name / office / localities.

type WardRow = {
  ward_code: string;
  ward_name: string;
  zone: string;
  assistant_commissioner_office: string;
  centroid_lat: number;
  centroid_lon: number;
  approx_area_km2: number;
  population_est: number | string; // int8 arrives as a string
  low_lying_index: number;
  engineering_crews: number;
  localities: string[];
  monsoon_repair_budget_inr_2025: number | string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zone = searchParams.get("zone");
  const search = searchParams.get("search");

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (zone) {
    params.push(zone);
    conditions.push(`zone = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    const p = `$${params.length}`;
    conditions.push(
      `(ward_name ILIKE ${p} OR assistant_commissioner_office ILIKE ${p}` +
        ` OR EXISTS (SELECT 1 FROM unnest(localities) AS loc WHERE loc ILIKE ${p}))`,
    );
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = db();
  const rows = (await sql.query(
    `SELECT ward_code, ward_name, zone, assistant_commissioner_office, centroid_lat, centroid_lon,
            approx_area_km2, population_est, low_lying_index, engineering_crews, localities,
            monsoon_repair_budget_inr_2025
     FROM wards ${where}
     ORDER BY ward_code`,
    params,
  )) as unknown as WardRow[];

  return Response.json({
    count: rows.length,
    wards: rows.map((r) => ({
      ...r,
      population_est: Number(r.population_est),
      monsoon_repair_budget_inr_2025: Number(r.monsoon_repair_budget_inr_2025),
    })),
  });
}
