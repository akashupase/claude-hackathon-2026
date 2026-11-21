import { readFile } from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types shared by the /map server page and its client components. These mirror
// public/data/*.json produced by scripts/build_audit_data.py.
// ---------------------------------------------------------------------------

export type FlagReason = "DLP_VIOLATION" | "OVERBILLED" | "DOUBLE_BILLED";

export type AuditFlag = {
  work_order_id: string;
  ward_code: string;
  road_id: string;
  road_name: string;
  last_resurfaced: string;
  contractor_id: string;
  contractor_name: string;
  repair_method: string;
  work_type: string;
  cost_inr: number;
  expected_cost: number | null;
  recoverable_inr: number;
  flag_reasons: FlagReason[];
  assigned_at: string;
  completed_at: string;
  engineer_remark: string;
};

export type AuditSummary = {
  citywide_total_recoverable_inr: number;
  total_spend_inr: number;
  total_budget_inr: number;
  total_work_orders: number;
  flagged_orders: number;
  by_reason: Record<string, { count: number; recoverable_inr: number }>;
  by_ward: Record<string, { total_recoverable_inr: number; flagged_orders: number }>;
};

export type AuditFlagsData = {
  meta: {
    generated_at: string;
    synthetic: boolean;
    note: string;
    flag_reason_labels: Record<string, string>;
    methodology: Record<string, string>;
  };
  summary: AuditSummary;
  flags: AuditFlag[];
};

export type ContractorRaw = {
  jobs: number;
  sla_met_pct: number;
  sla_miss_pct: number;
  reopen_pct: number;
  total_billed_inr: number;
  avg_cost_inr: number;
  avg_cost_vs_expected_pct: number;
  avg_ward_low_lying_index: number;
  stress_jobs_pct: number;
  cost_score: number;
};

export type Contractor = {
  contractor_id: string;
  contractor_name: string;
  raw: ContractorRaw;
  raw_score: number;
  adjusted: {
    difficulty_factor: number;
    sla_met_pct: number;
    reopen_pct: number;
    fair_score: number;
    miss_vs_expected: number;
    reopen_vs_expected: number;
    context_note: string;
  };
  ward_low_lying_index: number;
  stress_jobs_pct: number;
  raw_rank: number;
  fair_rank: number;
  rank_delta: number; // +N = climbs when weather/flood exposure is accounted for
};

export type ContractorScoresData = {
  meta: {
    generated_at: string;
    synthetic: boolean;
    note: string;
    weights: Record<string, number>;
    score_formula: string;
    adjustment_formula: string;
    city_baseline: ContractorRaw;
  };
  contractors: Contractor[];
};

export type RiskRoad = {
  road_id: string;
  road_name: string;
  road_type: string;
  length_m: number;
  lanes: number;
  last_resurfaced: string;
  under_dlp: boolean;
  risk_score: number;
  components: { accident: number; flood: number; congestion: number; facility: number };
  accidents_fatal: number;
  accidents_grievous: number;
  accidents_minor: number;
  congestion_index: number;
  hospitals: string[];
  schools: string[];
  flood_hotspots_nearby: string[];
};

export type StrategyStat = {
  standard_rate_inr: number;
  unit: string;
  avg_patch_area_sqm: number;
  cost_per_road_inr: number;
  history_jobs: number;
  reopen_normal_pct: number;
  reopen_normal_jobs: number;
  reopen_normal_fallback: boolean;
  reopen_stress_pct: number;
  reopen_stress_jobs: number;
  reopen_stress_fallback: boolean;
};

export type SimulationOutcome = {
  roads_covered: number;
  roads_in_scope: number;
  road_ids: string[];
  spend_inr: number;
  hospitals_covered: string[];
  schools_covered: string[];
  reopen_rate_pct: number;
  expected_reopen_waste_inr: number;
};

export type WardSimulatorEntry = {
  ward_code: string;
  ward_name: string;
  low_lying_index: number;
  monsoon_budget_inr_2025: number;
  spend_to_date_inr: number;
  remaining_budget_inr: number;
  top_risk_roads: RiskRoad[];
  all_risk_roads: { road_id: string; risk_score: number }[];
  strategies: Record<string, StrategyStat>;
  simulation: Record<string, Record<"normal" | "stress", SimulationOutcome>>;
};

export type WardSimulatorData = {
  meta: {
    generated_at: string;
    synthetic: boolean;
    note: string;
    risk_formula: string;
    stress_definition: string;
    method_history_citywide: {
      repair_method: string;
      unit: string;
      standard_rate_inr: number;
      jobs: number;
      reopen_rate_pct: number;
      stress_jobs: number;
      stress_reopen_rate_pct: number | null;
      avg_cost_per_job_inr: number;
    }[];
  };
  city_totals: {
    monsoon_budget_inr_2025: number;
    spend_to_date_inr: number;
    remaining_budget_inr: number;
  };
  wards: WardSimulatorEntry[];
};

// ---------------------------------------------------------------------------
// Server-side loaders. Files live in public/data and are re-read per request
// so a fresh `python scripts/build_audit_data.py` shows up on refresh.
// ---------------------------------------------------------------------------

const AUDIT_DIR = path.join(process.cwd(), "public", "data");

async function readAuditJson<T>(name: string): Promise<T | null> {
  try {
    const text = await readFile(path.join(AUDIT_DIR, name), "utf8");
    return JSON.parse(text) as T;
  } catch {
    // Feeds haven't been generated yet — the UI renders its empty state.
    return null;
  }
}

export function loadAuditFlags(): Promise<AuditFlagsData | null> {
  return readAuditJson<AuditFlagsData>("audit_flags.json");
}

export function loadContractorScores(): Promise<ContractorScoresData | null> {
  return readAuditJson<ContractorScoresData>("contractor_scores.json");
}

export function loadWardSimulator(): Promise<WardSimulatorData | null> {
  return readAuditJson<WardSimulatorData>("ward_simulator.json");
}
