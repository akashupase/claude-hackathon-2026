// Idempotent Neon Postgres seed: applies db/schema.sql, then upserts every
// CSV in data/ plus the pre-computed JSON feeds (data/follow_the_rupee.json,
// public/data/*.json, ward/road GeoJSON) into json_feeds.
//
// Run with: npm run db:seed   (requires DB_URL in .env)
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const DB_URL = process.env.DB_URL;
if (!DB_URL) {
  console.error("DB_URL is not set. Add the Neon Postgres connection string to .env (DB_URL=postgres://...).");
  process.exit(1);
}
const sql = neon(DB_URL);

const DATA_DIR = path.join(process.cwd(), "data");
const PUBLIC_DATA_DIR = path.join(process.cwd(), "public", "data");

// --- minimal RFC 4180 CSV parsing (quoted commas, "" escapes, CRLF) ---------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

async function readCsv(name: string): Promise<Record<string, string>[]> {
  const [header, ...body] = parseCsv(await readFile(path.join(DATA_DIR, name), "utf8"));
  return body.map((cols) => {
    const r: Record<string, string> = {};
    header.forEach((h, i) => (r[h] = cols[i] ?? ""));
    return r;
  });
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8"));
}

// --- value coercion ---------------------------------------------------------
const num = (s?: string) => { const v = (s ?? "").trim(); return v === "" ? null : Number(v); };
const int = (s?: string) => { const v = (s ?? "").trim(); return v === "" ? null : Math.round(Number(v)); };
const bool = (s?: string) => (s ?? "").trim().toUpperCase() === "Y";
const list = (s?: string, sep = ";") => {
  const v = (s ?? "").trim();
  return v === "" ? [] : v.split(sep).map((x) => x.trim()).filter(Boolean);
};
const nullableText = (s?: string) => { const v = (s ?? "").trim(); return v === "" ? null : v; };

// --- generic chunked upsert --------------------------------------------------
async function upsert(table: string, conflict: string[], cols: string[], rows: unknown[][]) {
  const updates = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  const CHUNK = 500; // stay far under Postgres' 65535 bind-parameter limit
  for (let i = 0; i < rows.length; i += CHUNK) {
    const params: unknown[] = [];
    const tuples = rows.slice(i, i + CHUNK).map((r) => {
      const start = params.length;
      params.push(...r);
      return `(${r.map((_, k) => `$${start + k + 1}`).join(", ")})`;
    });
    await sql.query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${tuples.join(", ")} ` +
      `ON CONFLICT (${conflict.join(", ")}) DO UPDATE SET ${updates}`,
      params,
    );
  }
  console.log(`  ${table}: ${rows.length} rows upserted`);
}

async function upsertFeed(feedKey: string, payload: unknown) {
  await sql.query(
    `INSERT INTO json_feeds (feed_key, payload) VALUES ($1, $2::jsonb)
     ON CONFLICT (feed_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
    [feedKey, JSON.stringify(payload)],
  );
  console.log(`  json_feeds[${feedKey}]: ${(JSON.stringify(payload).length / 1024).toFixed(0)} KB upserted`);
}

// --- schema -------------------------------------------------------------------
async function applySchema() {
  const raw = await readFile(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  const statements = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) await sql.query(stmt);
  console.log(`  schema applied (${statements.length} statements)`);
}

// --- row mappers (CSV column order per data/DATA_DICTIONARY.md) ---------------
function wardRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.ward_code, r.ward_name, r.zone, r.assistant_commissioner_office,
    num(r.centroid_lat), num(r.centroid_lon), num(r.approx_area_km2), int(r.population_est),
    num(r.low_lying_index), int(r.engineering_crews), list(r.localities), int(r.monsoon_repair_budget_inr_2025),
  ]);
}

function roadRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.road_id, r.road_name, int(r.segment_no), r.ward_code, r.road_type, r.surface,
    int(r.lanes), int(r.length_m), num(r.start_lat), num(r.start_lon), num(r.end_lat), num(r.end_lon),
    nullableText(r.last_resurfaced), bool(r.under_dlp), bool(r.bus_route),
  ]);
}

function contractorRows(rs: Record<string, string>[]) {
  return rs.map((r) => [r.contractor_id, r.contractor_name, int(r.empanelled_since), list(r.active_wards)]);
}

function complaintRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.complaint_id, r.received_at, r.channel, r.category_reported, r.description, r.language,
    r.locality_text, nullableText(r.ward_code), num(r.lat), num(r.lon), num(r.gps_accuracy_m),
    nullableText(r.photo_url), nullableText(r.photo_description), r.complainant_id,
    int(r.upvotes) ?? 0, r.status, nullableText(r.resolved_at),
  ]);
}

function workOrderRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.work_order_id, list(r.linked_complaint_ids, "|"), r.ward_code, r.road_id, r.work_type,
    r.repair_method, r.contractor_id, r.contractor_name, nullableText(r.assigned_at),
    nullableText(r.work_started_at), nullableText(r.completed_at), num(r.area_sqm),
    num(r.cost_inr) ?? 0, int(r.sla_hours), bool(r.sla_met), bool(r.reopened_within_30d),
    nullableText(r.engineer_remark),
  ]);
}

function socialPostRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.post_id, r.posted_at, r.source, r.author_handle, r.text, bool(r.has_media),
    int(r.likes_or_forwards) ?? 0,
  ]);
}

function auditFlagRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.work_order_id, r.ward_code, r.road_id, r.road_name, r.contractor_name, r.flag,
    r.confidence, r.reason, num(r.cost_inr) ?? 0, num(r.inr_at_risk) ?? 0, r.method, r.work_type,
    num(r.ratio), num(r.expected_inr), r.twin ?? "", num(r.gap_days), nullableText(r.resurfaced),
  ]);
}

function rateCardRows(rs: Record<string, string>[]) {
  return rs.map((r) => [r.repair_method, r.unit, int(r.standard_rate_inr) ?? 0]);
}

function floodHotspotRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.hotspot_id, r.name, r.ward_code, num(r.lat), num(r.lon), num(r.flood_threshold_mm_per_day),
    bool(r.tide_sensitive), num(r.avg_water_depth_cm), num(r.avg_recession_hours),
    bool(r.pumping_station_nearby), int(r.years_flagged_last_5) ?? 0,
  ]);
}

function accidentRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.accident_id, r.occurred_at, r.ward_code, r.road_id, num(r.lat), num(r.lon),
    r.vehicle_type, r.severity, r.probable_cause,
  ]);
}

function facilityRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.facility_id, r.type, r.name, r.ward_code, num(r.lat), num(r.lon),
    int(r.beds_or_students) ?? 0, bool(r.emergency_services), r.ambulance_entry_road,
  ]);
}

function rainfallRows(rs: Record<string, string>[]) {
  return rs.map((r) => [r.date, r.station, num(r.rainfall_mm) ?? 0, r.imd_category, r.imd_alert]);
}

function tideRows(rs: Record<string, string>[]) {
  return rs.map((r) => [r.date, r.high_tide_time, num(r.height_m) ?? 0, bool(r.big_tide_flag)]);
}

function trafficRows(rs: Record<string, string>[]) {
  return rs.map((r) => [
    r.road_id, int(r.peak_hour_vehicles) ?? 0, num(r.avg_peak_speed_kmph) ?? 0,
    num(r.congestion_index_0_10) ?? 0, int(r.bus_routes_count) ?? 0, num(r.two_wheeler_share_pct) ?? 0,
  ]);
}

function localityRows(rs: Record<string, string>[]) {
  return rs.map((r) => [r.locality, nullableText(r.ward_code), num(r.lat), num(r.lon), list(r.aliases, ";")]);
}

