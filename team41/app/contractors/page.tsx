import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import PageShell, { H1, MUTED } from "@/components/page-shell";
import EndorseButton from "@/components/endorse-button";
import { inr, loadRupee } from "@/lib/rupee";

export const metadata = { title: "Contractors · Follow the Rupee" };

const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.12),0_18px_40px_-26px_rgba(0,0,0,.35)]";
const GRADE = { A: "bg-[#15803d]", B: "bg-[#65a30d]", C: "bg-[#b45309]", D: "bg-[#c2410c]" };
const ORDER = { A: 0, B: 1, C: 2, D: 3 };
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

async function Contractors() {
  await connection();
  const D = await loadRupee();
  const ranked = [...D.contractors].sort((a, b) => ORDER[a.grade] - ORDER[b.grade] || b.durability_vs_expected_pp - a.durability_vs_expected_pp);
  const better = ranked.filter((c) => c.reopen_pct <= c.reopen_expected_pct - 5).length;
  const worse = ranked.filter((c) => c.reopen_pct >= c.reopen_expected_pct + 5).length;
  const scale = Math.max(...ranked.map((c) => Math.max(c.reopen_pct, c.reopen_expected_pct))) + 5;

  return (
    <>
      <p className={`${B} mt-3 max-w-[40em] text-[clamp(20px,2.2vw,26px)] font-semibold leading-snug`}>
        {better} contractors&apos; repairs last longer than expected for the same work; {worse} fail clearly more often.
      </p>
      <p className={`mt-2 max-w-[46em] ${MUTED}`}>
        Fair comparison: each contractor is measured against what an average contractor would get on the <i>same</i> jobs: same repair methods, equally flood-prone wards, same heavy-rain weeks.
      </p>

      <div className={`${CARD} mt-6 divide-y divide-[rgba(43,48,51,.1)]`}>
        <div className={`hidden grid-cols-[44px_1fr_minmax(220px,300px)] gap-4 px-5 py-2 text-xs uppercase tracking-[.06em] sm:grid ${MUTED}`}>
          <span /> <span>Contractor</span>
          <span>Fixes that failed within 30 days <span className="normal-case tracking-normal">(| = expected)</span></span>
        </div>
        {ranked.map((c) => {
          // within 5 points of expected counts as normal variation (same band the grade uses)
          const diff = c.reopen_pct - c.reopen_expected_pct;
          const tone = diff >= 5 ? "bad" : diff <= -5 ? "good" : "normal";
          const billing = (c.flags["Over-billed"] ?? 0) + (c.flags["Possible double billing"] ?? 0);
          return (
            <div key={c.contractor_id} id={c.contractor_id} className="scroll-mt-24 px-5 py-4">
              <div className="grid grid-cols-[44px_1fr] items-start gap-4 sm:grid-cols-[44px_1fr_minmax(220px,300px)]">
                <span className={`${B} grid size-11 place-items-center rounded-xl text-xl font-semibold text-white ${GRADE[c.grade]}`}>{c.grade}</span>
                <div className="min-w-0">
                  <div className={`${B} text-lg font-semibold leading-tight`}>{c.short}</div>
                  <p className="mt-0.5 text-[15px] text-[#4a4f52]">{firstSentence(c.text)}</p>
                </div>
                {/* one visual: actual failure rate, with the expected rate marked */}
                <div className="col-span-2 sm:col-span-1">
                  <div className="relative h-3 rounded-full bg-[rgba(43,48,51,.08)]">
                    <div className={`absolute inset-y-0 left-0 rounded-full ${tone === "bad" ? "bg-[#d03b3b]" : tone === "good" ? "bg-[#0ca30c]" : "bg-[#d9a441]"}`} style={{ width: `${(100 * c.reopen_pct) / scale}%` }} />
                    <div className="absolute -inset-y-1 w-[3px] rounded bg-[#2b3033]" style={{ left: `${(100 * c.reopen_expected_pct) / scale}%` }} title="Expected" />
                  </div>
                  <div className="mt-1 text-sm">
                    <b className={tone === "bad" ? "text-[#c2410c]" : tone === "good" ? "text-[#15803d]" : "text-[#92400e]"}>{c.reopen_pct}%</b>
                    <span className={MUTED}> vs {c.reopen_expected_pct}% expected{tone === "normal" ? " · about as expected" : ""}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 pl-[60px]">
                {(c.grade === "A" || c.grade === "B") && <EndorseButton id={c.contractor_id} />}
                <details className="text-sm">
                  <summary className="cursor-pointer text-[#4a4f52] underline decoration-dotted">Show evidence</summary>
                  <div className="mt-2 max-w-[60em] space-y-1.5 rounded-xl bg-[#faf3eb] p-3">
                    <p>{c.text}</p>
                    <p>Deadlines met: <b>{c.sla_met_pct}%</b> (expected {c.sla_expected_pct}%) · Typical cost vs rate card: <b>{c.median_cost_ratio}×</b> · Over-billed or repeat bills: <b>{billing}</b> of {c.jobs} jobs · Billed {inr(c.billed_inr)}</p>
                    <p className={MUTED}>Context: {c.low_lying_share_pct}% of jobs in highly flood-prone wards, {c.heavy_rain_share_pct}% with heavy rain within a week, {c.cold_mix_share_pct}% cold-mix patches.</p>
                    {c.evidence.length > 0 && (
                      <p>Flagged work orders: {c.evidence.map((id, i) => <span key={id}>{i > 0 && ", "}<Link className="underline hover:text-[#ee7454]" href={`/track?q=${id}`}>{id}</Link></span>)}</p>
                    )}
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>

      <details className={`${CARD} mt-5 p-5`}>
        <summary className={`${B} cursor-pointer font-semibold`}>How the grade works</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
          <li><b>Durability</b> (fixes that last), against expected: 5+ points better = +2, 5+ worse = −2. Counts double: a failed fix is paid for twice.</li>
          <li><b>Speed</b> (deadlines met), against expected: 5+ points better = +1, 5+ worse = −1.</li>
          <li><b>Billing</b>: over-billed and repeat bills above 5% of jobs = −2, above 1% = −1.</li>
          <li>2+ points = A, 0 to 1 = B, −1 to −2 = C, lower = D. Warranty (DLP) payments are BMC&apos;s decision, so they are not counted against contractors.</li>
        </ul>
      </details>
    </>
  );
}

export default function ContractorsPage() {
  return (
    <PageShell current="contractors">
      <h1 className={H1}>Who did the work, and did it last?</h1>
      <Suspense fallback={<div className="h-40" />}>
        <Contractors />
      </Suspense>
    </PageShell>
  );
}
