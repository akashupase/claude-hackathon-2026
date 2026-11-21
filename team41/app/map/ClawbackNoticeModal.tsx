"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AuditFlag } from "./audit";
import { FLAG_BADGES, formatInr } from "./format";

// Builds the plain-text notice so "Copy" gives a clean, pasteable document.
function buildNoticeText(flag: AuditFlag): string {
  const lines = [
    "MUNICIPAL CORPORATION OF GREATER MUMBAI — WARD AUDIT CELL (AUDIT SIMULATION)",
    "",
    `No.: MCGM/AUDIT-SIM/${flag.work_order_id}/2025        Date: ${new Date().toLocaleDateString("en-IN")}`,
    "",
    "SHOW CAUSE CUM RECOVERY NOTICE (why should the amount not be recovered?)",
    "",
    "To: The Proprietor / Partner / Director,",
    `${flag.contractor_name.replace(" (synthetic)", "")} (empanelled road repair contractor — synthetic entity)`,
    "",
    "WHEREAS, the Municipal Corporation of Greater Mumbai (BMC) disbursed a sum of",
    `${formatInr(flag.cost_inr)} under Work Order No. ${flag.work_order_id} for the work "${flag.work_type}"`,
    `(${flag.repair_method}) on Road ID ${flag.road_id} (${flag.road_name}), Ward ${flag.ward_code};`,
    "",
    `AND WHEREAS the said road segment was last resurfaced on ${flag.last_resurfaced || "record not on file"};`,
    "",
  ];
  if (flag.expected_cost != null) {
    lines.push(
      `AND WHEREAS the standard rate card expectation for the said work is ${formatInr(flag.expected_cost)},`,
      `and the amount billed exceeds the expectation by ${formatInr(flag.cost_inr - flag.expected_cost)};`,
      "",
    );
  }
  lines.push(
    `AND WHEREAS the Assistant Engineer has recorded the remark: "${flag.engineer_remark || "—"}";`,
    "",
    `AND WHEREAS prima facie audit findings (${flag.flag_reasons.join(", ")}) disclose an amount of`,
    `${formatInr(flag.recoverable_inr)} as recoverable from the contractor under the terms of empanelment,`,
    "the defect liability provisions of the contract, and Rule 13.1 of the BMC Works Manual (simulated reference);",
    "",
    "YOU ARE THEREFORE CALLED UPON to show cause, in writing, within 15 (fifteen) days of receipt",
    "of this notice, as to why the said amount of",
    `${formatInr(flag.recoverable_inr)} should not be recovered from bills due / security deposit /`,
    "performance guarantee, together with interest at 12% p.a. (simulated rate).",
    "",
    "Failure to respond within the said period will be construed as acceptance and recovery will",
    "proceed ex-parte.",
    "",
    "Sd/- Ward Audit Cell (synthetic demo), Municipal Corporation of Greater Mumbai",
    "",
    "— This is a simulated document generated from 100% synthetic hackathon data. —",
    "— Contractors and figures are fictional; no real entity is accused of anything. —",
  );
  return lines.join("\n");
}

