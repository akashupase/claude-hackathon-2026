import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import PageShell from "@/components/page-shell";
import { HBars, ShareBar, type Datum } from "@/app/audit/charts";
import { inter } from "@/lib/fonts";
import { fmt, inr, loadRupee, wardFromSlug, wardSlug } from "@/lib/rupee";
import { wardActions } from "@/lib/ward-actions";

export const metadata = { title: "Ward · Follow the Rupee" };

// Same visual language as /audit: one big number, plain tiles, simple coral bars, little prose.
const CARD = "rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]";
const H = "font-[family-name:var(--font-bricolage)] text-[20px] font-extrabold leading-tight tracking-[-.025em]";
const SUB = "mt-1 mb-5 text-[14px] text-[#4a4f52]";
const NUM = "font-[family-name:var(--font-bricolage)] font-extrabold tabular-nums tracking-[-.03em]";

function Tile({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/70 p-4 shadow-[0_0_0_1px_rgba(43,48,51,.10)]">
      <div className={`${NUM} text-[clamp(28px,3.2vw,40px)] leading-none ${accent ? "text-[#ee7454]" : "text-[#2b3033]"}`}>{value}</div>
      <div className="mt-2 font-[family-name:var(--font-bricolage)] text-[14px] font-medium uppercase tracking-[.06em] text-[#4a4f52]">{label}</div>
    </div>
  );
}

const FLAG_LABEL: Record<string, string> = { "Paid during DLP": "Warranty ignored", "Over-billed": "Overcharged", "Possible double billing": "Billed twice" };

