"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WardMap from "@/app/map/WardMap";
import type { Ward as MapWard } from "@/app/map/data";
import type { PlanItem } from "@/lib/rupee";

// Next rupee for one ward: one answer, one money + budget card, the top 3 roads (rest on demand).

const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.12),0_18px_40px_-26px_rgba(0,0,0,.35)]";
const inr = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)} lakh` : `₹${Math.round(n).toLocaleString("en-IN")}`);

function action(i: PlanItem) {
  if (i.act === "dlp") return "Send back to the original contractor: still under warranty, ₹0";
  if (i.act === "resurface") return `Patch now, then resurface: fixed ${i.failed_before}× before and it kept failing`;
  return `Fix with ${i.method.toLowerCase()}`;
}

// The one or two reasons that matter most, in plain words.
function why(i: PlanItem): string {
  const r: string[] = [];
  if (i.emergency) r.push("ambulance route to an emergency hospital");
  if (i.accidents_pending) r.push("an accident happened while the complaint waited");
  if (r.length < 2 && i.flood_spot) r.push(`next to the ${i.flood_spot} flood spot`);
  if (r.length < 2 && i.failed_before >= 3) r.push(`failed ${i.failed_before}× before`);
  if (r.length < 2 && i.school) r.push("main road to a school");
  if (r.length < 2) r.push(`${i.open_complaints} open complaint${i.open_complaints === 1 ? "" : "s"}`);
  return r.slice(0, 2).join(" · ");
}

export default function PlanBoard({ ward, items, left, recoverable }: { ward: string; items: PlanItem[]; left: number; recoverable: number }) {
  const planCost = items.reduce((s, i) => s + i.est_cost_inr, 0);
  const base = Math.max(left, 0);
  const max = Math.max(planCost, base + recoverable, 1);
  const [budget, setBudget] = useState(base + recoverable);
  const [all, setAll] = useState(false);

  // which items fit in the chosen budget, in priority order; ₹0 warranty items always count as funded
  const { funded } = items.reduce(
    (acc, i) => {
      if (!i.est_cost_inr) { acc.funded.push(true); return acc; }
      acc.run += i.est_cost_inr;
      acc.funded.push(acc.run <= budget);
      return acc;
    },
    { run: 0, funded: [] as boolean[] },
  );
  const fundedCount = funded.filter(Boolean).length;
  const cutAt = funded.findIndex((f, k) => !f && items[k].est_cost_inr > 0);
  const gap = base + recoverable - planCost;
  const pctOf = (v: number) => `${Math.min(100, (100 * v) / max)}%`;
  const shown = all ? items : items.slice(0, 3);

  const answer = !items.length
    ? `${ward} has no open, unfixed road problems mapped right now.`
    : gap >= 0
      ? `${ward} can fix all ${items.length} risky roads (${inr(planCost)}) and still have ${inr(gap)} spare.`
      : `${ward} is ${inr(-gap)} short of fixing its ${items.length} risky roads.`;

  return (
    <div className="space-y-5">
      <p className={`${B} text-[clamp(20px,2.2vw,26px)] font-semibold leading-snug`}>{answer}</p>

      {/* money + what-if, one card */}
      <div className={`${CARD} p-5`}>
        <div className="relative h-5 overflow-hidden rounded-full bg-[rgba(43,48,51,.08)]">
          <div className="absolute inset-y-0 left-0 bg-[#0ca30c]" style={{ width: pctOf(base) }} />
          <div className="absolute inset-y-0 border-l-2 border-white bg-[#2a78d6]" style={{ left: pctOf(base), width: pctOf(recoverable) }} />
          <div className="absolute inset-y-0 w-[3px] bg-[#2b3033]" style={{ left: `calc(${pctOf(planCost)} - 1.5px)` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-[#4a4f52]">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#0ca30c]" />Budget left {inr(base)}</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#2a78d6]" />Recoverable from flagged bills {inr(recoverable)}</span>
          <span><i className="mr-1.5 inline-block h-2.5 w-[3px] bg-[#2b3033] align-middle" /> Plan {inr(planCost)}</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label htmlFor="budget" className="text-sm font-semibold">Try a budget</label>
          <input id="budget" type="range" min={0} max={max} step={Math.max(1000, Math.round(max / 200))} value={budget}
            onChange={(e) => setBudget(Number(e.target.value))} className="min-w-[160px] flex-1 accent-[#ee7454]" />
          <span className={`${B} w-28 text-right text-lg font-semibold tabular-nums`}>{inr(budget)}</span>
        </div>
        <p className="mt-1 text-[15px]">
          Fixes <b>{fundedCount} of {items.length}</b> roads{fundedCount < items.length ? `; ${items.length - fundedCount} wait for the next allocation.` : "."}
        </p>
      </div>

      {/* the roads */}
      <ol className="space-y-2.5">
        {shown.map((i, k) => (
          <li key={i.road_id}>
            {all && k === cutAt && (
              <div className="my-2 flex items-center gap-3 text-sm font-semibold text-[#c2410c]"><span className="h-[2px] flex-1 bg-[#c2410c]" />Budget runs out here<span className="h-[2px] flex-1 bg-[#c2410c]" /></div>
            )}
            <div className={`${CARD} flex items-start gap-4 p-4 ${funded[k] ? "" : "opacity-55"}`}>
              <span className={`${B} grid size-9 flex-none place-items-center rounded-xl font-semibold ${funded[k] ? "bg-[#ee7454] text-white" : "bg-[rgba(43,48,51,.1)]"}`}>{k + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/track?q=${encodeURIComponent(i.road.replace(/ \(seg \d+\)$/, ""))}`} className={`${B} min-w-0 font-semibold leading-tight hover:text-[#ee7454]`}>{i.road}</Link>
                  <span className={`${B} flex-none font-semibold tabular-nums`}>{i.est_cost_inr ? inr(i.est_cost_inr) : "₹0"}</span>
                </div>
                <div className="mt-0.5 text-[15px]">{action(i)}</div>
                <div className="mt-0.5 text-sm text-[#4a4f52]">Why first: {why(i)}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {items.length > 3 && (
        <button onClick={() => setAll(!all)} className={`${B} rounded-full px-4 py-2 font-semibold shadow-[0_0_0_1px_rgba(43,48,51,.2)] hover:text-[#ee7454]`}>
          {all ? "Show top 3" : `Show all ${items.length} roads`}
        </button>
      )}
    </div>
  );
}

// The team's ward map (app/map/WardMap), used as-is: clicking a ward opens that ward's plan.
export function PlanWardMap({ wards, outlines, roads, selected }: { wards: MapWard[]; outlines: unknown; roads: unknown; selected: string }) {
  const router = useRouter();
  return (
    <WardMap
      wards={wards}
      outlines={outlines}
      roads={roads}
      selectedCode={selected}
      onWardSelect={(code) => { if (code) router.push(`/plan?ward=${code.replace("/", "-")}`, { scroll: false }); }}
      drawerFooter={<p className="mt-3 text-sm text-[#4a4f52]">This ward&apos;s plan is below the map.</p>}
    />
  );
}
