import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import PageShell, { H1, LABEL, MUTED } from "@/components/page-shell";
import PlanBoard, { PlanWardMap } from "@/components/plan-board";
import { loadRoads, loadWardOutlines, loadWards } from "@/app/map/data";
import { inr, loadRupee, wardFromSlug, wardSlug } from "@/lib/rupee";

export const metadata = { title: "Next rupee · Follow the Rupee" };

const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(43,48,51,.12),0_18px_40px_-26px_rgba(0,0,0,.35)]";

async function Plan({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [sp, D, outlines, mapWards, roads] = await Promise.all([searchParams, loadRupee(), loadWardOutlines(), loadWards(), loadRoads()]);
  const wanted = wardFromSlug(String(sp.ward ?? "L"));
  const w = D.wards.find((x) => x.ward_code === wanted) ?? D.wards.find((x) => x.ward_code === "L")!;
  const p = w.next_rupee;

  // city view: who is short and who has money to spare
  const city = D.wards
    .map((x) => {
      const have = Math.max(x.next_rupee.budget_left_inr, 0) + x.next_rupee.recoverable_inr;
      return { code: x.ward_code, name: x.ward_name, have, need: x.next_rupee.plan_total_inr, gap: have - x.next_rupee.plan_total_inr, over: x.next_rupee.budget_left_inr < 0 };
    })
    .sort((a, b) => a.gap - b.gap);
  const pothole = D.summary.method_economics?.["Pothole"] ?? [];
  const water = D.summary.method_economics?.["Waterlogging"] ?? [];

  return (
    <>
      <h1 className={`${H1}`}>Where should the next rupee go?</h1>

      <div className="relative mt-5 h-[420px] overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]">
        <PlanWardMap wards={mapWards} outlines={outlines} roads={roads} selected={w.ward_code} />
      </div>
      <p className={`mt-2 text-sm ${MUTED}`}>Click a ward on the map.</p>

      <div className="mx-auto mt-8 max-w-[820px]">
        <div className={LABEL}>Ward {w.ward_code}</div>
        <h2 className={`${B} mt-1 mb-3 text-[clamp(24px,2.8vw,34px)] font-semibold leading-tight tracking-[-.02em] [overflow-wrap:anywhere]`}>{w.ward_name}</h2>
        <PlanBoard key={w.ward_code} ward={`Ward ${w.ward_code}`} items={p.items} left={p.budget_left_inr} recoverable={p.recoverable_inr} />

        <div className="mt-8 space-y-3">
          <details className={`${CARD} group`}>
            <summary className={`${B} cursor-pointer list-none font-semibold`}>Why these repair methods? <span className={`font-normal ${MUTED}`}>(cost per fix that lasts)</span></summary>
            <p className={`mt-2 text-sm ${MUTED}`}>Average cost ÷ share of jobs that did not fail within 30 days.</p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {[["Potholes", pothole], ["Waterlogging", water]].map(([label, rows]) => (
                <table key={label as string} className="w-full text-sm">
                  <caption className="pb-1 text-left text-sm font-semibold">{label as string}</caption>
                  <tbody>
                    {(rows as typeof pothole).map((r, k) => (
                      <tr key={r.method} className="border-t border-[rgba(43,48,51,.1)]">
                        <td className="py-1.5 pr-2">{k === 0 && "✓ "}{r.method}</td>
                        <td className={`whitespace-nowrap py-1.5 pr-2 text-right text-xs ${MUTED}`}>{r.fail_pct}% fail</td>
                        <td className={`${B} whitespace-nowrap py-1.5 text-right font-semibold tabular-nums ${k === 0 ? "text-[#15803d]" : ""}`}>{inr(r.cost_per_lasting_fix_inr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
            <p className={`mt-3 text-sm ${MUTED}`}>Cold mix is cheapest per lasting pothole fix, but fails more often. On ambulance, flood-prone and busy roads a failure costs more than money, so the plan uses the most durable method.</p>
          </details>

          <details className={CARD}>
            <summary className={`${B} cursor-pointer list-none font-semibold`}>Which wards are short? <span className={`font-normal ${MUTED}`}>({city.filter((c) => c.gap < 0).length} of 24)</span></summary>
            <ul className="mt-2">
              {city.slice(0, 5).map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-2 border-t border-[rgba(43,48,51,.1)] py-1.5 text-sm">
                  <Link href={`/plan?ward=${wardSlug(c.code)}`} scroll={false} className="min-w-0 truncate hover:text-[#ee7454]">{c.code} · {c.name}</Link>
                  <span className={`${B} flex-none font-semibold tabular-nums ${c.gap < 0 ? "text-[#c2410c]" : "text-[#15803d]"}`}>{c.gap < 0 ? `−${inr(-c.gap)}` : `+${inr(c.gap)}`}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-2 text-sm ${MUTED}`}>Most room: {city.slice(-3).reverse().map((c) => `${c.code} (+${inr(c.gap)})`).join(", ")}.</p>
          </details>
        </div>
      </div>
    </>
  );
}

export default function PlanPage(props: PageProps<"/plan">) {
  return (
    <PageShell>
      <Suspense fallback={<div className="h-40" />}>
        <Plan searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}
