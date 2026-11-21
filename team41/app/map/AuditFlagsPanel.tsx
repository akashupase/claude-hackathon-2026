"use client";

import { useMemo, useState } from "react";
import type { AuditFlag, AuditFlagsData } from "./audit";
import { FLAG_BADGES, FLAG_HELP, formatInr, formatInrShort } from "./format";

type ReasonFilter = "ALL" | "DLP_VIOLATION" | "OVERBILLED" | "DOUBLE_BILLED";

const MAX_SHOWN = 60;

// Flagged work orders for the selected ward (or citywide), with one-click
// clawback notices. Audit simulation on synthetic data.
export default function AuditFlagsPanel({
  audit,
  wardCode,
  wardName,
  onOpenNotice,
}: {
  audit: AuditFlagsData;
  wardCode: string | null;
  wardName?: string;
  onOpenNotice: (flag: AuditFlag) => void;
}) {
  const [filter, setFilter] = useState<ReasonFilter>("ALL");

  const scoped = useMemo(
    () =>
      wardCode ? audit.flags.filter((f) => f.ward_code === wardCode) : audit.flags,
    [audit, wardCode],
  );
  const filtered = useMemo(
    () => (filter === "ALL" ? scoped : scoped.filter((f) => f.flag_reasons.includes(filter))),
    [scoped, filter],
  );
  const total = useMemo(() => scoped.reduce((s, f) => s + f.recoverable_inr, 0), [scoped]);

  const counts: Record<ReasonFilter, number> = {
    ALL: scoped.length,
    DLP_VIOLATION: scoped.filter((f) => f.flag_reasons.includes("DLP_VIOLATION")).length,
    OVERBILLED: scoped.filter((f) => f.flag_reasons.includes("OVERBILLED")).length,
    DOUBLE_BILLED: scoped.filter((f) => f.flag_reasons.includes("DOUBLE_BILLED")).length,
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Audit flags">
      <div className="flex-none px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-bricolage)] text-[15px] font-semibold tracking-[-.01em]">
            {wardCode ? `Wasted money · Ward ${wardCode}` : "Wasted money · all wards"}
          </h2>
          <span className="font-[family-name:var(--font-bricolage)] text-[20px] font-semibold tabular-nums text-[#ee7454]">
            {formatInrShort(total)}
            <span className="ml-1.5 text-[12px] font-medium text-[#4a4f52]">can be recovered</span>
          </span>
        </div>
        <p className="mt-0.5 text-[13.5px] text-[#4a4f52]">
          {scoped.length} suspicious repair bill{scoped.length === 1 ? "" : "s"} · money that can be
          recovered · audit simulation (synthetic demo)
        </p>

        {/* Reason filter chips */}
        <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by flag type">
          {(
            [
              ["ALL", "All"],
              ["DLP_VIOLATION", FLAG_BADGES.DLP_VIOLATION.label],
              ["OVERBILLED", FLAG_BADGES.OVERBILLED.label],
              ["DOUBLE_BILLED", FLAG_BADGES.DOUBLE_BILLED.label],
            ] as [ReasonFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              title={key === "ALL" ? undefined : FLAG_HELP[key]}
              aria-pressed={filter === key}
              className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] ${
                filter === key
                  ? "bg-[#2b3033] text-white"
                  : "bg-white text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.16)] hover:bg-[#fdeae4]"
              }`}
            >
              {label} <span className="tabular-nums opacity-70">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
        {filtered.length === 0 ? (
          <p className="rounded-xl bg-white px-4 py-6 text-center text-[14px] text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
            {scoped.length === 0
              ? wardCode
                ? `No suspicious bills found in Ward ${wardCode}${wardName ? ` — ${wardName}` : ""}. Pick another ward, or view all wards.`
                : "No suspicious repair bills found."
              : "Nothing under this filter."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.slice(0, MAX_SHOWN).map((flag) => (
              <li
                key={flag.work_order_id}
                className="rounded-xl bg-white p-3 shadow-[0_0_0_1px_rgba(43,48,51,.14),0_8px_18px_-14px_rgba(0,0,0,.28)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {flag.flag_reasons.map((r) => (
                      <span
                        key={r}
                        title={FLAG_HELP[r]}
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.06em] ${FLAG_BADGES[r]?.className ?? "bg-[#efe7dd]"}`}
                      >
                        {FLAG_BADGES[r]?.label ?? r}
                      </span>
                    ))}
                  </div>
                  <span className="flex-none font-[family-name:var(--font-bricolage)] text-[17px] font-semibold tabular-nums text-[#ee7454]">
                    {formatInr(flag.recoverable_inr)}
                  </span>
                </div>

                <div className="mt-1.5 text-[14px] leading-[1.45]">
                  <span className="font-medium">{flag.contractor_name.replace(" (synthetic)", "")}</span>
                  <span className="text-[#4a4f52]">
                    {" "}· {flag.road_name || flag.road_id}
                    {flag.ward_code ? ` · Ward ${flag.ward_code}` : ""}
                  </span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-[#4a4f52]">
                  {flag.work_type} · {flag.repair_method} · BMC paid{" "}
                  <span className="tabular-nums">{formatInr(flag.cost_inr)}</span>
                  {flag.expected_cost != null && (
                    <>
                      {" "}· should cost about{" "}
                      <span className="tabular-nums">{formatInr(flag.expected_cost)}</span>
                    </>
                  )}{" "}
                  · road last resurfaced{" "}
                  <span className="tabular-nums">{flag.last_resurfaced || "—"}</span>
                </div>
                {flag.engineer_remark && (
                  <p className="mt-1 line-clamp-1 text-[12.5px] italic text-[#4a4f52]" title={flag.engineer_remark}>
                    “{flag.engineer_remark}”
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11.5px] tabular-nums text-[#4a4f52]">
                    {flag.work_order_id} · {flag.assigned_at || "?"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenNotice(flag)}
                    className="rounded-full bg-[#2b3033] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#ee7454] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
                  >
                    Create recovery notice
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {filtered.length > MAX_SHOWN && (
          <p className="py-2 text-center text-[12.5px] text-[#4a4f52]">
            Showing the top {MAX_SHOWN} of {filtered.length} bills, biggest money first.
          </p>
        )}
      </div>
    </section>
  );
}
