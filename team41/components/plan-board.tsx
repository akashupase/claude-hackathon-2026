"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WardMap from "@/app/map/WardMap";
import type { Ward as MapWard } from "@/app/map/data";
import type { PlanItem } from "@/lib/rupee";

// Next rupee for one ward: money bar, budget slider (what-if) and the ranked list with a funding cut-off.

const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.12),0_18px_40px_-26px_rgba(0,0,0,.35)]";
const inr = (n: number) => (Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)} cr` : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)} lakh` : `₹${Math.round(n).toLocaleString("en-IN")}`);

function actionLabel(i: PlanItem) {
  if (i.act === "dlp") return { text: "Send back to original contractor (under warranty)", tone: "bg-[#e0f2fe] text-[#075985]", icon: "↩" };
  if (i.act === "resurface") return { text: `Patch now (${i.method.toLowerCase()}), then resurface: failed ${i.failed_before}× before`, tone: "bg-[#fef3c7] text-[#92400e]", icon: "▤" };
  return { text: `Fix with ${i.method.toLowerCase()}`, tone: "bg-[rgba(43,48,51,.07)] text-[#2b3033]", icon: "🛠" };
}

function reasons(i: PlanItem): { t: string; strong?: boolean }[] {
  const r: { t: string; strong?: boolean }[] = [];
  if (i.emergency) r.push({ t: "🚑 Ambulance road ×2", strong: true });
  if (i.accidents_pending) r.push({ t: `⚠ Accident while waiting ×1.5`, strong: true });
  r.push({ t: `${i.open_complaints} open complaint${i.open_complaints === 1 ? "" : "s"}` });
  if (i.flood_spot) r.push({ t: `🌊 ${i.flood_spot}${i.tide_no_pump ? " (tide, no pump)" : ""}` });
  if (i.failed_before) r.push({ t: `↺ Failed ${i.failed_before}×` });
  if (i.accidents) r.push({ t: `${i.accidents} road accident${i.accidents === 1 ? "" : "s"}` });
  if (i.school) r.push({ t: "🏫 School road" });
  if (i.hospital && !i.emergency) r.push({ t: "🏥 Hospital road" });
  if (i.congestion >= 7) r.push({ t: `🚦 Traffic ${Math.round(i.congestion)}/10` });
  return r;
}

