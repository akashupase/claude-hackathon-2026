"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Path } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Ward } from "./data";

type Outlines = GeoJSON.FeatureCollection<GeoJSON.Polygon, { ward_code: string }>;

const inr = new Intl.NumberFormat("en-IN");

// Palette shared with the landing hero.
const INK = "#2b3033";
const CORAL = "#ee7454";

const BASE = { color: INK, weight: 1.25, opacity: 0.55, fillColor: CORAL, fillOpacity: 0.07 };
const HOVER = { color: CORAL, weight: 2.5, opacity: 1, fillOpacity: 0.26 };
const SELECTED = { color: CORAL, weight: 3, opacity: 1, fillOpacity: 0.34 };

export default function WardMap({
  wards,
  outlines,
  // Optional controlled-selection props — omit them and the map owns its own
  // selection state exactly as before.
  selectedCode,
  onWardSelect,
  drawerFooter,
}: {
  wards: Ward[];
  outlines: unknown;
  selectedCode?: string | null;
  onWardSelect?: (wardCode: string | null) => void;
  drawerFooter?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isControlled = selectedCode !== undefined;
  const [internalSelected, setInternalSelected] = useState<Ward | null>(null);
  // Lets the (long-lived) Leaflet handlers read the current selection.
  const activeCode = useRef<string | null>(null);
  const restyleAll = useRef<(() => void) | null>(null);

  const wardByCode = useMemo(
    () => new Map(wards.map((w) => [w.ward_code, w])),
    [wards],
  );
  const selected = isControlled
    ? selectedCode
      ? wardByCode.get(selectedCode) ?? null
      : null
    : internalSelected;

  const select = useCallback(
    (ward: Ward | null) => {
      if (!isControlled) setInternalSelected(ward);
      onWardSelect?.(ward ? ward.ward_code : null);
    },
    [isControlled, onWardSelect],
  );

  useEffect(() => {
    activeCode.current = selected?.ward_code ?? null;
    restyleAll.current?.();
  }, [selected]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: import("leaflet").Map | undefined;
    let cancelled = false;

    // Leaflet reads `window` on import, so load it only in the browser.
    import("leaflet").then((L) => {
      if (cancelled) return;

      const byCode = new Map(wards.map((w) => [w.ward_code, w]));
      const theMap = L.map(el, { scrollWheelZoom: true }).setView([19.07, 72.88], 11);
      map = theMap;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Tiles &copy; Esri" },
      ).addTo(map);

      const polys = new Map<string, Path>();
      const styleFor = (code: string) =>
        activeCode.current === code ? SELECTED : BASE;

      const layer = L.geoJSON(outlines as Outlines, {
        style: BASE,
        onEachFeature: (feature, layerItem) => {
          const poly = layerItem as Path;
          const code: string = feature.properties.ward_code;
          const ward = byCode.get(code);
          polys.set(code, poly);
          poly.bindTooltip(
            `<strong>${code}</strong>${ward ? ` · ${ward.ward_name}` : ""}`,
            { sticky: true, className: "ward-tip" },
          );
          poly.on({
            mouseover: () => poly.setStyle(HOVER),
            mouseout: () => poly.setStyle(styleFor(code)),
            click: () => {
              if (ward) select(ward);
            },
          });
        },
      }).addTo(map);

      restyleAll.current = () =>
        polys.forEach((poly, code) => poly.setStyle(styleFor(code)));
      restyleAll.current();

      map.fitBounds(layer.getBounds(), { padding: [16, 16] });

      // ---- "Locate me": place the user, find their ward ----------------
      // Ward polygons are a Voronoi approximation around ward centroids, so
      // the nearest centroid IS the ward the point falls in.
      let userLayer: import("leaflet").LayerGroup | undefined;
      let locateBtn: HTMLButtonElement | undefined;
      let locateStatus: HTMLDivElement | undefined;
      const setLocateStatus = (text: string) => {
        if (!locateStatus) return;
        locateStatus.textContent = text;
        locateStatus.classList.toggle("show", text !== "");
      };

      const locateMe = () => {
        if (!navigator.geolocation) {
          setLocateStatus("Your browser can't share your location.");
          return;
        }
        if (locateBtn) {
          locateBtn.disabled = true;
          locateBtn.textContent = "Locating…";
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            let best = wards[0];
            let bestD = Number.POSITIVE_INFINITY;
            for (const w of wards) {
              const dLat = w.centroid_lat - lat;
              const dLon = (w.centroid_lon - lng) * Math.cos((lat * Math.PI) / 180);
              const d = dLat * dLat + dLon * dLon;
              if (d < bestD) {
                bestD = d;
                best = w;
              }
            }
            if (!userLayer) {
              userLayer = L.layerGroup().addTo(theMap);
            }
            userLayer.clearLayers();
            L.circle([lat, lng], {
              radius: Math.max(pos.coords.accuracy || 0, 60),
              color: "#ee7454",
              weight: 1,
              opacity: 0.5,
              fillColor: "#ee7454",
              fillOpacity: 0.12,
            }).addTo(userLayer);
            L.circleMarker([lat, lng], {
              radius: 7,
              color: "#ee7454",
              weight: 2.5,
              fillColor: "#fff",
              fillOpacity: 1,
            })
              .addTo(userLayer)
              .bindTooltip("You are here (approx.)");
            theMap.setView([lat, lng], 12);
            select(best);
            if (locateBtn) {
              locateBtn.disabled = false;
              locateBtn.textContent = "◎ Locate me";
            }
            setLocateStatus("");
          },
          (err) => {
            setLocateStatus(
              err.code === 1
                ? "Location permission denied — allow it in your browser, then try again."
                : "Couldn't get your location. Please try again.",
            );
            if (locateBtn) {
              locateBtn.disabled = false;
              locateBtn.textContent = "◎ Locate me";
            }
          },
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      };

      const LocateControl = L.Control.extend({
        options: { position: "topleft" },
        onAdd() {
          const div = L.DomUtil.create("div", "locate-me-ctl");
          const btn = L.DomUtil.create("button", "locate-btn", div);
          btn.type = "button";
          btn.textContent = "◎ Locate me";
          const status = L.DomUtil.create("div", "locate-msg", div);
          status.setAttribute("role", "status");
          status.setAttribute("aria-live", "polite");
          locateBtn = btn;
          locateStatus = status;
          L.DomEvent.on(btn, "click", (e) => {
            L.DomEvent.stop(e);
            locateMe();
          });
          return div;
        },
      });
      map.addControl(new LocateControl());
    });

    return () => {
      cancelled = true;
      restyleAll.current = null;
      map?.remove();
    };
  }, [wards, outlines, select]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      {selected && (
        <aside className="absolute inset-x-3 bottom-3 z-[1000] max-h-[55%] overflow-y-auto rounded-2xl bg-white p-5 text-[16px] leading-[1.5] text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-18px_rgba(0,0,0,.35)] sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-80">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="font-[family-name:var(--font-bricolage)] text-xs font-medium uppercase tracking-[.08em] text-[#ee7454]">
                Ward {selected.ward_code} · {selected.zone}
              </div>
              <h2 className="mt-1 font-[family-name:var(--font-bricolage)] text-xl font-semibold leading-[1.1] tracking-[-.02em]">
                {selected.ward_name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => select(null)}
              className="grid size-8 flex-none place-items-center rounded-full text-lg text-[#4a4f52] hover:bg-[rgba(43,48,51,.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t-2 border-dotted border-[rgba(43,48,51,.14)] pt-3">
            <Row label="Population (est.)" value={inr.format(selected.population_est)} />
            <Row label="Area" value={`${selected.approx_area_km2} km²`} />
            <Row label="Low-lying index" value={String(selected.low_lying_index)} />
            <Row label="Engineering crews" value={String(selected.engineering_crews)} />
            <Row
              label="Monsoon budget 2025"
              value={`₹${inr.format(selected.monsoon_repair_budget_inr_2025)}`}
            />
          </dl>
          <p className="mt-3 border-t-2 border-dotted border-[rgba(43,48,51,.14)] pt-3 text-[#4a4f52]">
            <span className="text-[#2b3033]">Localities: </span>
            {selected.localities.join(", ")}
          </p>
          <p className="mt-2 text-sm text-[#4a4f52]">
            {selected.assistant_commissioner_office}
          </p>
          {drawerFooter ? (
            <div className="mt-3 border-t-2 border-dotted border-[rgba(43,48,51,.14)] pt-3">
              {drawerFooter}
            </div>
          ) : null}
        </aside>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#4a4f52]">{label}</dt>
      <dd className="text-right font-[family-name:var(--font-bricolage)] font-medium tabular-nums text-[#ee7454]">
        {value}
      </dd>
    </>
  );
}
