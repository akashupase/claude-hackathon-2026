import { loadRupee } from "@/lib/rupee";

// GET /audit/flags.csv: every audit flag as CSV, built from the Postgres feed via loadRupee()
// (no runtime file reads: data/ is seed input only).
const COLS = ["work_order_id", "ward_code", "road_name", "contractor_name", "flag", "confidence", "cost_inr", "inr_at_risk", "reason"] as const;
const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET() {
  const { flags } = await loadRupee();
  const csv = [COLS.join(","), ...flags.map((f) => COLS.map((c) => cell(f[c])).join(","))].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="follow-the-rupee-audit-flags.csv"' },
  });
}
