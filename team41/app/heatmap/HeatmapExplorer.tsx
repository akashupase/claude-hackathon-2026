"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { HeatmapData } from "./data";
import { HEAT_STOPS } from "./heatLayer";

const HeatMap = dynamic(() => import("./HeatMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-[#efe7dd]" />,
});

const nf = new Intl.NumberFormat("en-IN");

// Layer picker + filters on the left, heat map on the right.
export default function HeatmapExplorer({ data, outlines }: { data: HeatmapData; outlines: unknown }) {
  const [layerKey, setLayerKey] = useState(data.layers[0]?.key ?? "");
  const [hiddenKinds, setHiddenKinds] = useState<Set<number>>(new Set());
  const [flagOnly, setFlagOnly] = useState(false);
  const [focus, setFocus] = useState<{ code: string; seq: number } | null>(null);

  const layer = data.layers.find((l) => l.key === layerKey) ?? data.layers[0];
  const per = layer?.perItem ?? 1;

  const pickLayer = (key: string) => {
    setLayerKey(key);
    setHiddenKinds(new Set());
    setFlagOnly(false);
  };

  const visible = useMemo(
    () =>
      layer
        ? layer.points.filter((p) => !hiddenKinds.has(p[3]) && (!flagOnly || p[5] === 1))
        : [],
    [layer, hiddenKinds, flagOnly],
  );
  const heatPoints = useMemo(() => visible.map((p) => ({ lat: p[0], lon: p[1], w: p[2] })), [visible]);

  const kindCounts = useMemo(() => {
    const c = new Array(layer?.kinds.length ?? 0).fill(0);
    for (const p of layer?.points ?? []) if (!flagOnly || p[5] === 1) c[p[3]] += 1;
    return c.map((n) => Math.round(n / per));
  }, [layer, flagOnly, per]);

  const byWard = useMemo(() => {
    const c = new Array(data.wards.length).fill(0);
    for (const p of visible) if (p[4] >= 0) c[p[4]] += 1;
    return c.map((n) => Math.round(n / per));
  }, [visible, data.wards.length, per]);

  const topWards = useMemo(
    () =>
      data.wards
        .map((w, i) => ({ ...w, n: byWard[i] }))
        .filter((w) => w.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 8),
    [data.wards, byWard],
  );
  const topMax = topWards[0]?.n || 1;
  const total = Math.round(visible.length / per);

  const wardIndex = useMemo(() => new Map(data.wards.map((w, i) => [w.code, i])), [data.wards]);
  const wardTip = useCallback(
    (code: string) => {
      const i = wardIndex.get(code);
      const w = i != null ? data.wards[i] : null;
      const n = i != null ? byWard[i] : 0;
      return `<strong>${code}</strong>${w ? ` · ${w.name}` : ""}<br/>${nf.format(n)} ${layer?.unit ?? ""}`;
    },
    [wardIndex, data.wards, byWard, layer],
  );

  if (!layer) return null;
  const gradient = `linear-gradient(90deg, ${HEAT_STOPS.slice(1).map(([o, c]) => `${c} ${o * 100}%`).join(", ")})`;

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-1 sm:px-[max(20px,6%)] lg:flex-row">
      {/* Controls */}
      <aside className="flex flex-none flex-col gap-4 lg:min-h-0 lg:w-[360px] lg:overflow-y-auto lg:pr-1">
        <div>
          <h1 className="text-[clamp(28px,3vw,40px)] font-extrabold leading-[1] tracking-[-.04em]">Heatmap</h1>
          <p className="mt-1.5 text-[14px] text-[#4a4f52]">Everything with a location, straight from the database.</p>
        </div>

        {/* Layer picker */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Data layer">
          {data.layers.map((l) => {
            const on = l.key === layer.key;
            return (
              <button
                key={l.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pickLayer(l.key)}
                className={`rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] ${
                  on
                    ? "bg-[#2b3033] text-white"
                    : "bg-white text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.14)] hover:bg-[#fdeae4]"
                }`}
              >
                <span className="block text-[13.5px] font-semibold leading-tight">
                  <span aria-hidden="true">{l.emoji}</span> {l.label}
                </span>
                <span className={`mt-0.5 block text-[12px] tabular-nums ${on ? "text-white/75" : "text-[#4a4f52]"}`}>
                  {nf.format(Math.round(l.points.length / (l.perItem ?? 1)))}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <section className="rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-bold tracking-[-.01em]">Showing</h2>
            <span className="text-[22px] font-extrabold tabular-nums tracking-[-.03em] text-[#ee7454]">
              {nf.format(total)} <span className="text-[13px] font-medium tracking-normal text-[#4a4f52]">{layer.unit}</span>
            </span>
          </div>
          {layer.kinds.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by type">
              {layer.kinds.map((k, i) => {
                const on = !hiddenKinds.has(i);
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setHiddenKinds((s) => {
                        const n = new Set(s);
                        if (n.has(i)) n.delete(i);
                        else n.add(i);
                        return n;
                      })
                    }
                    className={`rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] ${
                      on ? "bg-[#2b3033] text-white" : "bg-[#efe7dd] text-[#4a4f52] line-through decoration-1 hover:bg-[#fdeae4]"
                    }`}
                  >
                    {k} <span className="tabular-nums opacity-70">{nf.format(kindCounts[i])}</span>
                  </button>
                );
              })}
            </div>
          )}
          {layer.flagLabel && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-[13.5px]">
              <input
                type="checkbox"
                checked={flagOnly}
                onChange={(e) => setFlagOnly(e.target.checked)}
                className="size-4 accent-[#ee7454]"
              />
              {layer.flagLabel}
            </label>
          )}
          {layer.weightNote && <p className="mt-2 text-[12px] text-[#4a4f52]">Heat {layer.weightNote}.</p>}

          {/* Legend */}
          <div className="mt-4">
            <div className="h-2.5 w-full rounded-[4px]" style={{ background: gradient }} aria-hidden="true" />
            <div className="mt-1 flex justify-between text-[11.5px] text-[#4a4f52]">
              <span>Fewer</span>
              <span>More</span>
            </div>
          </div>
        </section>

        {/* Top wards */}
        <section className="rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
          <h2 className="text-[15px] font-bold tracking-[-.01em]">Top wards</h2>
          {topWards.length === 0 ? (
            <p className="mt-2 text-[13.5px] text-[#4a4f52]">Nothing under these filters.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {topWards.map((w) => (
                <li key={w.code}>
                  <button
                    type="button"
                    onClick={() => setFocus({ code: w.code, seq: Date.now() })}
                    className="group w-full rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
                    title={`Zoom to Ward ${w.code}`}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate">
                        <b className="font-semibold">{w.code}</b> <span className="text-[#4a4f52]">{w.name}</span>
                      </span>
                      <span className="flex-none font-bold tabular-nums">{nf.format(w.n)}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-[4px] bg-[rgba(43,48,51,.08)]">
                      <div
                        className="h-full rounded-[4px] bg-[#ee7454] transition-[width] duration-500 group-hover:bg-[#bf3d1c]"
                        style={{ width: `${(w.n / topMax) * 100}%` }}
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>

      {/* Map */}
      <div className="relative h-[62dvh] flex-none overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)] lg:h-auto lg:min-h-0 lg:flex-1">
        <HeatMap
          outlines={outlines}
          points={heatPoints}
          radius={layer.radius}
          wardTip={wardTip}
          focusWard={focus}
        />
      </div>
    </main>
  );
}
