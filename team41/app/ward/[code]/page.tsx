import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import PageShell, { CARD, Chip, H1, H2, LABEL, MUTED, NUM, Stat, flagTone } from "@/components/page-shell";
import { inr, fmt, loadRupee, wardFromSlug, wardSlug } from "@/lib/rupee";

export const metadata = { title: "Ward report · Follow the Rupee" };

async function WardReport({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const { code: slug } = await params;
  const code = wardFromSlug(slug);
  const D = await loadRupee();
  const w = D.wards.find((x) => x.ward_code === code);
  if (!w) notFound();
  const S = D.summary;
  const flags = D.flags.filter((f) => f.ward_code === code);
  const plan = w.next_rupee;
  const t = w.trail;
  const pct = Math.round((100 * w.spent_inr) / w.budget_inr);
  const o = w.outcome_inr;
  const tot = o.held + o.failed + o.flagged || 1;
  const vs = (a: number, e: number, higherBetter: boolean) => (
    <span className={(higherBetter ? a >= e : a <= e) ? "text-[#15803d]" : "text-[#c2410c]"}>
      {a}% <span className={`text-sm ${MUTED}`}>(expected {e}%)</span>
    </span>
  );
  const csv =
    "data:text/csv;charset=utf-8," +
    encodeURIComponent(
      ["work_order_id,flag,confidence,contractor,road,cost_inr,reason"]
        .concat(flags.map((f) => [f.work_order_id, f.flag, f.confidence, f.contractor_name.replace(" (synthetic)", ""), f.road_name, f.cost_inr, `"${f.reason.replace(/"/g, "'")}"`].join(",")))
        .join("\n"),
    );
  const fund = { budget: ["green", "from budget left"], "recovered money": ["blue", "if flagged money is recovered"], "next allocation": ["plain", "next allocation"] } as const;
  const s = w.social;
  const kindLabel: Record<string, [string, "red" | "amber" | "green"]> = { report: ["Problem report", "red"], sarcasm: ["Sarcasm (complaint)", "amber"], thanks: ["Thank-you", "green"] };

  return (
    <>
      <div className={LABEL}>Ward {w.ward_code} · {w.zone} · {w.office}</div>
      <h1 className={`${H1} mt-2`}>{w.ward_name}</h1>
      <p className={`mt-3 max-w-[46em] ${MUTED}`}>
        Where this ward&apos;s monsoon road-repair money went, whether the fixes lasted, and where the next rupee should go.
        Flood-prone index {w.low_lying_index} · population about {fmt(w.population)}.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={`${pct}%`} label={`of budget spent: ${inr(w.spent_inr)} of ${inr(w.budget_inr)} on ${w.jobs} jobs`} bad={pct > 100} />
        <Stat value={inr(w.failed_30d_inr)} label={`spent on ${w.failed_30d_jobs} fixes that failed within 30 days`} bad />
        <Stat value={inr(w.flagged_inr)} label={`billed on ${new Set(flags.map((f) => f.work_order_id)).size} jobs flagged for review`} bad />
        <Stat value={fmt(w.complaints_open_not_fixed)} label={`complaints still open with no repair, of ${fmt(w.complaints)}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className={`${CARD} border-l-4 border-[#ee7454]`}>
          <h2 className="font-[family-name:var(--font-bricolage)] text-xl font-semibold">This week, the ward officer can</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">{w.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
        </section>
        <section className={CARD}>
          <h2 className="font-[family-name:var(--font-bricolage)] text-xl font-semibold">Report card</h2>
          <p className={`text-sm ${MUTED}`}>“Expected” is what this ward&apos;s mix of jobs, flooding and rain would normally give.</p>
          <dl className="mt-3 divide-y divide-dotted divide-[rgba(43,48,51,.2)]">
            <div className="flex justify-between gap-3 py-2"><dt>Deadlines met</dt><dd>{vs(w.sla_met_pct, w.sla_expected_pct, true)}</dd></div>
            <div className="flex justify-between gap-3 py-2"><dt>Fixes failed in 30 days</dt><dd>{vs(w.reopen_pct, w.reopen_expected_pct, false)}</dd></div>
            <div className="flex justify-between gap-3 py-2"><dt>Jobs per repair crew</dt><dd className={w.jobs_per_crew > 1.25 * w.city_jobs_per_crew ? "text-[#c2410c]" : ""}>{w.jobs_per_crew} <span className={`text-sm ${MUTED}`}>(city {w.city_jobs_per_crew}; {w.crews} crews)</span></dd></div>
          </dl>
          <div className="mt-4">
            <div className={`text-sm ${MUTED}`}>Where the money went</div>
            <div className="mt-1.5 flex h-4 overflow-hidden rounded-full" role="img" aria-label={`Held ${Math.round((100 * o.held) / tot)}%, failed ${Math.round((100 * o.failed) / tot)}%, flagged ${Math.round((100 * o.flagged) / tot)}%`}>
              <span className="bg-[#0ca30c]" style={{ width: `${(100 * o.held) / tot}%` }} />
              <span className="border-l-2 border-white bg-[#ec835a]" style={{ width: `${(100 * o.failed) / tot}%` }} />
              <span className="border-l-2 border-white bg-[#d03b3b]" style={{ width: `${(100 * o.flagged) / tot}%` }} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span><i className="mr-1 inline-block size-2.5 rounded-full bg-[#0ca30c]" />Held 30+ days {inr(o.held)}</span>
              <span><i className="mr-1 inline-block size-2.5 rounded-full bg-[#ec835a]" />Failed {inr(o.failed)}</span>
              <span><i className="mr-1 inline-block size-2.5 rounded-full bg-[#d03b3b]" />Flagged {inr(o.flagged)}</span>
            </div>
          </div>
        </section>
      </div>

      <h2 className={H2}>From complaints to repairs</h2>
      <div className="flex flex-wrap items-stretch gap-2">
        {[
          [t.complaints, "complaints"], [t.duplicates, "duplicates set aside"], [t.not_bmc, "not BMC roads / other dept"],
          [(t.issues_fixed ?? 0) + (t.issues_open ?? 0), "distinct problems"], [t.held, "fixed and held"],
          [t.failed, "fixed but failed", true], [t.issues_open, `never fixed (${t.complaints_open ?? 0} complaints)`, true],
        ].map(([n, l, bad], i) => (
          <div key={i} className="rounded-xl bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(43,48,51,.10)]">
            <div className={`${NUM} text-2xl ${bad ? "text-[#c2410c]" : ""}`}>{fmt(Number(n ?? 0))}</div>
            <div className={`text-sm ${MUTED}`}>{l as string}</div>
          </div>
        ))}
      </div>
      <p className={`mt-2 text-sm ${MUTED}`}>
        {t.recategorised ?? 0} complaints were filed under the wrong or a vague category and re-read from their text (English, Hindi, Marathi).
        {" "}{t.jobs_without_complaint ?? 0} paid job(s) here have no complaint behind them.
      </p>

      <h2 className={H2}>Safety and flood watch</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD}>
          <h3 className="font-[family-name:var(--font-bricolage)] font-semibold">Accidents while a repair was waiting</h3>
          {w.pending_accidents.length ? (
            <ul className="mt-2 space-y-2">
              {w.pending_accidents.map((p) => (
                <li key={p.accident_id} className="border-t border-dotted border-[rgba(43,48,51,.2)] pt-2">
                  <b className={p.severity === "Minor" ? "" : "text-[#c2410c]"}>{p.severity}</b> · {p.vehicle} · {p.cause} on {p.road}, {p.date}.{" "}
                  <span className={MUTED}>A complaint had waited {p.days_waiting} days (since {p.waiting_since}); repair{" "}
                  <Link className="underline" href={`/track?q=${p.work_order_id}`}>{p.work_order_id}</Link> was {p.sla_met === "N" ? "late" : "on time"}.</span>
                </li>
              ))}
            </ul>
          ) : <p className={MUTED}>None in this ward.</p>}
          {w.rain_excuses.length > 0 && (
            <p className="mt-4">
              <b>{w.rain_excuses.length}</b> late job(s) say “Rain delayed work” but no day of the job had more than {S.connections.rain_excuse_mm} mm of rain:{" "}
              {w.rain_excuses.map((e, i) => <span key={e.work_order_id}>{i > 0 && ", "}<Link className="underline" href={`/track?q=${e.work_order_id}`}>{e.work_order_id}</Link> ({e.max_rain_mm} mm)</span>)}.
              <span className={MUTED}> Worth asking for the reason, not proof of wrongdoing.</span>
            </p>
          )}
        </section>
        <section className={CARD}>
          <h3 className="font-[family-name:var(--font-bricolage)] font-semibold">Flood spots</h3>
          {w.hotspots.length ? (
            <ul className="mt-2 space-y-2">
              {w.hotspots.map((h) => (
                <li key={h.name} className="border-t border-dotted border-[rgba(43,48,51,.2)] pt-2">
                  <b>{h.name}</b>: floods above {h.threshold_mm} mm/day ({h.flood_days} days this season{h.tide_sensitive ? `, ${h.flood_days_with_big_tide} on a big-tide day` : ""}).{" "}
                  {h.tide_sensitive ? <Chip tone="red">tide-sensitive</Chip> : <Chip>not tide-sensitive</Chip>}{" "}
                  {h.pump_station ? <Chip tone="green">pumping station</Chip> : <Chip tone="red">no pumping station</Chip>}
                  <div className={`text-sm ${MUTED}`}>{h.avg_depth_cm} cm deep for about {h.recession_h} h. Pump hire nearby: {h.pump_jobs} jobs, {inr(h.pump_spend_inr)}.</div>
                </li>
              ))}
            </ul>
          ) : <p className={MUTED}>No chronic flood spots listed in this ward.</p>}
          <p className={`mt-3 text-sm ${MUTED}`}>
            City-wide, waterlogging complaints average {S.connections.tide_effect.heavy_only} a day with heavy rain and {S.connections.tide_effect.heavy_and_big_tide} when heavy rain falls on a big-tide day. Tides are known months ahead, so pumps can be placed before those dates.
          </p>
        </section>
      </div>

      <h2 className={H2} id="jobs">Jobs to check <span className={`text-base font-normal ${MUTED}`}>({flags.length}, largest first)</span></h2>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-[15px]">
          <thead className={`text-left text-sm ${MUTED}`}>
            <tr><th className="py-2 pr-3">Work order</th><th className="pr-3">Flag</th><th className="pr-3">Why</th><th className="pr-3">Contractor</th><th className="text-right">Billed</th></tr>
          </thead>
          <tbody>
            {flags.slice(0, 15).map((f, i) => (
              <tr key={i} className="border-t border-[rgba(43,48,51,.12)] align-top">
                <td className="py-2 pr-3"><Link className="underline decoration-dotted hover:text-[#ee7454]" href={`/track?q=${f.work_order_id}`}>{f.work_order_id}</Link></td>
                <td className="py-2 pr-3"><Chip tone={flagTone(f.flag)}>{f.flag}</Chip><div className={`mt-1 text-xs font-semibold ${f.confidence === "High" ? "text-[#c2410c]" : "text-[#b45309]"}`}>{f.confidence}</div></td>
                <td className="py-2 pr-3">{f.reason}</td>
                <td className="py-2 pr-3">{f.contractor_name.replace(" (synthetic)", "")}</td>
                <td className="py-2 text-right tabular-nums">{inr(f.cost_inr)}</td>
              </tr>
            ))}
            {!flags.length && <tr><td colSpan={5} className={`py-2 ${MUTED}`}>No flags in this ward.</td></tr>}
          </tbody>
        </table>
        {flags.length > 0 && (
          <a className="mt-3 inline-block rounded-full border border-[rgba(43,48,51,.2)] px-4 py-1.5 font-[family-name:var(--font-bricolage)] text-sm font-medium hover:text-[#ee7454]" download={`flags_${wardSlug(code)}.csv`} href={csv}>
            Download all {flags.length} as CSV for the ward office
          </a>
        )}
      </div>

      <h2 className={H2}>Where the next rupee should go</h2>
      <p className={MUTED}>
        Budget left: {plan.budget_left_inr >= 0 ? inr(plan.budget_left_inr) : `none (over by ${inr(-plan.budget_left_inr)})`} · could be recovered from flagged jobs: {inr(plan.recoverable_inr)} · this plan: {inr(plan.plan_total_inr)}
      </p>
      <ol className="mt-3 space-y-3">
        {plan.items.map((i, k) => (
          <li key={i.road_id} className={CARD}>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className={`${NUM} text-[#ee7454]`}>{k + 1}.</span>
              <b className="font-[family-name:var(--font-bricolage)] font-semibold">{i.road}</b>
              <span>{i.action}{i.est_cost_inr ? `, about ${inr(i.est_cost_inr)}` : ""}</span>
              <Chip tone={fund[i.funded_by][0]}>{fund[i.funded_by][1]}</Chip>
              <span className={`ml-auto text-sm ${MUTED}`}>risk {i.risk}/100</span>
            </div>
            <div className={`mt-1 text-[15px] ${MUTED}`}>{i.issue}. Why: {i.why}.</div>
          </li>
        ))}
        {!plan.items.length && <li className={MUTED}>No open, unfixed complaints mapped to roads in this ward.</li>}
      </ol>
      <p className={`mt-2 text-sm ${MUTED}`}>Methods are the most durable in the data for each issue, not the cheapest. Ambulance roads to emergency hospitals count double; roads with an accident while a complaint waited count 1.5×.</p>

      <h2 className={H2}>What people are saying</h2>
      {s.posts ? (
        <section className={CARD}>
          <div className="flex flex-wrap gap-2 text-sm">
            <Chip tone="red">{s.reports} problem reports</Chip><Chip tone="amber">{s.sarcasm} sarcastic complaints</Chip>
            <Chip tone="green">{s.thanks} thank-yous</Chip><Chip>{s.noise} noise set aside</Chip>
            <Chip tone="red">{s.unreported} with no matching complaint</Chip><Chip>{fmt(s.reach ?? 0)} likes and forwards</Chip>
          </div>
          <ul className="mt-3">
            {(s.top ?? []).map((p, i) => (
              <li key={i} className="border-t border-[rgba(43,48,51,.12)] py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Chip tone={kindLabel[p.kind]?.[1] ?? "plain"}>{kindLabel[p.kind]?.[0] ?? p.kind}</Chip>
                  <span className={MUTED}>{p.source} · {p.date} · {p.reach} likes/forwards</span>
                  {p.unreported && <Chip tone="red">no complaint filed</Chip>}
                </div>
                <p className="mt-1">{p.text}</p>
              </li>
            ))}
          </ul>
          <p className={`text-sm ${MUTED}`}>Posts are a signal of where to look, never proof on their own.</p>
        </section>
      ) : <p className={MUTED}>No social media posts matched to this ward.</p>}

      <h2 className={H2}>Other wards</h2>
      <div className="flex flex-wrap gap-2">
        {D.wards.map((x) => (
          <Link key={x.ward_code} href={`/ward/${wardSlug(x.ward_code)}`}
            className={`rounded-full px-3 py-1 font-[family-name:var(--font-bricolage)] text-sm font-medium shadow-[0_0_0_1px_rgba(43,48,51,.14)] hover:text-[#ee7454] ${x.ward_code === code ? "bg-[#ee7454] text-white hover:text-white" : "bg-white"}`}>
            {x.ward_code}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function WardPage(props: PageProps<"/ward/[code]">) {
  return (
    <PageShell current="ward">
      <Suspense fallback={<p className={MUTED}>Loading ward…</p>}>
        <WardReport params={props.params} />
      </Suspense>
    </PageShell>
  );
}
