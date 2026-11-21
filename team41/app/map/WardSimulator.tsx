"use client";

import { useState } from "react";
import type { WardSimulatorEntry } from "./audit";
import { formatInr, formatInrShort } from "./format";

type Method = "Cold mix patch" | "Mastic asphalt";
type Stress = "normal" | "stress";

const METHOD_LABEL: Record<Method, string> = {
  "Cold mix patch": "Quick fix (cold mix)",
  "Mastic asphalt": "Strong fix (mastic)",
};

// Ward drawer "Budget planner": pick a repair type and a weather scenario, and
// see how far the ward's *leftover* money goes across its riskiest roads — plus
// how much of it might be wasted when fixes break again within 30 days.
// Audit simulation on synthetic data.
export default function WardSimulator({ sim }: { sim: WardSimulatorEntry }) {
  const [method, setMethod] = useState<Method>("Cold mix patch");
  const [stress, setStress] = useState<Stress>("normal");

  const stat = sim.strategies[method];
  const outcome = sim.simulation[method]?.[stress];
  const remaining = sim.remaining_budget_inr;
  const remainingPct =
    sim.monsoon_budget_inr_2025 > 0
      ? Math.max(0, (remaining / sim.monsoon_budget_inr_2025) * 100)
      : 0;

  if (!stat || !outcome) {
    return (
      <p className="text-[13px] text-[#4a4f52]">
        Simulator data missing for this ward — regenerate the audit feeds.
      </p>
    );
  }

  const coveredPct =
    outcome.roads_in_scope > 0
      ? (outcome.roads_covered / outcome.roads_in_scope) * 100
      : 0;
  const hospitals = outcome.hospitals_covered.length;
  const schools = outcome.schools_covered.length;

  return (
    <section aria-label="Budget planner">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-[family-name:var(--font-bricolage)] text-[13px] font-semibold uppercase tracking-[.07em] text-[#ee7454]">
          What can the leftover money fix?
        </h3>
        <span className="text-[10.5px] uppercase tracking-[.06em] text-[#4a4f52]">audit sim</span>
      </div>

      {/* Controls */}
      <div className="mt-2 grid grid-cols-1 gap-1.5">
        <Segmented
          label="Repair type"
          options={[
            ["Cold mix patch", "Quick fix"],
            ["Mastic asphalt", "Strong fix"],
          ]}
          value={method}
          onChange={(v) => setMethod(v as Method)}
        />
        <Segmented
          label="Weather"
          options={[
            ["normal", "Normal"],
            ["stress", "Heavy rain + high tide"],
          ]}
          value={stress}
          onChange={(v) => setStress(v as Stress)}
        />
        <p className="text-[10.5px] leading-[1.35] text-[#4a4f52]">
          Quick fix = cold mix (cheaper, may not last) · Strong fix = mastic asphalt (costs
          more, lasts longer)
        </p>
      </div>

      {/* Remaining budget */}
      <div className="mt-2.5 rounded-lg bg-[#faf3eb] px-2.5 py-2">
        <div className="flex items-baseline justify-between text-[12px] text-[#4a4f52]">
          <span>{remaining < 0 ? "Over budget by" : "Money left this monsoon"}</span>
          <span
            className={`font-[family-name:var(--font-bricolage)] text-[14px] font-semibold tabular-nums ${
              remaining < 0 ? "text-[#b23a1d]" : "text-[#2b3033]"
            }`}
          >
            {remaining < 0 ? "−" : ""}
            {formatInrShort(Math.abs(remaining))}
            <span className="ml-1 font-medium text-[#4a4f52]">
              of {formatInrShort(sim.monsoon_budget_inr_2025)}
            </span>
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#e6dcd0]">
          <div
            className="h-full rounded-full bg-[#ee7454]"
            style={{ width: `${remainingPct}%` }}
          />
        </div>
        {remaining < 0 && (
          <p className="mt-1 text-[11px] leading-[1.35] text-[#b23a1d]">
            This ward already spent more than its budget — every rupee recovered from bad bills
            goes straight back into fixes.
          </p>
        )}
      </div>

      {/* Outcome */}
      <div className="mt-2 rounded-lg bg-[#fff6ef] px-2.5 py-2.5 shadow-[inset_0_0_0_1px_rgba(238,116,84,.35)]">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-medium text-[#4a4f52]">
            {METHOD_LABEL[method]} ·{" "}
            {stress === "stress" ? "heavy rain + high tide" : "normal weather"}
          </span>
          <span className="text-[11.5px] tabular-nums text-[#4a4f52]">
            ≈{formatInr(stat.cost_per_road_inr)} to fix one road
          </span>
        </div>

        <div className="mt-1.5 flex items-end gap-1.5">
          <span className="font-[family-name:var(--font-bricolage)] text-[26px] font-semibold leading-none tabular-nums text-[#ee7454]">
            {outcome.roads_covered}
          </span>
          <span className="pb-0.5 text-[13px] text-[#4a4f52]">
            of the {outcome.roads_in_scope} riskiest roads can be fixed
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e6dcd0]">
          <div
            className="h-full rounded-full bg-[#ee7454] transition-[width] duration-500"
            style={{ width: `${coveredPct}%` }}
          />
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
          <div>
            <dt className="text-[#4a4f52]">Helps reach</dt>
            <dd className="font-medium tabular-nums">
              {hospitals} {hospitals === 1 ? "hospital" : "hospitals"} · {schools}{" "}
              {schools === 1 ? "school" : "schools"}
            </dd>
          </div>
          <div>
            <dt className="text-[#4a4f52]">May break again</dt>
            <dd className="font-medium tabular-nums">
              {outcome.reopen_rate_pct.toFixed(0)}%{" "}
              <span className="font-normal text-[#4a4f52]">
                (≈{formatInrShort(outcome.expected_reopen_waste_inr)} wasted)
              </span>
            </dd>
          </div>
        </dl>

        <p className="mt-1.5 text-[11.5px] leading-[1.4] text-[#4a4f52]">
          {outcome.roads_covered === 0
            ? "Not enough money left for even one fix — try the other repair type, or wait until bad bills are recovered."
            : `Based on this ward's own record: ${stat.history_jobs} similar jobs, ${
                stress === "stress" ? "during heavy-rain weeks" : "in normal weather"
              }. Some fixes break again within 30 days — that share of money gets wasted.`}
        </p>
      </div>

      {/* Top-risk list */}
      <p className="mt-2 text-[11.5px] leading-[1.45] text-[#4a4f52]">
        Riskiest road:{" "}
        <span className="text-[#2b3033]">
          {sim.top_risk_roads[0]?.road_name || sim.top_risk_roads[0]?.road_id || "—"}
        </span>{" "}
        (risk {sim.top_risk_roads[0]?.risk_score.toFixed(0)}/100
        {sim.top_risk_roads[0]?.flood_hotspots_nearby.length
          ? ` · floods often near ${sim.top_risk_roads[0].flood_hotspots_nearby[0]}`
          : ""}
        {sim.top_risk_roads[0]?.hospitals.length
          ? ` · ambulance route to ${sim.top_risk_roads[0].hospitals[0]}`
          : ""}
        ).
      </p>
    </section>
  );
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="text-[10.5px] font-medium uppercase tracking-[.07em] text-[#4a4f52]">
        {label}
      </div>
      <div
        className="mt-1 flex rounded-lg bg-[#f4ede4] p-0.5"
        role="group"
        aria-label={label}
      >
        {options.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={`flex-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ee7454] ${
              value === key
                ? "bg-white text-[#2b3033] shadow-[0_1px_3px_rgba(0,0,0,.18)]"
                : "text-[#4a4f52] hover:text-[#2b3033]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
