"use client";

import { useMemo, useState } from "react";
import type { AuditFlag, AuditFlagsData } from "../map/audit";
import AuditFlagsPanel from "../map/AuditFlagsPanel";
import ClawbackNoticeModal from "../map/ClawbackNoticeModal";
import { FLAG_BADGES, FLAG_HELP, formatInrShort } from "../map/format";
import { Columns, HBars, ShareBar, type Datum } from "./charts";

const CARD =
  "rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]";
const H = "font-[family-name:var(--font-bricolage)] text-[20px] font-extrabold leading-tight tracking-[-.025em]";
const SUB = "mt-1 mb-5 text-[14px] text-[#4a4f52]";
const NUM = "font-[family-name:var(--font-bricolage)] font-extrabold tabular-nums tracking-[-.03em]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (n: string) => n.replace(" (synthetic)", "");
const axisCr = (v: number) => (v === 0 ? "0" : v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : `${Math.round(v / 1e5)}L`);

// Visual-first view of recoverable ("wasted") repair money. Audit simulation
// on synthetic data — numbers come from scripts/build_audit_data.py.
export default function WastedMoney({ audit }: { audit: AuditFlagsData }) {
  const { summary, flags } = audit;
  const [ward, setWard] = useState<string | null>(null);
  const [notice, setNotice] = useState<AuditFlag | null>(null);

  const scoped = useMemo(() => (ward ? flags.filter((f) => f.ward_code === ward) : flags), [flags, ward]);

  const reasons: Datum[] = useMemo(
    () =>
      (["DLP_VIOLATION", "OVERBILLED", "DOUBLE_BILLED"] as const).map((r) => {
        const hit = scoped.filter((f) => f.flag_reasons.includes(r));
        const v = hit.reduce((s, f) => s + f.recoverable_inr, 0);
        return {
          key: r,
          label: FLAG_BADGES[r].label,
          value: v,
          valueLabel: formatInrShort(v),
          detail: `${hit.length} bills · ${FLAG_HELP[r].split(",")[0]}`,
        };
      }),
    [scoped],
  );

  const wards: Datum[] = useMemo(
    () =>
      Object.entries(summary.by_ward)
        .sort((a, b) => b[1].total_recoverable_inr - a[1].total_recoverable_inr)
        .map(([code, w]) => ({
          key: code,
          label: code,
          value: w.total_recoverable_inr,
          valueLabel: formatInrShort(w.total_recoverable_inr),
          detail: `${w.flagged_orders} suspicious bills`,
        })),
    [summary],
  );

  const months: Datum[] = useMemo(() => {
    const m = new Map<string, { v: number; n: number }>();
    for (const f of scoped) {
      const k = f.assigned_at?.slice(0, 7);
      if (!k) continue;
      const cur = m.get(k) ?? { v: 0, n: 0 };
      cur.v += f.recoverable_inr;
      cur.n += 1;
      m.set(k, cur);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, { v, n }]) => ({
        key: k,
        label: MONTHS[Number(k.slice(5, 7)) - 1] ?? k,
        value: v,
        valueLabel: formatInrShort(v),
        detail: `${n} bills · ${k.slice(0, 4)}`,
      }));
  }, [scoped]);

  const contractors: Datum[] = useMemo(() => {
    const m = new Map<string, { name: string; v: number; n: number }>();
    for (const f of scoped) {
      const cur = m.get(f.contractor_id) ?? { name: short(f.contractor_name), v: 0, n: 0 };
      cur.v += f.recoverable_inr;
      cur.n += 1;
      m.set(f.contractor_id, cur);
    }
    return [...m.entries()]
      .sort((a, b) => b[1].v - a[1].v)
      .slice(0, 6)
      .map(([id, c]) => ({ key: id, label: c.name, value: c.v, valueLabel: formatInrShort(c.v), detail: `${c.n} suspicious bills` }));
  }, [scoped]);

  const total = summary.citywide_total_recoverable_inr;
  const share = summary.total_spend_inr > 0 ? (total / summary.total_spend_inr) * 100 : 0;
  const scopeLabel = ward ? `Ward ${ward}` : "all wards";

  return (
    <>
      {/* Hero */}
      <p className="font-[family-name:var(--font-bricolage)] text-[13px] font-bold uppercase tracking-[.14em] text-[#ee7454]">
        Wasted money · audit simulation
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-bricolage)] text-[clamp(40px,7vw,92px)] font-extrabold leading-[.92] tracking-[-.05em]">
        <span className="text-[#ee7454]">{formatInrShort(total)}</span>
        <span className="block text-[.55em] tracking-[-.04em]">can be recovered.</span>
      </h1>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Tile value={wards[0] ? `Ward ${wards[0].key}` : "—"} label={wards[0] ? `biggest leak · ${wards[0].valueLabel}` : "biggest leak"} accent />
        <Tile value={`${summary.flagged_orders} / ${summary.total_work_orders.toLocaleString("en-IN")}`} label="repair bills flagged" />
        <Tile value={`${share.toFixed(0)}%`} label="of all repair spend" />
      </div>
      <div className={`${CARD} mt-3`}>
        <ShareBar
          part={total}
          whole={summary.total_spend_inr}
          partLabel={`Recoverable ${formatInrShort(total)}`}
          restLabel={`Total spend ${formatInrShort(summary.total_spend_inr)}`}
        />
      </div>

      {/* Where */}
      <section className={`${CARD} mt-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={H}>Where · by ward</h2>
          {ward && (
            <button
              type="button"
              onClick={() => setWard(null)}
              className="rounded-full bg-[#2b3033] px-3 py-1 text-[12.5px] font-medium text-white hover:bg-[#ee7454]"
            >
              Ward {ward} ✕
            </button>
          )}
        </div>
        <p className={SUB}>Tap a ward to filter the whole page.</p>
        <Columns
          data={wards}
          height={200}
          axisFormat={axisCr}
          selected={ward}
          onSelect={(k) => setWard((w) => (w === k ? null : k))}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Why */}
        <section className={CARD}>
          <h2 className={H}>Why · {scopeLabel}</h2>
          <p className={SUB}>A bill can break more than one rule.</p>
          <HBars data={reasons} />
        </section>

        {/* When */}
        <section className={CARD}>
          <h2 className={H}>When · {scopeLabel}</h2>
          <p className={SUB}>By month the work was ordered.</p>
          {months.length ? <Columns data={months} height={150} axisFormat={axisCr} /> : <Empty />}
        </section>
      </div>

      {/* Who */}
      <section className={`${CARD} mt-6`}>
        <h2 className={H}>Who · top contractors, {scopeLabel}</h2>
        <p className={SUB}>Recoverable money on their bills.</p>
        {contractors.length ? <HBars data={contractors} /> : <Empty />}
      </section>

      {/* The bills */}
      <section className="mt-6">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-bricolage)] text-[clamp(26px,3vw,38px)] font-extrabold tracking-[-.035em]">
            The bills
          </h2>
        </div>
        <div className="flex h-[70dvh] min-h-[420px] flex-col rounded-2xl bg-[#faf3eb]">
          <AuditFlagsPanel audit={audit} wardCode={ward} onOpenNotice={setNotice} />
        </div>
      </section>

      {notice && <ClawbackNoticeModal flag={notice} onClose={() => setNotice(null)} />}
    </>
  );
}

function Tile({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/70 p-4 shadow-[0_0_0_1px_rgba(43,48,51,.10)]">
      <div className={`${NUM} text-[clamp(28px,3.2vw,40px)] leading-none ${accent ? "text-[#ee7454]" : "text-[#2b3033]"}`}>{value}</div>
      <div className="mt-2 font-[family-name:var(--font-bricolage)] text-[14px] font-medium uppercase tracking-[.06em] text-[#4a4f52]">{label}</div>
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-center text-[14px] text-[#4a4f52]">No suspicious bills here.</p>;
}