export default function ClawbackNoticeModal({
  flag,
  wardName,
  onClose,
}: {
  flag: AuditFlag;
  wardName?: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const noticeText = useMemo(() => buildNoticeText(flag), [flag]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(noticeText);
    } catch {
      // Clipboard API unavailable (insecure context) — fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = noticeText;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-[rgba(43,48,51,.45)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Clawback notice"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[#faf3eb] shadow-[0_0_0_1px_rgba(43,48,51,.2),0_30px_70px_-30px_rgba(0,0,0,.5)]"
      >
        {/* Bar */}
        <div className="flex flex-none items-center justify-between gap-3 border-b-2 border-dotted border-[rgba(43,48,51,.14)] px-5 py-3">
          <div className="min-w-0">
            <div className="font-[family-name:var(--font-bricolage)] text-[11px] font-semibold uppercase tracking-[.1em] text-[#b23a1d]">
              Audit simulation · synthetic data
            </div>
            <h3 className="truncate font-[family-name:var(--font-bricolage)] text-lg font-semibold tracking-[-.02em]">
              Get back {formatInr(flag.recoverable_inr)} · {flag.work_order_id}
              {wardName ? ` · Ward ${wardName}` : ""}
            </h3>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-full bg-[#2b3033] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#ee7454] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
            >
              {copied ? "Copied ✓" : "Copy notice"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-lg text-[#4a4f52] hover:bg-[rgba(43,48,51,.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
              aria-label="Close notice"
            >
              ×
            </button>
          </div>
        </div>

        {/* The notice itself */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Plain-language explainer first */}
          <div className="mb-4 rounded-xl bg-[#fff6ef] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(238,116,84,.35)]">
            <div className="font-[family-name:var(--font-bricolage)] text-[12px] font-semibold uppercase tracking-[.06em] text-[#ee7454]">
              In simple words
            </div>
            <p className="mt-1 text-[13.5px] leading-[1.55] text-[#2b3033]">
              BMC paid <strong>{formatInr(flag.cost_inr)}</strong> for this repair
              {flag.flag_reasons.includes("DLP_VIOLATION")
                ? " even though the road was still under the contractor's free-repair warranty"
                : ""}
              {flag.flag_reasons.includes("OVERBILLED")
                ? `${flag.flag_reasons.includes("DLP_VIOLATION") ? " and" : ""} charged much more than the government rate`
                : ""}
              {flag.flag_reasons.includes("DOUBLE_BILLED")
                ? `${flag.flag_reasons.length > 1 ? " and" : ""} the same work seems to have been billed twice`
                : ""}
              . BMC believes{" "}
              <strong className="text-[#ee7454]">{formatInr(flag.recoverable_inr)}</strong> of
              public money should come back. The formal notice below can be copied and sent.
            </p>
          </div>

          <article className="rounded-xl bg-white p-6 text-[15px] leading-[1.65] shadow-[0_0_0_1px_rgba(43,48,51,.1)]">
            <header className="text-center">
              <div className="font-[family-name:var(--font-bricolage)] text-[13px] font-semibold uppercase tracking-[.14em] text-[#4a4f52]">
                Municipal Corporation of Greater Mumbai
              </div>
              <div className="mt-0.5 font-[family-name:var(--font-bricolage)] text-[11px] font-medium uppercase tracking-[.1em] text-[#ee7454]">
                Ward Audit Cell · audit simulation (synthetic)
              </div>
              <h4 className="mt-3 font-[family-name:var(--font-bricolage)] text-[19px] font-semibold uppercase tracking-[.03em]">
                Show Cause Cum Recovery Notice
              </h4>
              <div className="mt-1 text-[13px] text-[#4a4f52]">
                No. MCGM/AUDIT-SIM/{flag.work_order_id}/2025
              </div>
            </header>

            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y-2 border-dotted border-[rgba(43,48,51,.14)] py-4 text-[14px]">
              <dt className="text-[#4a4f52]">To</dt>
              <dd className="font-medium">
                {flag.contractor_name.replace(" (synthetic)", "")}{" "}
                <span className="text-[#4a4f52]">(synthetic contractor)</span>
              </dd>
              <dt className="text-[#4a4f52]">Work order</dt>
              <dd className="font-medium tabular-nums">{flag.work_order_id}</dd>
              <dt className="text-[#4a4f52]">Road</dt>
              <dd className="font-medium">
                {flag.road_name || "—"}{" "}
                <span className="text-[#4a4f52]">
                  (ID {flag.road_id}, Ward {flag.ward_code}
                  {wardName ? ` · ${wardName}` : ""})
                </span>
              </dd>
              <dt className="text-[#4a4f52]">Last resurfaced</dt>
              <dd className="font-medium tabular-nums">{flag.last_resurfaced || "not on record"}</dd>
              <dt className="text-[#4a4f52]">Work / method</dt>
              <dd>
                {flag.work_type} — {flag.repair_method}
              </dd>
              <dt className="text-[#4a4f52]">BMC paid</dt>
              <dd className="font-semibold tabular-nums">{formatInr(flag.cost_inr)}</dd>
              {flag.expected_cost != null && (
                <>
                  <dt className="text-[#4a4f52]">What it should cost</dt>
                  <dd className="tabular-nums">
                    {formatInr(flag.expected_cost)}{" "}
                    <span className="text-[#b23a1d]">
                      ({formatInr(flag.cost_inr - flag.expected_cost)} more than it should)
                    </span>
                  </dd>
                </>
              )}
              <dt className="text-[#4a4f52]">Why it&rsquo;s flagged</dt>
              <dd>
                <span className="flex flex-wrap gap-1.5">
                  {flag.flag_reasons.map((r) => (
                    <span
                      key={r}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[.06em] ${FLAG_BADGES[r]?.className ?? "bg-[#efe7dd]"}`}
                    >
                      {FLAG_BADGES[r]?.label ?? r}
                    </span>
                  ))}
                </span>
              </dd>
              <dt className="text-[#4a4f52]">Engineer&rsquo;s remark</dt>
              <dd className="italic">
                &ldquo;{flag.engineer_remark || "—"}&rdquo;
              </dd>
            </dl>

            <div className="mt-4 space-y-3 text-[14.5px]">
              <p>
                <span className="font-semibold">Whereas</span> the Corporation disbursed{" "}
                <strong className="tabular-nums">{formatInr(flag.cost_inr)}</strong> under the work
                order cited above, and prima facie audit findings disclose an amount of{" "}
                <strong className="tabular-nums text-[#ee7454]">
                  {formatInr(flag.recoverable_inr)}
                </strong>{" "}
                recoverable from you under the empanelment terms and the defect liability provisions
                of the contract;
              </p>
              <p>
                <span className="font-semibold">You are therefore called upon</span> to show cause,
                in writing, within <strong>15 (fifteen) days</strong> of receipt of this notice, why
                the said amount should not be recovered from bills due, security deposit, or
                performance guarantee, together with interest at 12% p.a. (simulated rate). Failure
                to respond will be construed as acceptance and recovery will proceed ex-parte.
              </p>
              <p className="text-[#4a4f52]">
                Sd/- Ward Audit Cell (synthetic demo), Municipal Corporation of Greater Mumbai.
              </p>
            </div>
          </article>
        </div>

        <footer className="flex-none border-t-2 border-dotted border-[rgba(43,48,51,.14)] px-5 py-2.5 text-[12.5px] text-[#4a4f52]">
          Simulated document generated from 100% synthetic hackathon data — contractors and figures
          are fictional; no real entity is accused of anything.
        </footer>
      </div>
    </div>
  );
}
