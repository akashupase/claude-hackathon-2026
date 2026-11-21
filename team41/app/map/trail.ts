import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types mirroring public/data/trail_index.json, produced by
// scripts/build_trail_data.py. Shared by the /map server page and client UI.
// ---------------------------------------------------------------------------

export type TrailWorkOrder = {
  work_order_id: string;
  road_id: string;
  assigned_at: string;
  work_started_at: string;
  completed_at: string;
  sla_met: boolean;
  reopened_within_30d: boolean;
  engineer_remark: string;
  repair_method: string;
  cost_inr: number;
  contractor_name: string;
};

export type TrailDispute = {
  post_id: string;
  source: string;
  posted_at: string;
  text: string;
  likes_or_forwards: number;
  locality: string;
};

export type TrailRecord = {
  complaint_id: string;
  received_at: string;
  channel: string;
  language: string; // en | hi-en | mr | hi
  category_reported: string;
  description: string;
  locality_text: string;
  ward_code: string;
  assistant_commissioner_office: string;
  upvotes: number;
  status: string;
  photo_description: string;
  geocoded: boolean;
  duplicate_count: number;
  duplicate_channels: string[];
  duplicate_complaint_ids: string[];
  work_order: TrailWorkOrder | null; // null = "Never Fixed / Open"
  social_dispute: TrailDispute | null;
};

export type TrailRoad = {
  road_id: string;
  road_name: string;
  ward_code: string;
};

export type TrailIndexData = {
  meta: {
    generated_at: string;
    synthetic: boolean;
    note: string;
    dedup_window_hours: number;
    stats: {
      complaints_total: number;
      geocoded_blank_wards: number;
      duplicates_merged: number;
      complaints_linked_to_work_orders: number;
      dispute_posts_matched: number;
      disputed_work_orders: number;
      records_out: number;
      disputes_out: number;
      languages_out: Record<string, number>;
    };
  };
  ward_offices: Record<string, string>;
  roads: TrailRoad[];
  complaints: TrailRecord[];
};

// ---------------------------------------------------------------------------

const TRAIL_PATH = path.join(process.cwd(), "public", "data", "trail_index.json");

export async function loadTrailIndex(): Promise<TrailIndexData | null> {
  try {
    const text = await readFile(TRAIL_PATH, "utf8");
    return JSON.parse(text) as TrailIndexData;
  } catch {
    return null;
  }
}
