import { cache } from "react";
import { db, getFeed } from "@/lib/db";

export type Ward = {
  ward_code: string;
  ward_name: string;
  zone: string;
  assistant_commissioner_office: string;
  centroid_lat: number;
  centroid_lon: number;
  approx_area_km2: number;
  population_est: number;
  low_lying_index: number;
  engineering_crews: number;
  localities: string[];
  monsoon_repair_budget_inr_2025: number;
};

// Row shape straight out of the wards table (int8 BIGINT columns arrive as strings).
type WardRow = {
  ward_code: string;
  ward_name: string;
  zone: string;
  assistant_commissioner_office: string;
  centroid_lat: number;
  centroid_lon: number;
  approx_area_km2: number;
  population_est: number | string;
  low_lying_index: number;
  engineering_crews: number;
  localities: string[];
  monsoon_repair_budget_inr_2025: number | string;
};

// Data lives in Neon Postgres (seeded from team41/data by `npm run db:seed`).
// cache() dedupes the queries across loaders within a single request render.

export const loadWards = cache(async (): Promise<Ward[]> => {
  const sql = db();
  const rows = (await sql`
    SELECT ward_code, ward_name, zone, assistant_commissioner_office, centroid_lat, centroid_lon,
           approx_area_km2, population_est, low_lying_index, engineering_crews, localities,
           monsoon_repair_budget_inr_2025
    FROM wards
    ORDER BY ward_code`) as unknown as WardRow[];
  return rows.map((r) => ({
    ward_code: r.ward_code,
    ward_name: r.ward_name,
    zone: r.zone,
    assistant_commissioner_office: r.assistant_commissioner_office,
    centroid_lat: Number(r.centroid_lat),
    centroid_lon: Number(r.centroid_lon),
    approx_area_km2: Number(r.approx_area_km2),
    population_est: Number(r.population_est),
    low_lying_index: Number(r.low_lying_index),
    engineering_crews: Number(r.engineering_crews),
    localities: r.localities ?? [],
    monsoon_repair_budget_inr_2025: Number(r.monsoon_repair_budget_inr_2025),
  }));
});

export const loadWardOutlines = cache(async (): Promise<unknown> => {
  const feed = await getFeed<unknown>("wards_geojson");
  if (!feed) throw new Error("The wards_geojson feed is missing from Postgres — run `npm run db:seed` first.");
  return feed;
});

export const loadRoads = cache(async (): Promise<unknown> => {
  const feed = await getFeed<unknown>("roads_geojson");
  if (!feed) throw new Error("The roads_geojson feed is missing from Postgres — run `npm run db:seed` first.");
  return feed;
});