async function Ward({ params }: { params: Promise<{ code: string }> }) {
  await connection();
  const code = wardFromSlug((await params).code);
  const D = await loadRupee();
  const w = D.wards.find((x) => x.ward_code === code);
  if (!w) notFound();

  const flags = D.flags.filter((f) => f.ward_code === code);
  const atIssue = w.outcome_inr.failed + w.outcome_inr.flagged;
  const spentPct = Math.round((100 * w.spent_inr) / w.budget_inr);
  const t = w.trail;
  const plan = w.next_rupee.items;

  const why: Datum[] = Object.keys(FLAG_LABEL)
    .map((k) => {
      const f = flags.filter((x) => x.flag === k);
      const amt = f.reduce((s, x) => s + x.inr_at_risk, 0);
      return { key: k, label: FLAG_LABEL[k], value: amt, valueLabel: inr(amt), detail: `${f.length} bill${f.length === 1 ? "" : "s"}` };
    })
    .filter((d) => d.value > 0);
  // Sort here: Postgres JSONB does not keep the key order the analysis wrote.
  const who: Datum[] = Object.entries(w.by_contractor)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 5)
    .map(([name, amt]) => ({ key: name, label: name.replace(" (synthetic)", ""), value: amt, valueLabel: inr(amt) }));
  const trail: Datum[] = [
    { key: "c", label: "Complaints received", value: t.complaints ?? 0, valueLabel: fmt(t.complaints ?? 0) },
    { key: "p", label: "Real problems (after duplicates)", value: (t.issues_fixed ?? 0) + (t.issues_open ?? 0), valueLabel: fmt((t.issues_fixed ?? 0) + (t.issues_open ?? 0)) },
    { key: "h", label: "Fixed, and it lasted", value: t.held ?? 0, valueLabel: fmt(t.held ?? 0) },
    { key: "f", label: "Fixed, then broke again", value: t.failed ?? 0, valueLabel: fmt(t.failed ?? 0) },
    { key: "n", label: "Never fixed", value: t.issues_open ?? 0, valueLabel: fmt(t.issues_open ?? 0) },
  ];
  const actions = wardActions(D, w, "en").slice(0, 4);

  return (
    <>
      <div className="font-[family-name:var(--font-bricolage)] text-[13px] font-bold uppercase tracking-[.14em] text-[#ee7454]">
        Ward {w.ward_code} · {w.ward_name}
      </div>
      <h1 className="mt-3 font-[family-name:var(--font-bricolage)] text-[clamp(40px,7vw,92px)] font-extrabold leading-[.92] tracking-[-.05em]">
        <span className="text-[#ee7454]">{inr(atIssue)}</span>
        <span className="block text-[.55em] tracking-[-.04em]">went on repairs that failed or were flagged.</span>
      </h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tile value={`${spentPct}%`} label={`of ${inr(w.budget_inr)} budget spent`} accent={spentPct > 100} />
        <Tile value={fmt(w.complaints_open_not_fixed)} label="complaints still waiting" />
        <Tile value={fmt(plan.length)} label="roads to fix next" />
      </div>
      <div className={`${CARD} mt-3`}>
        <ShareBar part={atIssue} whole={w.spent_inr} partLabel={`Failed or flagged ${inr(atIssue)}`} restLabel={`Total spend ${inr(w.spent_inr)}`} />
      </div>

      {actions.length > 0 && (
        <div className={`${CARD} mt-6`}>
          <div className={H}>This week</div>
          <p className={SUB}>What the ward officer can do now.</p>
          <ol className="space-y-2.5">
            {actions.map((a, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-snug">
                <span className={`${NUM} grid size-7 flex-none place-items-center rounded-full bg-[#ee7454] text-[13px] text-white`}>{i + 1}</span>
                <span className="pt-0.5">{a}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className={CARD}>
          <div className={H}>Why · this ward</div>
          <p className={SUB}>Money on flagged bills, by problem.</p>
          {why.length ? <HBars data={why} /> : <p className="py-6 text-center text-[14px] text-[#4a4f52]">No flagged bills here.</p>}
          <Link href="/audit" className="mt-4 inline-block text-[14px] font-semibold underline hover:text-[#ee7454]">See every flagged bill →</Link>
        </div>
        <div className={CARD}>
          <div className={H}>Who · contractors here</div>
          <p className={SUB}>Money paid in this ward.</p>
          <HBars data={who} />
          <Link href="/contractors" className="mt-4 inline-block text-[14px] font-semibold underline hover:text-[#ee7454]">How fair are they? →</Link>
        </div>
      </div>

      <div className={`${CARD} mt-6`}>
        <div className={H}>Complaints → repairs</div>
        <p className={SUB}>What happened to what citizens reported.</p>
        <HBars data={trail} />
      </div>

      <div className={`${CARD} mt-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className={H}>Fix next</div>
          <Link href={`/plan?ward=${wardSlug(code)}`} className="rounded-full bg-[#2b3033] px-3 py-1 text-[12.5px] font-medium text-white hover:bg-[#ee7454]">Full plan →</Link>
        </div>
        <p className={SUB}>The riskiest roads with open problems.</p>
        <ol className="divide-y divide-[rgba(43,48,51,.1)]">
          {plan.slice(0, 3).map((i, k) => (
            <li key={i.road_id} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
              <span className="min-w-0"><span className={`${NUM} mr-2 text-[#ee7454]`}>{k + 1}</span><span className="font-semibold">{i.road}</span></span>
              <span className={`${NUM} flex-none`}>{i.est_cost_inr ? inr(i.est_cost_inr) : "₹0"}</span>
            </li>
          ))}
          {!plan.length && <li className="py-6 text-center text-[14px] text-[#4a4f52]">No open road problems mapped here.</li>}
        </ol>
      </div>

      <div className="mt-8 flex flex-wrap gap-1.5">
        {D.wards.map((x) => (
          <Link key={x.ward_code} href={`/ward/${wardSlug(x.ward_code)}`}
            className={`rounded-full px-3 py-1 text-[13px] font-medium shadow-[0_0_0_1px_rgba(43,48,51,.14)] ${x.ward_code === code ? "bg-[#ee7454] text-white" : "bg-white hover:text-[#ee7454]"}`}>
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
      {/* Plain sans, as on /audit: every font var below resolves to Inter. */}
      <div className={`${inter.variable} font-[family-name:var(--font-inter)] [--font-bricolage:var(--font-inter)] [--font-newsreader:var(--font-inter)]`}>
        <Suspense fallback={<p className="text-[#4a4f52]">Loading…</p>}>
          <Ward params={props.params} />
        </Suspense>
      </div>
    </PageShell>
  );
}
