"use client";

import { useEffect, useMemo, useState } from "react";
import type { Contractor, ContractorScoresData } from "./audit";
import { formatInrShort } from "./format";

const ROW_H = 96; // px, must match the h-[…px] on each row below
const ENDORSE_KEY = "ftr-endorsements-v1";

type Mode = "raw" | "fair";

// Contractor leaderboard with a Raw ⇄ Weather & Flood-Adjusted fairness toggle.
// Rows are absolutely positioned and re-sort smoothly via transforms, so the
// switch visibly re-ranks the list.
export default function ContractorLeaderboard({
  scores,
  selectedWardCode,
}: {
  scores: ContractorScoresData;
  selectedWardCode: string | null;
}) {
  const [mode, setMode] = useState<Mode>("raw");
  // Citizen endorsements: persisted per browser, shown as a live counter.
  const [endorsements, setEndorsements] = useState<Record<string, number>>({});

  useEffect(() => {
    // Load after hydration (async so we don't setState synchronously in the
    // effect and trigger a cascading render / hydration mismatch).
    const t = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(ENDORSE_KEY);
        if (raw) setEndorsements(JSON.parse(raw) as Record<string, number>);
      } catch {
        // ignore corrupt/absent storage — start at zero
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const endorse = (contractorId: string) => {
    setEndorsements((cur) => {
      const next = { ...cur, [contractorId]: (cur[contractorId] ?? 0) + 1 };
      try {
        window.localStorage.setItem(ENDORSE_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable (private mode) — counter stays in memory
      }
      return next;
    });
  };

  // Stable DOM order (raw rank); display order depends on the toggle.
  const contractors = useMemo(
    () => [...scores.contractors].sort((a, b) => a.raw_rank - b.raw_rank),
    [scores],
  );
  const displayIndex = useMemo(() => {
    const sorted = [...contractors].sort((a, b) =>
      mode === "fair" ? a.fair_rank - b.fair_rank : a.raw_rank - b.raw_rank,
    );
    return new Map(sorted.map((c, i) => [c.contractor_id, i]));
  }, [contractors, mode]);

  // Ward context for the caption: which ward's contractors we're looking at.
  const wardNote = selectedWardCode
    ? `These ratings cover all 8 registered contractors across Mumbai. You are looking at Ward ${selectedWardCode}.`
    : "These ratings cover all 8 registered contractors working across Mumbai.";

  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label="Contractor leaderboard">
      <div className="flex-none px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-bricolage)] text-[15px] font-semibold tracking-[-.01em]">
            Contractor leaderboard
          </h2>
          <span className="text-[12px] text-[#4a4f52]">audit simulation</span>
        </div>

        {/* Fairness toggle */}
        <div className="mt-2.5 flex items-center gap-2.5">
          <span
            className={`text-[12.5px] font-medium ${mode === "raw" ? "text-[#2b3033]" : "text-[#4a4f52]"}`}
          >
            Plain score
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={mode === "fair"}
            aria-label="Fair score, adjusted for rain and floods"
            onClick={() => setMode((m) => (m === "raw" ? "fair" : "raw"))}
            className={`relative h-6 w-11 flex-none rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] ${
              mode === "fair" ? "bg-[#ee7454]" : "bg-[#c9c2ba]"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-300 ${
                mode === "fair" ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span
            className={`text-[12.5px] font-medium ${mode === "fair" ? "text-[#2b3033]" : "text-[#4a4f52]"}`}
          >
            Fair (rain &amp; flood adjusted)
          </span>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-[1.4] text-[#4a4f52]">{wardNote}</p>

        {/* Citizen appreciation: spotlight the fair-ranking leader */}
        {(() => {
          const top = contractors.find((c) => c.fair_rank === 1);
          if (!top) return null;
          const count = endorsements[top.contractor_id] ?? 0;
          return (
            <div className="mt-2.5 rounded-xl bg-[#fff6ef] px-3 py-2.5 shadow-[0_0_0_1px_rgba(238,116,84,.4)]">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-[#e3f2e4] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.05em] text-[#1e6b34]">
                  ✓ Durable work verified
                </span>
                <span className="truncate text-[12.5px] font-medium text-[#2b3033]">
                  {top.contractor_name.replace(" (synthetic)", "")}
                </span>
                <span className="ml-auto flex-none text-[11px] tabular-nums text-[#4a4f52]">
                  top fair score
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => endorse(top.contractor_id)}
                  className="rounded-full bg-[#2b3033] px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#ee7454] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
                  title="Your support is saved in this browser (audit simulation with fake data)"
                >
                  Support for next contract
                  <span className="ml-1.5 tabular-nums">· {count}</span>
                </button>
                <span className="text-[10.5px] leading-[1.3] text-[#4a4f52]">
                  your vote stays in this browser
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Animated rows: DOM order is stable (raw rank), transforms re-sort */}
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-0.5">
        <div className="relative" style={{ height: contractors.length * ROW_H }}>
          {contractors.map((c) => (
            <LeaderRow
              key={c.contractor_id}
              c={c}
              mode={mode}
              index={displayIndex.get(c.contractor_id) ?? 0}
            />
          ))}
        </div>
      </div>

      <p className="flex-none px-1 pt-2 text-[11.5px] leading-[1.4] text-[#4a4f52]">
        Each score blends: jobs finished on time (45%), repairs that lasted 30 days (35%) and how close bills were to the official rate card (20%). The fair view goes easy when a contractor worked in flood-prone wards during heavy-rain weeks.
      </p>
    </section>
  );
}

function LeaderRow({
  c,
  mode,
  index,
}: {
  c: Contractor;
  mode: Mode;
  index: number;
}) {
  const fair = mode === "fair";
  const rank = fair ? c.fair_rank : c.raw_rank;
  const score = fair ? c.adjusted.fair_score : c.raw_score;
  const raw = c.raw;
  const delta = c.rank_delta;
  const scoreShift = c.adjusted.fair_score - c.raw_score;

  return (
    <div
      className="absolute inset-x-0 top-0 px-0.5"
      style={{
        transform: `translateY(${index * ROW_H}px)`,
        transition: "transform 700ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <div
        className={`h-[88px] rounded-xl px-3 py-2 transition-colors duration-500 ${
          rank === 1
            ? "bg-white shadow-[0_0_0_1.5px_#ee7454]"
            : fair
              ? "bg-[#fff6ef] shadow-[0_0_0_1px_rgba(43,48,51,.14)]"
              : "bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14)]"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <span
            className={`grid size-8 flex-none place-items-center rounded-lg font-[family-name:var(--font-bricolage)] text-[15px] font-semibold tabular-nums transition-colors duration-500 ${
              rank === 1 ? "bg-[#ee7454] text-white" : "bg-[#f4ede4] text-[#2b3033]"
            }`}
          >
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-medium">
                {c.contractor_name.replace(" (synthetic)", "")}
              </span>
              {fair && (
                <span
                  className={`flex-none rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                    delta > 0
                      ? "bg-[#e3f2e4] text-[#1e6b34]"
                      : delta < 0
                        ? "bg-[#fdeae4] text-[#b23a1d]"
                        : "bg-[#efe7dd] text-[#4a4f52]"
                  }`}
                >
                  {delta > 0 ? `↑ +${delta}` : delta < 0 ? `↓ ${delta}` : "±0"}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex gap-3 text-[11.5px] tabular-nums text-[#4a4f52]">
              <span>
                On time <span className="text-[#2b3033]">{(fair ? c.adjusted.sla_met_pct : raw.sla_met_pct).toFixed(0)}%</span>
              </span>
              <span>
                Failed again <span className="text-[#2b3033]">{(fair ? c.adjusted.reopen_pct : raw.reopen_pct).toFixed(0)}%</span>
              </span>
              <span className="hidden sm:inline">
                Total billed <span className="text-[#2b3033]">{formatInrShort(raw.total_billed_inr)}</span>
              </span>
              <span className="hidden md:inline">
                vs govt rate{" "}
                <span className={raw.avg_cost_vs_expected_pct > 115 ? "text-[#b23a1d]" : "text-[#2b3033]"}>
                  +{(raw.avg_cost_vs_expected_pct - 100).toFixed(0)}%
                </span>
              </span>
            </div>
          </div>
          <span className="flex-none text-right">
            <span className="font-[family-name:var(--font-bricolage)] text-[17px] font-semibold tabular-nums">
              {score.toFixed(1)}
            </span>
            {fair && (
              <span
                className={`block text-[10.5px] font-medium tabular-nums ${
                  scoreShift > 0.05
                    ? "text-[#1e6b34]"
                    : scoreShift < -0.05
                      ? "text-[#b23a1d]"
                      : "text-[#4a4f52]"
                }`}
              >
                {scoreShift >= 0 ? "+" : ""}
                {scoreShift.toFixed(1)} in fair mode
              </span>
            )}
          </span>
        </div>
        {fair && (
          <p className="mt-1 truncate text-[11.5px] leading-[1.35] text-[#4a4f52]" title={c.adjusted.context_note}>
            {c.adjusted.context_note}
          </p>
        )}
      </div>
    </div>
  );
}
