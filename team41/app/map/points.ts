import { db } from "@/lib/db";

// Clickable point layers for the ward map, read straight from the Postgres
// tables. Served per layer by app/map/points/[layer]/route.ts so the map only
// downloads a layer when it is switched on.

export const POINT_LAYERS = ["complaints", "accidents", "floods", "facilities"] as const;
export type PointLayerKey = (typeof POINT_LAYERS)[number];

// [lat, lon, ...fields]; field order per layer is documented below.
export type PointRow = (string | number | boolean | null)[];

type Row = Record<string, unknown>;
const r5 = (n: unknown) => Math.round(Number(n) * 1e5) / 1e5;
const day = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : "");
const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export async function loadPointLayer(layer: PointLayerKey): Promise<PointRow[]> {
  const sql = db();
  switch (layer) {
    // [lat, lon, id, category, status, date, locality, upvotes, text, ward]
    case "complaints": {
      const rows = (await sql`
        SELECT complaint_id, lat, lon, category_reported, status, received_at, locality_text, upvotes, description, ward_code
        FROM complaints WHERE lat IS NOT NULL AND lon IS NOT NULL`) as Row[];
      return rows.map((r) => [
        r5(r.lat), r5(r.lon), String(r.complaint_id), String(r.category_reported ?? ""), String(r.status ?? ""),
        day(r.received_at), clip(r.locality_text, 40), Number(r.upvotes ?? 0), clip(r.description, 110), String(r.ward_code ?? ""),
      ]);
    }
    // [lat, lon, id, severity, vehicle, cause, date, ward]
    case "accidents": {
      const rows = (await sql`
        SELECT accident_id, lat, lon, severity, vehicle_type, probable_cause, occurred_at, ward_code
        FROM accidents WHERE lat IS NOT NULL`) as Row[];
      return rows.map((r) => [
        r5(r.lat), r5(r.lon), String(r.accident_id), String(r.severity ?? ""), String(r.vehicle_type ?? ""),
        String(r.probable_cause ?? ""), day(r.occurred_at), String(r.ward_code ?? ""),
      ]);
    }
    // [lat, lon, name, threshold_mm, tide_sensitive, pump_nearby, years_flagged_of_5, depth_cm, ward]
    case "floods": {
      const rows = (await sql`
        SELECT name, lat, lon, flood_threshold_mm_per_day, tide_sensitive, pumping_station_nearby,
               years_flagged_last_5, avg_water_depth_cm, ward_code
        FROM flood_hotspots WHERE lat IS NOT NULL`) as Row[];
      return rows.map((r) => [
        r5(r.lat), r5(r.lon), String(r.name), Number(r.flood_threshold_mm_per_day ?? 0), Boolean(r.tide_sensitive),
        Boolean(r.pumping_station_nearby), Number(r.years_flagged_last_5 ?? 0), Number(r.avg_water_depth_cm ?? 0), String(r.ward_code ?? ""),
      ]);
    }
    // [lat, lon, name, type, beds_or_students, emergency, ward]
    case "facilities": {
      const rows = (await sql`
        SELECT name, lat, lon, type, beds_or_students, emergency_services, ward_code
        FROM facilities WHERE lat IS NOT NULL`) as Row[];
      return rows.map((r) => [
        r5(r.lat), r5(r.lon), String(r.name), String(r.type ?? ""), Number(r.beds_or_students ?? 0),
        Boolean(r.emergency_services), String(r.ward_code ?? ""),
      ]);
    }
  }
}
