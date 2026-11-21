import { readFile } from "node:fs/promises";
import path from "node:path";

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

// Data lives in team41/data (deployed with the app).
const DATA_DIR = path.join(process.cwd(), "data");

// Minimal RFC 4180 CSV parser: handles quoted fields with commas and "" escapes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
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

export async function loadWards(): Promise<Ward[]> {
  const text = await readFile(path.join(DATA_DIR, "wards.csv"), "utf8");
  const [header, ...body] = parseCsv(text.replace(/^﻿/, ""));
  return body.map((cols) => {
    const r: Record<string, string> = {};
    header.forEach((h, i) => (r[h] = cols[i] ?? ""));
    return {
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
      localities: r.localities.split(";").map((s) => s.trim()).filter(Boolean),
      monsoon_repair_budget_inr_2025: Number(r.monsoon_repair_budget_inr_2025),
    };
  });
}

export async function loadWardOutlines(): Promise<unknown> {
  const text = await readFile(path.join(DATA_DIR, "wards.geojson"), "utf8");
  return JSON.parse(text);
}

export async function loadRoads(): Promise<unknown> {
  const text = await readFile(path.join(DATA_DIR, "roads.geojson"), "utf8");
  return JSON.parse(text);
}
