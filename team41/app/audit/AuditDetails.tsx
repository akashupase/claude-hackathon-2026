// Bill-level detail for /audit (from the follow_the_rupee feed): the price
// chart, story cards per problem type, the officials' top-10 + CSV, and what
// is deliberately not flagged. Sits under the charts in WastedMoney.
import Link from "next/link";
import { MUTED } from "@/components/page-shell";
import { fmt, inr, loadRupee, type Flag } from "@/lib/rupee";

const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.12),0_18px_40px_-26px_rgba(0,0,0,.35)]";

// The three checks, in plain words.
const TYPES = [
  { key: "Paid during DLP", slug: "warranty", title: "Paid for free repairs", icon: "₹",
    rule: "The road was still under its guarantee, so the builder had to fix it for free. BMC paid anyway." },
  { key: "Over-billed", slug: "overbilled", title: "Charged too much", icon: "↑",
    rule: "The bill was well above the normal price for that job (more than 1.35 times)." },
  { key: "Possible double billing", slug: "double", title: "Billed twice?", icon: "×2",
    rule: "The same job on the same road by the same contractor was billed again a few days later, with no complaint behind it." },
] as const;

const dateText = (d?: string) => (d ? new Date(d.slice(0, 10)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

// One flagged job told as a short story with a small picture, in plain words.
function Story({ f, D }: { f: Flag; D: Awaited<ReturnType<typeof loadRupee>> }) {
  const wo = D.W[f.work_order_id];
  const where = `${f.road_name}, ward ${f.ward_code}`;
  let title = "", body: React.ReactNode = null, picture: React.ReactNode = null;
  if (f.flag === "Over-billed") {
    const normal = f.expected_inr ?? 0, paid = f.cost_inr, top = Math.max(normal, paid);
    title = `Charged ${f.ratio}× the normal price`;
    body = <>The normal price for this job is about <b>{inr(normal)}</b>. The contractor was paid <b>{inr(paid)}</b>.</>;
    picture = (
      <div className="space-y-1.5 text-sm">
        <div><div className="h-4 rounded bg-[#9fb3c8]" style={{ width: `${(100 * normal) / top}%` }} /><span className="text-[#4a4f52]">Normal price {inr(normal)}</span></div>
        <div><div className="h-4 rounded bg-[#d03b3b]" style={{ width: "100%" }} /><span className="text-[#4a4f52]">Paid {inr(paid)}</span></div>
      </div>
    );
  } else if (f.flag === "Possible double billing") {
    const twin = f.twin ? D.W[f.twin] : undefined;
    title = "Same job, billed twice?";
    body = <>The same work on the same road, by the same contractor, was billed again <b>{f.gap_days} days</b> later. Nobody had complained the second time.</>;
    picture = (
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg border border-[rgba(43,48,51,.2)] p-2"><div className="text-xs text-[#4a4f52]">Bill 1 · {dateText(twin?.[5])}</div><div className={`${B} font-semibold`}>{inr(twin?.[4] ?? 0)}</div><div className="text-xs text-[#15803d]">citizen complained</div></div>
        <div className="rounded-lg border-2 border-[#d03b3b] p-2"><div className="text-xs text-[#4a4f52]">Bill 2 · {dateText(wo?.[5])}</div><div className={`${B} font-semibold`}>{inr(f.cost_inr)}</div><div className="text-xs text-[#c2410c]">no complaint</div></div>
      </div>
    );
  } else {
    title = "Paid for a repair that should have been free";
    body = <>This road was relaid on <b>{dateText(f.resurfaced ?? "")}</b> and is still under its guarantee, so the builder had to fix it for free. BMC paid <b>{inr(f.cost_inr)}</b> anyway.</>;
    picture = (
      <div className="flex items-center gap-2 text-sm">
        <span className="rounded-lg bg-[#e0f2fe] px-2 py-1 text-[#075985]">🛡 Under guarantee</span>
        <span className="text-[#4a4f52]">→</span>
        <span className="rounded-lg bg-[#fde8e1] px-2 py-1 font-semibold text-[#9a3412]">BMC paid {inr(f.cost_inr)}</span>
      </div>
    );
  }
  return (
    <div className={`${CARD} flex flex-col p-5`}>
      <div className={`${B} text-lg font-bold leading-tight tracking-[-.015em]`}>{title}</div>
      <div className="mt-0.5 text-sm text-[#4a4f52]">{where}</div>
      <div className="mt-4">{picture}</div>
      <p className="mt-4 flex-1 text-[15px] leading-relaxed">{body}</p>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className={f.confidence === "High" ? "font-semibold text-[#c2410c]" : "font-semibold text-[#b45309]"}>{f.confidence === "High" ? "Very likely" : "Worth checking"}</span>
        <Link href={`/track?q=${f.work_order_id}`} className="underline hover:text-[#ee7454]">See the bill →</Link>
      </div>
    </div>
  );
}

const H2 = `${B} text-[clamp(24px,2.6vw,34px)] font-extrabold tracking-[-.035em]`;

export default async function AuditDetails({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const D = await loadRupee();
  const S = D.summary;
  const active = TYPES.find((t) => t.slug === sp.type);

  const list = D.flags
    .filter((f) => !active || f.flag === active.key)
    .sort((a, b) => b.inr_at_risk - a.inr_at_risk)
    .slice(0, 10);
  const examples = active
    ? list.slice(0, 3)
    : TYPES.map((t) => D.flags.filter((f) => f.flag === t.key).sort((a, b) => b.inr_at_risk - a.inr_at_risk)[0]).filter(Boolean);
  // Older feeds (seeded before these fields existed) lack the chart data: hide those parts instead of crashing.
  const hist = S.cost_ratio_hist ?? [];
  const peak = Math.max(1, ...hist.map((h) => h.jobs));
  const nf = S.not_flagged;

  return (
    <>
      {/* one chart: real problems vs normal variation */}
      {hist.length > 0 && nf && (
        <div className={`${CARD} mt-6 p-5`}>
          <div className={`${B} text-[20px] font-extrabold tracking-[-.025em]`}>Real problems, not normal variation</div>
          <p className={`mt-1 text-[15px] ${MUTED}`}>
            Each bar is a group of jobs, by how their bill compares with the normal price. Most jobs ({fmt(nf.normal_price_band)}) are within 30% of it, which is normal.
            Then it drops off a cliff: only {hist.filter((h) => h.lo >= 1.3 && h.hi !== null).reduce((s, h) => s + h.jobs, 0)} jobs between 1.30× and 1.50×, and {hist[hist.length - 1].jobs} above 1.50×. We flag bills above 1.35 times the normal price.
          </p>
          <div className="mt-4 flex h-40 items-end gap-[3px]" role="img" aria-label="Chart of bills compared with the normal price">
            {hist.map((h) => {
              const flagged = h.lo >= 1.35;
              return (
                <div key={h.lo} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div className={`rounded-t ${flagged ? "bg-[#d03b3b]" : "bg-[#9fb3c8]"}`} style={{ height: `${Math.max(h.jobs ? 3 : 0, (100 * h.jobs) / peak)}%` }} />
                  <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#2b3033] px-1.5 py-0.5 text-xs text-white group-hover:block">{fmt(h.jobs)} jobs</span>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-[3px] text-[11px] text-[#4a4f52]">
            {hist.map((h) => <span key={h.lo} className="flex-1 text-center">{h.hi === null ? "1.5×+" : Number.isInteger(h.lo * 10) ? `${h.lo.toFixed(1)}×` : ""}</span>)}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#9fb3c8]" />Normal price range</span>
            <span><i className="mr-1.5 inline-block size-2.5 rounded-sm bg-[#d03b3b]" />Flagged as over-billed</span>
          </div>
        </div>
      )}

      {/* real examples, told plainly, filterable by problem type */}
      <section id="bills" className="mt-12 scroll-mt-24">
        <h2 className={H2}>{active ? `The biggest “${active.title}” cases` : "The bills, in plain words"}</h2>
        <p className={`mt-1 text-[14.5px] ${MUTED}`}>A flag is a reason to check the work order, not proof of wrongdoing.</p>
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by problem">
          {[{ slug: "", title: "One of each" }, ...TYPES].map((t) => {
            const on = (active?.slug ?? "") === t.slug;
            return (
              <Link
                key={t.slug || "all"}
                href={t.slug ? `/audit?type=${t.slug}#bills` : "/audit#bills"}
                scroll={false}
                aria-current={on ? "true" : undefined}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${on ? "bg-[#2b3033] text-white" : "bg-white text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.16)] hover:bg-[#fdeae4]"}`}
              >
                {t.title}
              </Link>
            );
          })}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {examples.map((f) => <Story key={`${f.work_order_id}-${f.flag}`} f={f} D={D} />)}
        </div>
      </section>

      <details className={`${CARD} mt-5 p-5`}>
        <summary className={`${B} cursor-pointer font-bold`}>For officials: the 10 largest flags</summary>
        <ol className="mt-3 divide-y divide-[rgba(43,48,51,.1)] text-[15px]">
          {list.map((f, k) => (
            <li key={`${f.work_order_id}-${f.flag}`} className="flex items-baseline gap-3 py-2">
              <span className="w-5 flex-none text-[#4a4f52]">{k + 1}</span>
              <Link href={`/track?q=${f.work_order_id}`} className={`${B} flex-none font-bold hover:text-[#ee7454]`}>{f.work_order_id}</Link>
              <span className="min-w-0 flex-1 truncate text-[#4a4f52]">{f.road_name} · ward {f.ward_code} · {f.contractor_name.replace(" (synthetic)", "")}</span>
              <span className={`${B} flex-none font-bold tabular-nums`}>{inr(f.inr_at_risk)}</span>
            </li>
          ))}
        </ol>
        <a href="/audit/flags.csv" className="mt-3 inline-block text-sm font-semibold underline hover:text-[#ee7454]">Download all {fmt(D.flags.length)} flags (CSV)</a>
      </details>

      {/* what we deliberately do not flag */}
      {nf && (
        <div className={`${CARD} mt-8 p-5`}>
          <div className={`${B} text-[20px] font-extrabold tracking-[-.025em]`}>What we deliberately do not flag</div>
          <ul className="mt-2 space-y-1.5 text-[15px]">
            <li><b>{fmt(nf.normal_price_band)} jobs</b> billed within 30% of the normal price: that&apos;s normal.</li>
            <li><b>{fmt(nf.missed_deadlines)} missed deadlines</b>: rain, flood-prone wards and too few crews explain much of it, so speed is judged against what&apos;s expected on <Link className="underline" href="/contractors">Contractors</Link>, not flagged here.</li>
            <li><b>{fmt(nf.failed_fixes)} fixes that failed within 30 days</b>: a quality question, also judged fairly on Contractors.</li>
            <li><b>Contractors working outside their listed wards</b>: true for about 80% of every contractor&apos;s jobs, with no difference in quality, so it is a data note, not a red flag.</li>
          </ul>
        </div>
      )}
    </>
  );
}