export default function PlanBoard({ items, left, recoverable }: { items: PlanItem[]; left: number; recoverable: number }) {
  const planCost = items.reduce((s, i) => s + i.est_cost_inr, 0);
  const base = Math.max(left, 0);
  const max = Math.max(planCost, base + recoverable, 1);
  const [budget, setBudget] = useState(base + recoverable);

  // which items fit in the chosen budget, in priority order; ₹0 warranty items always count as funded
  let run = 0;
  const funded = items.map((i) => { if (!i.est_cost_inr) return true; run += i.est_cost_inr; return run <= budget; });
  const fundedCount = funded.filter(Boolean).length;
  const cutAt = funded.findIndex((f, k) => !f && items[k].est_cost_inr > 0);
  const spentInPlan = items.filter((_, k) => funded[k]).reduce((s, i) => s + i.est_cost_inr, 0);
  const gap = base + recoverable - planCost;
  const pctOf = (v: number) => `${Math.min(100, (100 * v) / max)}%`;

  return (
    <div className="space-y-5">
      {/* money bar */}
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className={`${B} text-lg font-semibold`}>Can this ward afford its plan?</div>
          <div className={`${B} text-lg font-semibold ${gap >= 0 ? "text-[#15803d]" : "text-[#c2410c]"}`}>
            {gap >= 0 ? `Yes, ${inr(gap)} spare` : `Short by ${inr(-gap)}`}
          </div>
        </div>
        <div className="relative mt-4 h-7 overflow-hidden rounded-full bg-[rgba(43,48,51,.08)]">
          <div className="absolute inset-y-0 left-0 bg-[#0ca30c]" style={{ width: pctOf(base) }} />
          <div className="absolute inset-y-0 border-l-2 border-white bg-[#2a78d6]" style={{ left: pctOf(base), width: pctOf(recoverable) }} />
          <div className="absolute inset-y-0 w-[3px] bg-[#2b3033]" style={{ left: `calc(${pctOf(planCost)} - 1.5px)` }} title="Plan cost" />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#0ca30c]" />Budget left <b>{inr(base)}</b>{left < 0 && <span className="text-[#c2410c]"> (already over by {inr(-left)})</span>}</span>
          <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#2a78d6]" />Recoverable from flagged jobs <b>{inr(recoverable)}</b></span>
          <span><i className="mr-1.5 inline-block h-2.5 w-[3px] bg-[#2b3033] align-middle" /> Plan cost <b>{inr(planCost)}</b></span>
        </div>
      </div>

      {/* slider */}
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="budget" className={`${B} text-lg font-semibold`}>What if the ward had…</label>
          <div className={`${B} text-2xl font-semibold tabular-nums`}>{inr(budget)}</div>
        </div>
        <input id="budget" type="range" min={0} max={max} step={Math.max(1000, Math.round(max / 200))} value={budget}
          onChange={(e) => setBudget(Number(e.target.value))} className="mt-3 w-full accent-[#ee7454]" />
        <div className="mt-1 flex flex-wrap gap-2 text-sm">
          <button onClick={() => setBudget(0)} className="rounded-full bg-[rgba(43,48,51,.07)] px-3 py-1 hover:text-[#ee7454]">₹0</button>
          <button onClick={() => setBudget(base)} className="rounded-full bg-[#dcfce7] px-3 py-1 text-[#166534]">Budget left</button>
          <button onClick={() => setBudget(base + recoverable)} className="rounded-full bg-[#e0f2fe] px-3 py-1 text-[#075985]">+ recovered money</button>
          <button onClick={() => setBudget(planCost)} className="rounded-full bg-[rgba(43,48,51,.07)] px-3 py-1 hover:text-[#ee7454]">Whole plan</button>
        </div>
        <p className={`${B} mt-3 text-[17px] font-semibold`}>
          Fixes {fundedCount} of {items.length} roads ({inr(spentInPlan)}){fundedCount < items.length ? `. ${items.length - fundedCount} wait for the next allocation.` : ". Everything on the list is covered."}
        </p>
      </div>

      {/* ranked list with the cut-off line */}
      <ol className="space-y-2.5">
        {items.map((i, k) => {
          const a = actionLabel(i);
          const ok = funded[k];
          return (
            <li key={i.road_id}>
              {k === cutAt && (
                <div className="my-3 flex items-center gap-3 text-sm font-semibold text-[#c2410c]">
                  <span className="h-[2px] flex-1 bg-[#c2410c]" /> Budget runs out here <span className="h-[2px] flex-1 bg-[#c2410c]" />
                </div>
              )}
              <div className={`${CARD} flex gap-4 p-4 ${ok ? "" : "opacity-55"}`}>
                <div className={`${B} grid size-10 flex-none place-items-center rounded-xl text-lg font-semibold ${ok ? "bg-[#ee7454] text-white" : "bg-[rgba(43,48,51,.1)]"}`}>{k + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/track?q=${encodeURIComponent(i.road.replace(/ \(seg \d+\)$/, ""))}`} className={`${B} min-w-0 font-semibold leading-tight hover:text-[#ee7454]`}>{i.road}</Link>
                    <span className={`${B} flex-none font-semibold tabular-nums`}>{i.est_cost_inr ? inr(i.est_cost_inr) : "₹0"}</span>
                  </div>
                  <div className={`mt-1.5 inline-block rounded-lg px-2.5 py-1 text-sm ${a.tone}`}>{a.icon} {a.text}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {reasons(i).map((r) => (
                      <span key={r.t} className={`rounded-full px-2.5 py-0.5 text-xs ${r.strong ? "bg-[#fde8e1] font-semibold text-[#9a3412]" : "bg-[rgba(43,48,51,.06)] text-[#4a4f52]"}`}>{r.t}</span>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(43,48,51,.08)]"><div className="h-full rounded-full bg-[#2b3033]" style={{ width: `${i.risk}%` }} /></div>
                    <span className="w-20 text-right text-xs text-[#4a4f52]">risk {Math.round(i.risk)}/100</span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {items.length === 0 && <div className={`${CARD} p-5 text-[#4a4f52]`}>No open, unfixed complaints mapped to roads in this ward.</div>}
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
