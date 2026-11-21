"use client";

import type { AuditFlagsData, WardSimulatorEntry } from "./audit";
import { formatInr, formatInrShort } from "./format";

// Header KPI ticker: recoverable rupees + spend vs budget, citywide or for the
// selected ward. Everything it shows is an audit simulation on synthetic data.
export default function KpiTicker({
  audit,
  wardSim,
  wardName,
}: {
  audit: AuditFlagsData | null;
  wardSim: WardSimulatorEntry | null;
  wardName?: string;
}) {
  if (!audit) {
    return (
      <div className="flex-none rounded-xl bg-white px-4 py-2.5 text-[15px] text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
        Audit feed not generated yet — run{" "}
        <code className="rounded bg-[#faf3eb] px-1.5 py-0.5 text-[13px]">
          python scripts/build_audit_data.py
        </code>
      </div>
    );
  }

  const recoverable = wardSim
    ? audit.summary.by_ward[wardSim.ward_code]?.total_recoverable_inr ?? 0
    : audit.summary.citywide_total_recoverable_inr;
  const flagged = wardSim
    ? audit.summary.by_ward[wardSim.ward_code]?.flagged_orders ?? 0
    : audit.summary.flagged_orders;
  const budget = wardSim ? wardSim.monsoon_budget_inr_2025 : audit.summary.total_budget_inr;
  const spend = wardSim ? wardSim.spend_to_date_inr : audit.summary.total_spend_inr;
  const spentPct = budget > 0 ? Math.min(100, (spend / budget) * 100) : 0;
  const recoverablePct = spend > 0 ? (recoverable / spend) * 100 : 0;

  return (
    <div className="grid flex-none grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.2fr)_minmax(260px,1.4fr)_minmax(200px,1fr)]">
      {/* Recoverable funds */}
      <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
        <div
          className="grid size-9 flex-none place-items-center rounded-lg bg-[#fdeae4] text-[17px]"
          aria-hidden="true"
        >
          ₹
        </div>
        <div className="min-w-0">
          <div className="font-[family-name:var(--font-bricolage)] text-[11px] font-medium uppercase tracking-[.08em] text-[#4a4f52]">
            {wardName ? `Recoverable in Ward ${wardName}` : "Money BMC can recover"}
          </div>
          <div className="font-[family-name:var(--font-bricolage)] text-[22px] font-semibold leading-[1.15] tracking-[-.02em] text-[#ee7454] tabular-nums">
            {formatInr(recoverable)}
            <span className="ml-2 text-[12px] font-medium text-[#4a4f52]">
              {recoverablePct > 0 ? `${recoverablePct.toFixed(1)}% of what BMC spent` : null}
            </span>
          </div>
        </div>
      </div>

      {/* Spend vs budget */}
      <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-[family-name:var(--font-bricolage)] text-[11px] font-medium uppercase tracking-[.08em] text-[#4a4f52]">
              {wardName
                ? `Ward ${wardName}: money spent vs budget`
                : "Repair money: spent vs budget"}
            </span>
            <span className="font-[family-name:var(--font-bricolage)] text-[15px] font-semibold tabular-nums text-[#2b3033]">
              {formatInrShort(spend)}{" "}
              <span className="font-medium text-[#4a4f52]">of {formatInrShort(budget)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#efe7dd]">
            <div
              className="h-full rounded-full bg-[#ee7454] transition-[width] duration-700"
              style={{ width: `${spentPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Flagged orders */}
      <div className="hidden items-center gap-3 rounded-xl bg-white px-4 py-2 shadow-[0_0_0_1px_rgba(43,48,51,.14)] lg:flex">
        <div
          className="grid size-9 flex-none place-items-center rounded-lg bg-[#ece4f7] text-[17px]"
          aria-hidden="true"
        >
          ⚑
        </div>
        <div>
          <div className="font-[family-name:var(--font-bricolage)] text-[11px] font-medium uppercase tracking-[.08em] text-[#4a4f52]">
            Suspicious repair bills
          </div>
          <div className="font-[family-name:var(--font-bricolage)] text-[22px] font-semibold leading-[1.15] tracking-[-.02em] tabular-nums">
            {flagged}
            <span className="ml-2 text-[12px] font-medium text-[#4a4f52]">
              audit simulation · fake data
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
