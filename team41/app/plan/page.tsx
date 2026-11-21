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
      <div className={LABEL}>Budget smarts</div>
      <h1 className={`${H1} mt-2`}>Where should the next rupee go?</h1>
      <p className={`mt-3 max-w-[46em] ${MUTED}`}>Roads with open problems, ranked by risk. Drag the budget to see what gets fixed.</p>

      <div className="relative mt-6 h-[460px] overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]">
        <PlanWardMap wards={mapWards} outlines={outlines} roads={roads} selected={w.ward_code} />
      </div>
      <p className={`mt-2 text-sm ${MUTED}`}>Click a ward on the map to see its plan.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <div className={LABEL}>Ward {w.ward_code} · {w.zone}</div>
          <h2 className={`${B} mt-1 mb-4 text-[clamp(24px,2.8vw,34px)] font-semibold leading-tight tracking-[-.02em] [overflow-wrap:anywhere]`}>{w.ward_name}</h2>
          <PlanBoard key={w.ward_code} items={p.items} left={p.budget_left_inr} recoverable={p.recoverable_inr} />
        </div>
        <aside className="space-y-5 self-start lg:sticky lg:top-4">
          <div className={CARD}>
            <div className={`${B} text-lg font-semibold`}>Which method is really cheaper?</div>
            <p className={`mt-1 text-sm ${MUTED}`}>Cost per fix that lasts 30 days = average cost ÷ share that didn&apos;t fail.</p>
            {[["Potholes", pothole], ["Waterlogging", water]].map(([label, rows]) => (
              <div key={label as string} className="mt-3">
                <div className="text-sm font-semibold">{label as string}</div>
                <table className="mt-1 w-full text-sm">
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
              </div>
            ))}
            <p className={`mt-3 text-xs ${MUTED}`}>Cold mix is cheapest per lasting pothole fix over 30 days, but fails more often; on ambulance, flood-prone and busy roads a failure costs more than money, so the plan uses the most durable method.</p>
          </div>

          <div className={CARD}>
            <div className={`${B} text-lg font-semibold`}>Short and spare, by ward</div>
            <p className={`mt-1 text-sm ${MUTED}`}>Budget left + recoverable money, against each ward&apos;s plan.</p>
            <ul className="mt-2">
              {city.slice(0, 6).map((c) => (
                <li key={c.code} className="flex items-center justify-between gap-2 border-t border-[rgba(43,48,51,.1)] py-1.5 text-sm">
                  <Link href={`/plan?ward=${wardSlug(c.code)}`} scroll={false} className="min-w-0 truncate hover:text-[#ee7454]">{c.code} · {c.name}</Link>
                  <span className={`${B} flex-none font-semibold tabular-nums ${c.gap < 0 ? "text-[#c2410c]" : "text-[#15803d]"}`}>{c.gap < 0 ? `−${inr(-c.gap)}` : `+${inr(c.gap)}`}</span>
                </li>
              ))}
            </ul>
            <p className={`mt-2 text-xs ${MUTED}`}>
              Most room: {city.slice(-3).reverse().map((c) => `${c.code} (+${inr(c.gap)})`).join(", ")}. Money recovered there could cover the wards above.
            </p>
          </div>
        </aside>
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