async function main() {
  console.log("Applying db/schema.sql ...");
  await applySchema();

  console.log("Seeding relational tables from data/*.csv ...");
  await upsert("wards", ["ward_code"],
    ["ward_code", "ward_name", "zone", "assistant_commissioner_office", "centroid_lat", "centroid_lon",
      "approx_area_km2", "population_est", "low_lying_index", "engineering_crews", "localities",
      "monsoon_repair_budget_inr_2025"],
    wardRows(await readCsv("wards.csv")));

  await upsert("roads", ["road_id"],
    ["road_id", "road_name", "segment_no", "ward_code", "road_type", "surface", "lanes", "length_m",
      "start_lat", "start_lon", "end_lat", "end_lon", "last_resurfaced", "under_dlp", "bus_route"],
    roadRows(await readCsv("roads.csv")));

  await upsert("contractors", ["contractor_id"],
    ["contractor_id", "contractor_name", "empanelled_since", "active_wards"],
    contractorRows(await readCsv("contractors.csv")));

  await upsert("rate_card", ["repair_method"],
    ["repair_method", "unit", "standard_rate_inr"],
    rateCardRows(await readCsv("rate_card.csv")));

  await upsert("localities", ["locality"],
    ["locality", "ward_code", "lat", "lon", "aliases"],
    localityRows(await readCsv("localities.csv")));

  await upsert("work_orders", ["work_order_id"],
    ["work_order_id", "linked_complaint_ids", "ward_code", "road_id", "work_type", "repair_method",
      "contractor_id", "contractor_name", "assigned_at", "work_started_at", "completed_at", "area_sqm",
      "cost_inr", "sla_hours", "sla_met", "reopened_within_30d", "engineer_remark"],
    workOrderRows(await readCsv("work_orders.csv")));

  const complaints = await readCsv("complaints.csv");
  await upsert("complaints", ["complaint_id"],
    ["complaint_id", "received_at", "channel", "category_reported", "description", "language",
      "locality_text", "ward_code", "lat", "lon", "gps_accuracy_m", "photo_url", "photo_description",
      "complainant_id", "upvotes", "status", "resolved_at"],
    complaintRows(complaints));
  // complaints_sample_200.csv is a subset of the same rows — re-upsert keeps it in sync.
  await upsert("complaints", ["complaint_id"],
    ["complaint_id", "received_at", "channel", "category_reported", "description", "language",
      "locality_text", "ward_code", "lat", "lon", "gps_accuracy_m", "photo_url", "photo_description",
      "complainant_id", "upvotes", "status", "resolved_at"],
    complaintRows(await readCsv("complaints_sample_200.csv")));

  await upsert("social_posts", ["post_id"],
    ["post_id", "posted_at", "source", "author_handle", "text", "has_media", "likes_or_forwards"],
    socialPostRows(await readCsv("social_posts.csv")));

  await upsert("audit_flags", ["work_order_id", "flag", "reason", "twin"],
    ["work_order_id", "ward_code", "road_id", "road_name", "contractor_name", "flag", "confidence",
      "reason", "cost_inr", "inr_at_risk", "method", "work_type", "ratio", "expected_inr", "twin",
      "gap_days", "resurfaced"],
    auditFlagRows(await readCsv("audit_flags.csv")));

  await upsert("flood_hotspots", ["hotspot_id"],
    ["hotspot_id", "name", "ward_code", "lat", "lon", "flood_threshold_mm_per_day", "tide_sensitive",
      "avg_water_depth_cm", "avg_recession_hours", "pumping_station_nearby", "years_flagged_last_5"],
    floodHotspotRows(await readCsv("flood_hotspots.csv")));

  await upsert("accidents", ["accident_id"],
    ["accident_id", "occurred_at", "ward_code", "road_id", "lat", "lon", "vehicle_type", "severity",
      "probable_cause"],
    accidentRows(await readCsv("accidents.csv")));

  await upsert("facilities", ["facility_id"],
    ["facility_id", "type", "name", "ward_code", "lat", "lon", "beds_or_students", "emergency_services",
      "ambulance_entry_road"],
    facilityRows(await readCsv("facilities.csv")));

  await upsert("rainfall_daily", ["date", "station"],
    ["date", "station", "rainfall_mm", "imd_category", "imd_alert"],
    rainfallRows(await readCsv("rainfall_daily.csv")));

  await upsert("tides", ["date", "high_tide_time"],
    ["date", "high_tide_time", "height_m", "big_tide_flag"],
    tideRows(await readCsv("tides.csv")));

  await upsert("traffic", ["road_id"],
    ["road_id", "peak_hour_vehicles", "avg_peak_speed_kmph", "congestion_index_0_10", "bus_routes_count",
      "two_wheeler_share_pct"],
    trafficRows(await readCsv("traffic.csv")));

  console.log("Seeding json_feeds ...");
  await upsertFeed("follow_the_rupee", await readJson(path.join(DATA_DIR, "follow_the_rupee.json")));
  await upsertFeed("audit_flags", await readJson(path.join(PUBLIC_DATA_DIR, "audit_flags.json")));
  await upsertFeed("contractor_scores", await readJson(path.join(PUBLIC_DATA_DIR, "contractor_scores.json")));
  await upsertFeed("ward_simulator", await readJson(path.join(PUBLIC_DATA_DIR, "ward_simulator.json")));
  await upsertFeed("trail_index", await readJson(path.join(PUBLIC_DATA_DIR, "trail_index.json")));
  await upsertFeed("wards_geojson", await readJson(path.join(DATA_DIR, "wards.geojson")));
  await upsertFeed("roads_geojson", await readJson(path.join(DATA_DIR, "roads.geojson")));

  console.log("\nRow counts in Neon:");
  const counts = await sql.query(`
    SELECT 'wards' table_name, count(*) row_count FROM wards
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
    ORDER BY table_name`);
  for (const c of counts as { table_name: string; row_count: string }[]) console.log(`  ${c.table_name.padEnd(16)} ${c.row_count}`);
  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
