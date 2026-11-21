import { getFeed } from "./db";

// Output of analysis/follow_rupee.py (audit, fair scorecards, trail, next-rupee plan, social, connections),
// stored in the json_feeds table by scripts/seed-neon.ts.
// Rebuild + reseed with: python analysis/follow_rupee.py && npm run db:seed   (from team41/)

export type Flag = {
  work_order_id: string; ward_code: string; road_name: string; contractor_name: string;
  flag: string; confidence: "High" | "Medium"; reason: string; cost_inr: number; inr_at_risk: number;
  method: string; work_type: string; ratio?: number | null; expected_inr?: number | null;
  twin?: string | null; gap_days?: number | null; resurfaced?: string | null;
};
export type PlanItem = {
  road_id: string; road: string; risk: number; issue: string; action: string;
  est_cost_inr: number; running_inr: number; funded_by: "budget" | "recovered money" | "next allocation"; why: string;
  act: "fix" | "resurface" | "dlp"; method: string; open_complaints: number; emergency: boolean; accidents_pending: number;
  flood_spot: string; tide_no_pump: boolean; accidents: number; hospital: boolean; school: boolean; congestion: number; failed_before: number;
};
export type MethodEcon = { method: string; jobs: number; avg_cost_inr: number; fail_pct: number; cost_per_lasting_fix_inr: number };
export type Post = { kind: string; source: string; text: string; reach: number; date: string; unreported: boolean };
export type Hotspot = {
  name: string; ward_code: string; tide_sensitive: boolean; pump_station: boolean; threshold_mm: number;
  flood_days: number; flood_days_with_big_tide: number; avg_depth_cm: number; recession_h: number;
  pump_jobs: number; pump_spend_inr: number;
};
export type Pending = {
  accident_id: string; date: string; ward_code: string; road_id: string; road: string; severity: string;
  vehicle: string; cause: string; work_order_id: string; waiting_since: string; days_waiting: number;
  sla_met: string; contractor: string;
};
export type Ward = {
  ward_code: string; ward_name: string; zone: string; office: string; low_lying_index: number; population: number;
  budget_inr: number; spent_inr: number; jobs: number; failed_30d_inr: number; failed_30d_jobs: number;
  sla_met_pct: number; sla_expected_pct: number; reopen_pct: number; reopen_expected_pct: number;
  heavy_rain_share_pct: number; flagged_inr: number; complaints: number; complaints_open_not_fixed: number;
  money_at_issue_pct: number; crews: number; jobs_per_crew: number; city_jobs_per_crew: number;
  by_contractor: Record<string, number>; outcome_inr: { held: number; failed: number; flagged: number };
  actions: string[];
  trail: Partial<{ complaints: number; duplicates: number; not_bmc: number; recategorised: number; issues_fixed: number;
    held: number; failed: number; issues_open: number; complaints_open: number; jobs_without_complaint: number }>;
  next_rupee: { budget_left_inr: number; recoverable_inr: number; plan_total_inr: number; items: PlanItem[] };
  social: Partial<{ posts: number; reports: number; sarcasm: number; thanks: number; noise: number; unreported: number; reach: number; top: Post[] }>;
  pending_accidents: Pending[]; rain_excuses: { work_order_id: string; max_rain_mm: number }[]; hotspots: Hotspot[];
};
export type Contractor = {
  contractor: string; short: string; contractor_id: string; jobs: number; billed_inr: number; wards: string[];
  sla_met_pct: number; sla_expected_pct: number; reopen_pct: number; reopen_expected_pct: number;
  median_cost_ratio: number; cold_mix_share_pct: number; heavy_rain_share_pct: number; low_lying_share_pct: number;
  evidence: string[]; flags: Record<string, number>; grade: "A" | "B" | "C" | "D";
  durability_vs_expected_pp: number; speed_vs_expected_pp: number; text: string;
  empanelled_since: number; listed_wards: string[]; outside_listed_pct: number; inr_flagged?: number;
};
// W: work order -> [ward, road, method, contractor, cost, completed, sla_met, reopened, flags,
//                   first complaint, assigned, started, completed_at, photo, sla_hours, remark]
export type WO = [string, string, string, string, number, string, string, string, string,
                  string, string, string, string, string, number, string];
// C: complaint -> [ward, received, issue, language, status, text, work order]
export type Complaint = [string, string, string, string, string, string, string];

export type Rupee = {
  summary: {
    total_spend_inr: number; total_budget_inr: number; jobs: number; flagged_jobs: number; flagged_inr: number;
    failed_30d_inr: number; failed_30d_jobs: number; method_reopen_pct: Record<string, number>;
    complaints: { total: number; duplicates: number; linked_to_work_order: number; open_not_fixed: number; recategorised: number;
      geocoded: Record<string, number> };
    social: { total: number; placed: number; unreported: number; kinds: Record<string, number> };
    connections: { accidents_while_pending: number; pending_fatal: number; pending_grievous: number; pending_sla_missed: number;
      rain_excuses: number; rain_excuse_mm: number; big_tide_days: number; hotspots: number; tide_sensitive: number; tide_no_pump: number;
      tide_effect: { dry: number; heavy_only: number; heavy_and_big_tide: number }; jobs_per_crew_vs_sla_corr: number };
    rules: { overbill_ratio: number; double_bill_days: number };
    files_used: string[];
    method_economics: Record<string, MethodEcon[]>;
  };
  contractors: Contractor[]; wards: Ward[]; flags: Flag[]; W: Record<string, WO>; C: Record<string, Complaint>;
  calendar: { date: string; height_m: number }[];
};

let cache: Promise<Rupee> | null = null;
export function loadRupee(): Promise<Rupee> {
  cache ??= getFeed<Rupee>("follow_the_rupee").then((feed) => {
    if (!feed) throw new Error("The follow_the_rupee feed is missing from Postgres — run `npm run db:seed` first.");
    return feed;
  });
  // Don't memoise a failure (e.g. DB not seeded yet) — retry on the next request.
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

// Ward codes contain "/" (F/S); URLs use "-" (F-S).
export const wardSlug = (code: string) => code.replace("/", "-");
export const wardFromSlug = (slug: string) => decodeURIComponent(slug).replace("-", "/");

const num = new Intl.NumberFormat("en-IN");
export function inr(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(1)} lakh`;
  return `₹${num.format(Math.round(n))}`;
}
export const fmt = (n: number) => num.format(n);
