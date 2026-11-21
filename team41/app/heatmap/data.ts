import { cache } from "react";
import { db } from "@/lib/db";

// Every table with coordinates, flattened into compact point arrays for the
// /heatmap page. Read straight from the Postgres tables (not json_feeds).

// [lat, lon, weight, kindIndex, wardIndex, flag (0/1)]
export type HeatPoint = [number, number, number, number, number, 0 | 1];

export type HeatLayer = {
  key: string;
  label: string;
  emoji: string;
  unit: string; // noun for counts, e.g. "complaints"
  weightNote?: string; // how weight is derived, if not 1
  flagLabel?: string; // optional single toggle filter
  kinds: string[];
  points: HeatPoint[];
  radius: number; // base blob radius in px at zoom 11
  perItem?: number; // points per real-world item (roads are sampled), default 1
};

export type HeatmapData = {
  wards: { code: string; name: string }[];
  layers: HeatLayer[];
};

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

function indexer() {
  const list: string[] = [];
  const at = new Map<string, number>();
  return {
    list,
    get(v: string | null | undefined) {
      const k = v || "Other";
      let i = at.get(k);
      if (i == null) {
        i = list.length;
        list.push(k);
        at.set(k, i);
      }
      return i;
    },
  };
}

type Row = Record<string, unknown>;

export const loadHeatmapData = cache(async (): Promise<HeatmapData> => {
  const sql = db();
  const [wardRows, complaints, accidents, floods, facilities, roads, localities] = (await Promise.all([
    sql`SELECT ward_code, ward_name FROM wards ORDER BY ward_code`,
    sql`SELECT lat, lon, category_reported AS kind, ward_code, status FROM complaints WHERE lat IS NOT NULL AND lon IS NOT NULL`,
    sql`SELECT lat, lon, severity AS kind, ward_code FROM accidents WHERE lat IS NOT NULL`,
    sql`SELECT lat, lon, tide_sensitive, pumping_station_nearby, years_flagged_last_5, ward_code FROM flood_hotspots WHERE lat IS NOT NULL`,
    sql`SELECT lat, lon, type AS kind, emergency_services, ward_code FROM facilities WHERE lat IS NOT NULL`,
    sql`SELECT start_lat, start_lon, end_lat, end_lon, road_type AS kind, under_dlp, ward_code FROM roads WHERE start_lat IS NOT NULL AND end_lat IS NOT NULL`,
    sql`SELECT lat, lon, ward_code FROM localities WHERE lat IS NOT NULL`,
  ])) as unknown as Row[][];

  const wards = wardRows.map((w) => ({ code: String(w.ward_code), name: String(w.ward_name) }));
  const wardIdx = new Map(wards.map((w, i) => [w.code, i]));
  const wi = (code: unknown) => wardIdx.get(String(code)) ?? -1;

  const layer = (
    meta: Omit<HeatLayer, "kinds" | "points">,
    rows: Row[],
    map: (r: Row, kind: (v: string) => number) => HeatPoint[],
  ): HeatLayer => {
    const k = indexer();
    const points = rows.flatMap((r) => map(r, (v) => k.get(v)));
    return { ...meta, kinds: k.list, points };
  };

  const OPEN = new Set(["Open", "In Progress"]);
  const SEVERITY: Record<string, number> = { Fatal: 3, Grievous: 2, Minor: 1 };

  return {
    wards,
    layers: [
      layer(
        { key: "complaints", label: "Complaints", emoji: "📣", unit: "complaints", flagLabel: "Still open only", radius: 14 },
        complaints,
        (r, kind) => [[r5(Number(r.lat)), r5(Number(r.lon)), 1, kind(String(r.kind)), wi(r.ward_code), OPEN.has(String(r.status)) ? 1 : 0]],
      ),
      layer(
        { key: "accidents", label: "Accidents", emoji: "🚑", unit: "accidents", weightNote: "Fatal ×3 · Grievous ×2 · Minor ×1", radius: 16 },
        accidents,
        (r, kind) => [[r5(Number(r.lat)), r5(Number(r.lon)), SEVERITY[String(r.kind)] ?? 1, kind(String(r.kind)), wi(r.ward_code), 0]],
      ),
      layer(
        { key: "floods", label: "Flood hotspots", emoji: "🌊", unit: "hotspots", weightNote: "weighted by years flooded (of last 5)", flagLabel: "No pumping station nearby", radius: 26 },
        floods,
        (r, kind) => [[
          r5(Number(r.lat)), r5(Number(r.lon)), Math.max(1, Number(r.years_flagged_last_5) || 1),
          kind(r.tide_sensitive ? "Tide-sensitive" : "Rain only"), wi(r.ward_code), r.pumping_station_nearby ? 0 : 1,
        ]],
      ),
      layer(
        { key: "facilities", label: "Schools & hospitals", emoji: "🏥", unit: "facilities", flagLabel: "Emergency services", radius: 18 },
        facilities,
        (r, kind) => [[r5(Number(r.lat)), r5(Number(r.lon)), 1, kind(String(r.kind)), wi(r.ward_code), r.emergency_services ? 1 : 0]],
      ),
      layer(
        { key: "roads", label: "Roads", emoji: "🛣️", unit: "road segments", flagLabel: "Under warranty (DLP)", radius: 12, perItem: 5 },
        roads,
        (r, kind) => {
          // Sample along the segment so roads read as streaks, not dots.
          const [a, b, c, d] = [r.start_lat, r.start_lon, r.end_lat, r.end_lon].map(Number);
          const k = kind(String(r.kind));
          const w = wi(r.ward_code);
          const f = r.under_dlp ? 1 : 0;
          return [0, 0.25, 0.5, 0.75, 1].map(
            (t) => [r5(a + (c - a) * t), r5(b + (d - b) * t), 0.2, k, w, f] as HeatPoint,
          );
        },
      ),
      layer(
        { key: "localities", label: "Localities", emoji: "📍", unit: "localities", radius: 20 },
        localities,
        (r, kind) => [[r5(Number(r.lat)), r5(Number(r.lon)), 1, kind("Locality"), wi(r.ward_code), 0]],
      ),
    ],
  };
});
