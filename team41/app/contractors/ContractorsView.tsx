"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import EndorseButton from "@/components/endorse-button";
import type { Contractor } from "@/lib/rupee";

const CARD = "rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.12),0_18px_40px_-26px_rgba(0,0,0,.35)]";
const H2 = "text-[clamp(24px,2.6vw,34px)] font-extrabold tracking-[-.035em]";
const SUB = "mt-1 text-[14.5px] text-[#4a4f52]";
const GRADE_BG = { A: "bg-[#15803d]", B: "bg-[#65a30d]", C: "bg-[#b45309]", D: "bg-[#c2410c]" } as const;
const GRADE_WORD = { A: "Good", B: "Okay", C: "Needs work", D: "Poor" } as const;
const MAX_COMPARE = 4;

const inrShort = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString("en-IN")}`;
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();
const billingIssues = (c: Contractor) => (c.flags["Over-billed"] ?? 0) + (c.flags["Possible double billing"] ?? 0);

// A row in the compare table. `better` decides which column gets the "Best" mark.
type Metric = {
  label: string;
  hint?: string;
  value: (c: Contractor) => number;
  show: (c: Contractor) => React.ReactNode;
  better?: "low" | "high";
  bar?: { max: number; expected?: (c: Contractor) => number };
};

export default function ContractorsView({ contractors }: { contractors: Contractor[] }) {
  // Default compare: the best- and worst-graded contractors.
  const [picked, setPicked] = useState<string[]>(() =>
    contractors.length > 1 ? [contractors[0].contractor_id, contractors[contractors.length - 1].contractor_id] : [],
  );
  const [diffOnly, setDiffOnly] = useState(false);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));

  const cols = useMemo(
    () => picked.map((id) => contractors.find((c) => c.contractor_id === id)).filter((c): c is Contractor => !!c),
    [picked, contractors],
  );

  const pctMax = Math.max(...contractors.map((c) => Math.max(c.reopen_pct, c.reopen_expected_pct, c.sla_met_pct, c.sla_expected_pct)), 1);
  const billedMax = Math.max(...contractors.map((c) => c.billed_inr), 1);

  const metrics: { group: string; rows: Metric[] }[] = [
    {
      group: "Quality",
      rows: [
        {
          label: "Fixes that failed in 30 days",
          hint: "| marks what's expected for the same jobs",
          value: (c) => c.reopen_pct,
          show: (c) => <Pct v={c.reopen_pct} exp={c.reopen_expected_pct} lowerIsBetter />,
          better: "low",
          bar: { max: pctMax, expected: (c) => c.reopen_expected_pct },
        },
        {
          label: "Deadlines met",
          hint: "| marks what's expected",
          value: (c) => c.sla_met_pct,
          show: (c) => <Pct v={c.sla_met_pct} exp={c.sla_expected_pct} />,
          better: "high",
          bar: { max: pctMax, expected: (c) => c.sla_expected_pct },
        },
      ],
    },
    {
      group: "Money",
      rows: [
        { label: "Total billed", value: (c) => c.billed_inr, show: (c) => inrShort(c.billed_inr), bar: { max: billedMax } },
        { label: "Money flagged on their bills", value: (c) => c.inr_flagged ?? 0, show: (c) => inrShort(c.inr_flagged ?? 0), better: "low" },
        { label: "Typical cost vs rate card", value: (c) => c.median_cost_ratio, show: (c) => `${c.median_cost_ratio.toFixed(2)}×`, better: "low" },
        {
          label: "Over-billed or repeat bills",
          value: (c) => billingIssues(c) / Math.max(1, c.jobs),
          show: (c) => (
            <>
              {billingIssues(c)} <span className="font-normal text-[#4a4f52]">of {c.jobs}</span>
            </>
          ),
          better: "low",
        },
        {
          label: "Paid while under warranty",
          hint: "BMC's call, not counted in the grade",
          value: (c) => c.flags["Paid during DLP"] ?? 0,
          show: (c) => c.flags["Paid during DLP"] ?? 0,
        },
      ],
    },
    {
      group: "Workload & conditions",
      rows: [
        { label: "Jobs", value: (c) => c.jobs, show: (c) => c.jobs },
        { label: "Wards worked in", value: (c) => c.wards.length, show: (c) => c.wards.length },
        { label: "Jobs outside listed wards", value: (c) => c.outside_listed_pct, show: (c) => `${c.outside_listed_pct}%` },
        { label: "Jobs in flood-prone wards", value: (c) => c.low_lying_share_pct, show: (c) => `${c.low_lying_share_pct}%` },
        { label: "Jobs with heavy rain that week", value: (c) => c.heavy_rain_share_pct, show: (c) => `${c.heavy_rain_share_pct}%` },
        { label: "Cold-mix patches", value: (c) => c.cold_mix_share_pct, show: (c) => `${c.cold_mix_share_pct}%` },
        { label: "Empanelled since", value: (c) => c.empanelled_since, show: (c) => c.empanelled_since },
      ],
    },
  ];

  const bestOf = (m: Metric) => {
    if (!m.better || cols.length < 2) return null;
    const vals = cols.map(m.value);
    const best = m.better === "low" ? Math.min(...vals) : Math.max(...vals);
    if (vals.every((v) => v === best)) return null;
    return best;
  };
  const differs = (m: Metric) => new Set(cols.map(m.value)).size > 1;

  const gradeCounts = (["A", "B", "C", "D"] as const).map((g) => [g, contractors.filter((c) => c.grade === g).length] as const);
  const better = contractors.filter((c) => c.reopen_pct <= c.reopen_expected_pct - 5).length;
  const worse = contractors.filter((c) => c.reopen_pct >= c.reopen_expected_pct + 5).length;
  const scale = Math.max(...contractors.map((c) => Math.max(c.reopen_pct, c.reopen_expected_pct))) + 5;

  return (
    <>
      {/* Grade tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {gradeCounts.map(([g, n]) => (
          <div key={g} className="flex items-center gap-3 rounded-2xl bg-white/70 p-4 shadow-[0_0_0_1px_rgba(43,48,51,.10)]">
            <span className={`grid size-11 flex-none place-items-center rounded-xl text-xl font-extrabold text-white ${GRADE_BG[g]}`}>{g}</span>
            <div>
              <div className="text-[28px] font-extrabold leading-none tracking-[-.03em] tabular-nums">{n}</div>
              <div className="mt-1 text-[12.5px] font-semibold uppercase tracking-[.06em] text-[#4a4f52]">{GRADE_WORD[g]}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[15px] text-[#4a4f52]">
        <b className="text-[#15803d]">{better}</b> last longer than expected for the same work ·{" "}
        <b className="text-[#c2410c]">{worse}</b> fail clearly more often.
      </p>

      {/* Compare */}
      <section className="mt-10" aria-labelledby="compare-h">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="compare-h" className={H2}>Compare</h2>
            <p className={SUB}>Pick up to {MAX_COMPARE} contractors.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[14px]">
            <input type="checkbox" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} className="size-4 accent-[#ee7454]" />
            Only rows that differ
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Contractors to compare">
          {contractors.map((c) => {
            const on = picked.includes(c.contractor_id);
            const full = !on && picked.length >= MAX_COMPARE;
            return (
              <button
                key={c.contractor_id}
                type="button"
                aria-pressed={on}
                disabled={full}
                onClick={() => toggle(c.contractor_id)}
                className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? "bg-[#2b3033] text-white" : "bg-white text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.16)] hover:bg-[#fdeae4]"
                }`}
              >
                <span className={`grid size-6 place-items-center rounded-full text-[12px] font-extrabold text-white ${GRADE_BG[c.grade]}`}>{c.grade}</span>
                {c.short}
                <span aria-hidden="true" className={on ? "text-white/70" : "text-[#ee7454]"}>{on ? "✕" : "+"}</span>
              </button>
            );
          })}
        </div>

        {cols.length < 2 ? (
          <p className={`${CARD} mt-4 px-5 py-8 text-center text-[15px] text-[#4a4f52]`}>Pick at least two contractors to compare.</p>
        ) : (
          <div className={`${CARD} mt-4 overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
              <thead>
                <tr className="border-b border-[rgba(43,48,51,.12)]">
                  <th scope="col" className="sticky left-0 z-10 w-[230px] bg-white px-5 py-4 text-left align-bottom text-[12px] font-semibold uppercase tracking-[.08em] text-[#4a4f52]">
                    Metric
                  </th>
                  {cols.map((c) => (
                    <th key={c.contractor_id} scope="col" className="px-4 py-4 text-left align-bottom">
                      <div className="flex items-start gap-2.5">
                        <span className={`grid size-9 flex-none place-items-center rounded-lg text-[17px] font-extrabold text-white ${GRADE_BG[c.grade]}`}>{c.grade}</span>
                        <div className="min-w-0">
                          <div className="text-[15px] font-bold leading-tight">{c.short}</div>
                          <button
                            type="button"
                            onClick={() => toggle(c.contractor_id)}
                            className="mt-0.5 text-[12px] font-medium text-[#4a4f52] underline decoration-dotted hover:text-[#ee7454]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              {metrics.map(({ group, rows }) => {
                const shown = diffOnly ? rows.filter(differs) : rows;
                if (!shown.length) return null;
                return (
                  <tbody key={group}>
                    <tr>
                      <th colSpan={cols.length + 1} scope="colgroup" className="sticky left-0 bg-[#faf3eb] px-5 py-2 text-left text-[12px] font-bold uppercase tracking-[.1em] text-[#ee7454]">
                        {group}
                      </th>
                    </tr>
                    {shown.map((m) => {
                      const best = bestOf(m);
                      return (
                        <tr key={m.label} className="border-t border-[rgba(43,48,51,.08)]">
                          <th scope="row" className="sticky left-0 z-10 bg-white px-5 py-3 text-left align-top font-semibold">
                            <span className="block">{m.label}</span>
                            {m.hint && <span className="mt-0.5 block text-[12px] font-normal text-[#4a4f52]">{m.hint}</span>}
                          </th>
                          {cols.map((c) => {
                            const isBest = best != null && m.value(c) === best;
                            return (
                              <td key={c.contractor_id} className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold tabular-nums">{m.show(c)}</span>
                                  {isBest && (
                                    <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[.05em] text-[#166534]">✓ Best</span>
                                  )}
                                </div>
                                {m.bar && <MiniBar v={m.value(c)} max={m.bar.max} expected={m.bar.expected?.(c)} />}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
              <tbody>
                <tr className="border-t border-[rgba(43,48,51,.12)]">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-5 py-3 text-left align-top font-semibold">In short</th>
                  {cols.map((c) => (
                    <td key={c.contractor_id} className="px-4 py-3 align-top text-[13.5px] leading-snug text-[#4a4f52]">
                      {firstSentence(c.text)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ranking */}
      <section className="mt-12" aria-labelledby="rank-h">
        <h2 id="rank-h" className={H2}>Ranking</h2>
        <p className={SUB}>Each contractor against what an average contractor gets on the same jobs.</p>
        <div className={`${CARD} mt-4 divide-y divide-[rgba(43,48,51,.1)]`}>
          {contractors.map((c, i) => {
            const diff = c.reopen_pct - c.reopen_expected_pct;
            const tone = diff >= 5 ? "bad" : diff <= -5 ? "good" : "normal";
            const on = picked.includes(c.contractor_id);
            return (
              <div key={c.contractor_id} id={c.contractor_id} className="scroll-mt-24 px-5 py-4">
                <div className="grid grid-cols-[28px_44px_1fr] items-center gap-3 sm:grid-cols-[28px_44px_1fr_minmax(200px,280px)_124px]">
                  <span className="text-[15px] font-bold tabular-nums text-[#4a4f52]">{i + 1}</span>
                  <span className={`grid size-11 place-items-center rounded-xl text-xl font-extrabold text-white ${GRADE_BG[c.grade]}`}>{c.grade}</span>
                  <div className="min-w-0">
                    <div className="text-[17px] font-bold leading-tight tracking-[-.01em]">{c.short}</div>
                    <div className="mt-0.5 text-[13px] text-[#4a4f52]">
                      {c.jobs} jobs · {inrShort(c.billed_inr)} billed
                    </div>
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <div className="relative h-2.5 rounded-[4px] bg-[rgba(43,48,51,.08)]">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-[4px] ${tone === "bad" ? "bg-[#d03b3b]" : tone === "good" ? "bg-[#0ca30c]" : "bg-[#d9a441]"}`}
                        style={{ width: `${(100 * c.reopen_pct) / scale}%` }}
                      />
                      <div className="absolute -inset-y-1 w-[3px] rounded bg-[#2b3033]" style={{ left: `${(100 * c.reopen_expected_pct) / scale}%` }} title="Expected" />
                    </div>
                    <div className="mt-1 text-[13px]">
                      <b className={tone === "bad" ? "text-[#c2410c]" : tone === "good" ? "text-[#15803d]" : "text-[#92400e]"}>{c.reopen_pct}% failed</b>
                      <span className="text-[#4a4f52]"> · {c.reopen_expected_pct}% expected</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(c.contractor_id)}
                    disabled={!on && picked.length >= MAX_COMPARE}
                    aria-pressed={on}
                    className={`col-span-3 justify-self-start rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-40 sm:col-span-1 sm:justify-self-end ${
                      on ? "bg-[#2b3033] text-white" : "bg-white text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.18)] hover:bg-[#fdeae4]"
                    }`}
                  >
                    {on ? "✓ Comparing" : "+ Compare"}
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 sm:pl-[84px]">
                  {(c.grade === "A" || c.grade === "B") && <EndorseButton id={c.contractor_id} />}
                  <details className="text-[14px]">
                    <summary className="cursor-pointer font-medium text-[#4a4f52] underline decoration-dotted">Show evidence</summary>
                    <div className="mt-2 max-w-[60em] space-y-1.5 rounded-xl bg-[#faf3eb] p-3">
                      <p>{c.text}</p>
                      {c.evidence.length > 0 && (
                        <p>
                          Flagged work orders:{" "}
                          {c.evidence.map((id, j) => (
                            <span key={id}>
                              {j > 0 && ", "}
                              <Link className="font-semibold underline hover:text-[#ee7454]" href={`/track?q=${id}`}>{id}</Link>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Pct({ v, exp, lowerIsBetter }: { v: number; exp: number; lowerIsBetter?: boolean }) {
  const d = v - exp;
  const good = lowerIsBetter ? d <= -5 : d >= 5;
  const bad = lowerIsBetter ? d >= 5 : d <= -5;
  return (
    <>
      <span className={good ? "text-[#15803d]" : bad ? "text-[#c2410c]" : ""}>{v}%</span>{" "}
      <span className="font-normal text-[#4a4f52]">vs {exp}%</span>
    </>
  );
}

function MiniBar({ v, max, expected }: { v: number; max: number; expected?: number }) {
  return (
    <div className="relative mt-1.5 h-1.5 w-full max-w-[180px] rounded-[4px] bg-[rgba(43,48,51,.08)]" aria-hidden="true">
      <div className="absolute inset-y-0 left-0 rounded-[4px] bg-[#ee7454]" style={{ width: `${Math.min(100, (v / max) * 100)}%` }} />
      {expected != null && (
        <div className="absolute -inset-y-1 w-[2px] rounded bg-[#2b3033]" style={{ left: `${Math.min(100, (expected / max) * 100)}%` }} />
      )}
    </div>
  );
}
