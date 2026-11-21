import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import PageShell, { CARD, H1, H2, LABEL, MUTED, NUM } from "@/components/page-shell";
import EndorseButton from "@/components/endorse-button";
import { inr, loadRupee } from "@/lib/rupee";

export const metadata = { title: "Contractors · Follow the Rupee" };

const GRADE = { A: "bg-[#15803d]", B: "bg-[#65a30d]", C: "bg-[#b45309]", D: "bg-[#c2410c]" };
const ORDER = { A: 0, B: 1, C: 2, D: 3 };

async function Contractors() {
  await connection();
  const D = await loadRupee();
  const ranked = [...D.contractors].sort((a, b) => ORDER[a.grade] - ORDER[b.grade] || b.durability_vs_expected_pp - a.durability_vs_expected_pp);
  const cmp = (a: number, e: number, hi: boolean) => ((hi ? a >= e : a <= e) ? "text-[#15803d]" : "text-[#c2410c]");
  return (
    <>
      <section className={`${CARD} mt-6`}>
        <h2 className="font-[family-name:var(--font-bricolage)] text-xl font-semibold">Ranking</h2>
        <ol className="mt-2">
          {ranked.map((c, i) => (
            <li key={c.contractor_id} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 border-t border-[rgba(43,48,51,.12)] py-3 sm:grid-cols-[28px_1fr_auto_auto]">
              <span className={`${NUM} ${MUTED}`}>{i + 1}</span>
              <span><a className="font-[family-name:var(--font-bricolage)] font-semibold hover:text-[#ee7454]" href={`#${c.contractor_id}`}>{c.short}</a>
                <span className={`block text-sm ${MUTED}`}>{c.jobs} jobs · {inr(c.billed_inr)}</span></span>
              <span className={`hidden text-sm sm:block ${MUTED}`}>fixes failed {c.reopen_pct}% (expected {c.reopen_expected_pct}%)</span>
              <span className={`grid size-9 place-items-center rounded-lg font-[family-name:var(--font-bricolage)] text-lg font-semibold text-white ${GRADE[c.grade]}`}>{c.grade}</span>
            </li>
          ))}
        </ol>
      </section>

      <h2 className={H2}>Good work</h2>
      <p className={MUTED}>Repairs lasted longer and were faster than expected. Citizens can endorse them for future work in their ward (saved in this browser only; the prototype has no shared database).</p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {ranked.filter((c) => c.grade === "A" || c.grade === "B").map((c) => (
          <div key={c.contractor_id} className={`${CARD} bg-[#f0fdf4]`}>
            <div className={LABEL}>Grade {c.grade}</div>
            <h3 className="mt-1 font-[family-name:var(--font-bricolage)] text-lg font-semibold">{c.short}</h3>
            <p className="mt-2 text-[15px]">Fixes failed {c.reopen_pct}% of the time against {c.reopen_expected_pct}% expected; {c.sla_met_pct}% on time ({c.sla_expected_pct}% expected).</p>
            <div className="mt-3"><EndorseButton id={c.contractor_id} /></div>
          </div>
        ))}
      </div>

      <h2 className={H2}>All scorecards</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {ranked.map((c) => (
          <article key={c.contractor_id} id={c.contractor_id} className={`${CARD} scroll-mt-24`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-[family-name:var(--font-bricolage)] text-lg font-semibold">{c.short}</h3>
                <div className={`text-sm ${MUTED}`}>{c.jobs} jobs · {inr(c.billed_inr)} · empanelled since {c.empanelled_since}</div>
              </div>
              <span className={`grid size-11 flex-none place-items-center rounded-xl font-[family-name:var(--font-bricolage)] text-2xl font-semibold text-white ${GRADE[c.grade]}`}>{c.grade}</span>
            </div>
            <p className="mt-3">{c.text}</p>
            <dl className="mt-3 divide-y divide-dotted divide-[rgba(43,48,51,.2)] text-[15px]">
              <div className="flex justify-between py-1.5"><dt className={MUTED}>Deadlines met</dt><dd className={cmp(c.sla_met_pct, c.sla_expected_pct, true)}>{c.sla_met_pct}% <span className={MUTED}>(expected {c.sla_expected_pct}%)</span></dd></div>
              <div className="flex justify-between py-1.5"><dt className={MUTED}>Fixes failed in 30 days</dt><dd className={cmp(c.reopen_pct, c.reopen_expected_pct, false)}>{c.reopen_pct}% <span className={MUTED}>(expected {c.reopen_expected_pct}%)</span></dd></div>
              <div className="flex justify-between py-1.5"><dt className={MUTED}>Typical cost vs rate card</dt><dd>{c.median_cost_ratio}×</dd></div>
              <div className="flex justify-between py-1.5"><dt className={MUTED}>Over-billed / repeat bills</dt><dd>{c.flags["Over-billed"] ?? 0} / {c.flags["Possible double billing"] ?? 0}</dd></div>
            </dl>
            <p className={`mt-3 text-sm ${MUTED}`}>
              Context: {c.low_lying_share_pct}% of jobs in highly flood-prone wards, {c.heavy_rain_share_pct}% with heavy rain within a week, {c.cold_mix_share_pct}% cold-mix patches.
              {c.evidence.length > 0 && <> Evidence: {c.evidence.map((id, i) => <span key={id}>{i > 0 && ", "}<Link className="underline" href={`/track?q=${id}`}>{id}</Link></span>)}.</>}
            </p>
          </article>
        ))}
      </div>

      <h2 className={H2}>How the grade works</h2>
      <div className={CARD}>
        <p>Each contractor is compared with what an <b>average contractor would get on the same jobs</b>: the same repair methods, in equally flood-prone wards, with the same heavy-rain weeks.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Durability</b> (fixes that last): 5+ points better than expected = +2, 5+ worse = −2. Counts double because a failed fix is paid for twice.</li>
          <li><b>Speed</b> (deadlines met): 5+ points better = +1, 5+ worse = −1.</li>
          <li><b>Billing</b>: over-billed and repeat bills above 5% of jobs = −2, above 1% = −1.</li>
          <li>Grade: 2+ points = A, 0 to 1 = B, −1 to −2 = C, below = D. DLP payments are a BMC payment check and are not counted.</li>
        </ul>
      </div>
    </>
  );
}

export default function ContractorsPage() {
  return (
    <PageShell current="contractors">
      <div className={LABEL}>Hold to account, fairly</div>
      <h1 className={`${H1} mt-2`}>Who did the work, and did it last?</h1>
      <p className={`mt-3 max-w-[46em] ${MUTED}`}>A fair, plain-language scorecard for every contractor. Evidence-based, with context: nobody is blamed for flooding or heavy rain they could not control.</p>
      <Suspense fallback={<p className={`mt-6 ${MUTED}`}>Loading…</p>}>
        <Contractors />
      </Suspense>
    </PageShell>
  );
}
