"use client";

import { useState } from "react";

// Small dependency-free chart pieces for the /audit page. One series each, so
// a single brand hue carries the data and labels stay in text ink.

const BAR = "#ee7454";
const BAR_DIM = "#f6c3b3";
const INK_2 = "#4a4f52";
const GRID = "rgba(43,48,51,.10)";

export type Datum = {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  detail?: string;
};

// Horizontal bars with direct value labels — for a handful of categories.
export function HBars({
  data,
  onSelect,
  selected,
}: {
  data: Datum[];
  onSelect?: (key: string) => void;
  selected?: string | null;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ul className="space-y-2.5">
      {data.map((d) => {
        const dim = selected != null && selected !== d.key;
        const Tag = onSelect ? "button" : "div";
        return (
          <li key={d.key} className="relative">
            <Tag
              {...(onSelect ? { type: "button" as const, onClick: () => onSelect(d.key), "aria-pressed": selected === d.key } : {})}
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(d.key)}
              onBlur={() => setHover(null)}
              className={`group block w-full rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] ${onSelect ? "cursor-pointer" : ""}`}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px] leading-tight">
                <span className="truncate font-[family-name:var(--font-bricolage)] font-semibold">{d.label}</span>
                <span className="flex-none font-[family-name:var(--font-bricolage)] text-[16px] font-extrabold tabular-nums tracking-[-.02em]">{d.valueLabel}</span>
              </div>
              <div className="h-2.5 w-full rounded-[4px]" style={{ background: GRID }}>
                <div
                  className="h-full rounded-[4px] transition-[width,background-color] duration-500"
                  style={{ width: `${(d.value / max) * 100}%`, background: dim ? BAR_DIM : BAR }}
                />
              </div>
            </Tag>
            {hover === d.key && d.detail && <Tip className="right-0 top-full mt-1">{d.detail}</Tip>}
          </li>
        );
      })}
    </ul>
  );
}

// Vertical columns with a recessive grid, hover tooltip and optional click.
export function Columns({
  data,
  height = 180,
  onSelect,
  selected,
  axisFormat,
}: {
  data: Datum[];
  height?: number;
  onSelect?: (key: string) => void;
  selected?: string | null;
  axisFormat: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const rawMax = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(rawMax);
  const max = ticks[ticks.length - 1];
  const h = data[hover ?? -1];

  return (
    <div className="flex gap-2">
      {/* y-axis labels */}
      <div className="relative flex-none text-right text-[11px] tabular-nums" style={{ height, width: 44, color: INK_2 }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t / max) * 100}%` }}>
            {axisFormat(t)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px" style={{ top: `${(1 - t / max) * 100}%`, background: GRID }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {data.map((d, i) => {
              const dim = selected != null && selected !== d.key;
              const Tag = onSelect ? "button" : "div";
              return (
                <Tag
                  key={d.key}
                  {...(onSelect
                    ? { type: "button" as const, onClick: () => onSelect(d.key), "aria-pressed": selected === d.key, "aria-label": `${d.label}: ${d.valueLabel}` }
                    : {})}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className={`flex h-full min-w-0 flex-1 items-end focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ee7454] ${onSelect ? "cursor-pointer" : ""}`}
                >
                  <div
                    className="mx-auto w-full max-w-[34px] rounded-t-[4px] transition-[height,background-color] duration-500"
                    style={{
                      height: `${Math.max(1, (d.value / max) * 100)}%`,
                      background: dim ? BAR_DIM : BAR,
                      opacity: hover != null && hover !== i ? 0.75 : 1,
                    }}
                  />
                </Tag>
              );
            })}
          </div>
          {h && (
            <Tip
              className="-translate-x-1/2"
              style={{
                left: `${((hover! + 0.5) / data.length) * 100}%`,
                bottom: `${Math.min(88, (h.value / max) * 100) + 4}%`,
              }}
            >
              <b className="font-[family-name:var(--font-bricolage)]">{h.label}</b> · {h.valueLabel}
              {h.detail && <span className="block opacity-80">{h.detail}</span>}
            </Tip>
          )}
        </div>
        <div className="mt-1.5 flex gap-[2px]">
          {data.map((d, i) => (
            <span
              key={d.key}
              className="min-w-0 flex-1 truncate text-center text-[11px] tabular-nums"
              style={{ color: selected === d.key || hover === i ? "#2b3033" : INK_2, fontWeight: selected === d.key ? 600 : 400 }}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// One proportion bar: part of a whole, labelled on both sides.
export function ShareBar({ part, whole, partLabel, restLabel }: { part: number; whole: number; partLabel: string; restLabel: string }) {
  const p = whole > 0 ? Math.min(100, (part / whole) * 100) : 0;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px]">
        <div className="h-full rounded-l-[4px]" style={{ width: `${p}%`, background: BAR }} />
        <div className="h-full flex-1 rounded-r-[4px]" style={{ background: "rgba(43,48,51,.14)" }} />
      </div>
      <div className="mt-1.5 flex justify-between gap-3 text-[13px]" style={{ color: INK_2 }}>
        <span>
          <span className="mr-1.5 inline-block size-2.5 rounded-[2px] align-middle" style={{ background: BAR }} />
          {partLabel}
        </span>
        <span>
          <span className="mr-1.5 inline-block size-2.5 rounded-[2px] align-middle" style={{ background: "rgba(43,48,51,.14)" }} />
          {restLabel}
        </span>
      </div>
    </div>
  );
}

function Tip({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-[#2b3033] px-2.5 py-1.5 text-[12.5px] leading-snug text-white shadow-[0_8px_20px_-8px_rgba(0,0,0,.5)] ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

function niceTicks(max: number): number[] {
  const step0 = max / 4;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const out: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}
