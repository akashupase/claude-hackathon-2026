"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GeoJSON as LGeoJSON, Path } from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Ward } from "./data";

type Outlines = GeoJSON.FeatureCollection<GeoJSON.Polygon, { ward_code: string }>;

type RoadProps = {
  road_id: string;
  road_name: string;
  ward_code: string;
  road_type: string;
  surface: string;
};
type Roads = GeoJSON.FeatureCollection<GeoJSON.LineString, RoadProps>;

// Line weight by road type, widest first (also drives the legend).
const ROAD_WEIGHTS: [string, number][] = [
  ["Highway", 5],
  ["Arterial", 3.5],
  ["Main", 2.5],
  ["Local", 1.5],
];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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
  roads,
  // Optional controlled-selection props — omit them and the map owns its own
  // selection state exactly as before.
  selectedCode,
  onWardSelect,
  drawerFooter,
}: {
  wards: Ward[];
  outlines: unknown;
  roads: unknown;
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

  // Roads layer: built once Leaflet has loaded; the toggle adds or removes it.
  // showRoadsRef covers a click that lands before that.
  const [showRoads, setShowRoads] = useState(false);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const roadLayer = useRef<LGeoJSON | null>(null);
  const showRoadsRef = useRef(false);

  // "My location": the Leaflet module (loaded client-side), and the marker group
  // for the user's position so it can be replaced on each lookup.
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const userLayer = useRef<import("leaflet").LayerGroup | null>(null);
  const [locStatus, setLocStatus] = useState<
    "idle" | "locating" | "ok" | "denied" | "unavailable" | "unsupported"
  >("idle");
  const [coords, setCoords] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
  } | null>(null);

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

  // Asks for the browser's location permission (the browser shows the prompt on
  // this click), then centres on the position, drops a marker, and opens the
  // ward the point falls in. Ward polygons are a Voronoi approximation around
  // the ward centroids, so the nearest centroid IS the ward you fall under.
  function locateMe() {
    if (!navigator.geolocation) {
      setLocStatus("unsupported");
      return;
    }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const map = mapRef.current;
        const L = leafletRef.current;
        if (map && L) {
          if (!userLayer.current) {
            userLayer.current = L.layerGroup().addTo(map);
          }
          userLayer.current.clearLayers();
          L.circle([lat, lng], {
            radius: accuracy,
            color: CORAL,
            weight: 1,
            fillColor: CORAL,
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(userLayer.current);
          L.circleMarker([lat, lng], {
            radius: 7,
            color: "#ffffff",
            weight: 3,
            fillColor: CORAL,
            fillOpacity: 1,
            interactive: false,
          }).addTo(userLayer.current);
          map.flyTo([lat, lng], 14, { duration: 1.2 });
        }
        // Which ward does this point fall under? Nearest centroid wins.
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
        select(best ?? null);
        setCoords({ lat, lng, accuracy });
        setLocStatus("ok");
      },
      (err) => {
        setLocStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  useEffect(() => {
    showRoadsRef.current = showRoads;
    const map = mapRef.current;
    const layer = roadLayer.current;
    if (!map || !layer) return;
    if (showRoads) layer.addTo(map);
    else layer.remove();
  }, [showRoads]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    let resizeObs: ResizeObserver | undefined;

    // Leaflet reads `window` on import, so load it only in the browser.
    import("leaflet").then((L) => {
      if (cancelled) return;

      leafletRef.current = L;
      const byCode = new Map(wards.map((w) => [w.ward_code, w]));
      const theMap = L.map(el, { scrollWheelZoom: true, zoomSnap: 0.25 }).setView([19.07, 72.88], 11);
      map = theMap;

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Tiles &copy; Esri" },
      ).addTo(theMap);

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
      }).addTo(theMap);

      restyleAll.current = () =>
        polys.forEach((poly, code) => poly.setStyle(styleFor(code)));
      restyleAll.current();

      map.fitBounds(layer.getBounds(), { paddingTopLeft: [16, 60], paddingBottomRight: [16, 16] });

      // The flex layout can settle after init: re-fit while nothing is selected.
      const cityBounds = layer.getBounds();
      resizeObs = new ResizeObserver(() => {
        theMap.invalidateSize();
        if (!activeCode.current) theMap.fitBounds(cityBounds, { paddingTopLeft: [16, 60], paddingBottomRight: [16, 16] });
      });
      resizeObs.observe(el);

      // Roads sit in their own pane above the ward fills.
      theMap.createPane("roads").style.zIndex = "450";
      const weights = new Map(ROAD_WEIGHTS);
      roadLayer.current = L.geoJSON(roads as Roads, {
        pane: "roads",
        style: (f) => ({
          color: INK,
          weight: weights.get(f?.properties.road_type ?? "") ?? 1.5,
          opacity: 0.8,
          lineCap: "round",
        }),
        onEachFeature: (f, layerItem) => {
          const p = f.properties;
          const line = layerItem as Path;
          line.bindPopup(
            `<strong>${esc(p.road_name)}</strong><br>${esc(p.road_type)} · ${esc(p.surface)}<br>Ward ${esc(p.ward_code)} · ${esc(p.road_id)}`,
          );
          line.on({
            mouseover: () => line.setStyle({ color: CORAL, opacity: 1 }),
            mouseout: () => roadLayer.current?.resetStyle(line),
          });
        },
      });
      mapRef.current = theMap;
      if (showRoadsRef.current) roadLayer.current.addTo(theMap);
    });

    return () => {
      cancelled = true;
      restyleAll.current = null;
      roadLayer.current = null;
      mapRef.current = null;
      leafletRef.current = null;
      userLayer.current = null;
      resizeObs?.disconnect();
      map?.remove();
    };
  }, [wards, outlines, roads, select]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
      <div className="absolute left-14 top-3 z-[1000] flex flex-col items-start gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={showRoads}
          onClick={() => setShowRoads((v) => !v)}
          className="flex h-10 items-center gap-3 rounded-full bg-white py-1 pl-2 pr-4 font-[family-name:var(--font-bricolage)] text-sm font-semibold uppercase tracking-[.08em] text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.14),0_10px_24px_-12px_rgba(0,0,0,.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
        >
          <span
            aria-hidden="true"
            className={
              "relative h-6 w-11 flex-none rounded-full transition-colors duration-200 " +
              (showRoads ? "bg-[#ee7454]" : "bg-[rgba(43,48,51,.22)]")
            }
          >
            <span
              className={
                "absolute top-[3px] size-[18px] rounded-full bg-white shadow transition-[left] duration-200 " +
                (showRoads ? "left-[23px]" : "left-[3px]")
              }
            />
          </span>
          Show roads
        </button>
        <button
          type="button"
          onClick={locateMe}
          disabled={locStatus === "locating"}
          aria-label="My location"
          className="flex h-10 items-center gap-2 rounded-full bg-white px-4 font-[family-name:var(--font-bricolage)] text-sm font-semibold uppercase tracking-[.08em] text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.14),0_10px_24px_-12px_rgba(0,0,0,.35)] transition-colors hover:text-[#ee7454] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
        >
          <svg viewBox="0 0 20 20" className="size-4 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="10" cy="10" r="3.2" />
            <path d="M10 1.8v3M10 15.2v3M1.8 10h3M15.2 10h3" />
          </svg>
          {locStatus === "locating" ? "Locating…" : "My location"}
        </button>
        </div>
        {locStatus !== "idle" && (
          <p
            role="status"
            className="max-w-xs rounded-xl bg-white px-3 py-2 text-sm text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14),0_10px_24px_-12px_rgba(0,0,0,.35)]"
          >
            {locStatus === "ok" && coords ? (
              <>
                <span className="font-medium text-[#2b3033]">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
                <span className="block text-xs">
                  Accuracy about {Math.round(coords.accuracy)} m — your ward is highlighted.
                </span>
              </>
            ) : locStatus === "locating" ? (
              "Waiting for your permission…"
            ) : locStatus === "denied" ? (
              "Location is blocked. Allow it for this site in your browser settings, then try again."
            ) : locStatus === "unsupported" ? (
              "This browser can't share its location."
            ) : (
              "Couldn't get your location. Try again."
            )}
          </p>
        )}
        {showRoads && (
          <ul className="rounded-xl bg-white px-3 py-2 text-sm text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14),0_10px_24px_-12px_rgba(0,0,0,.35)]">
            {ROAD_WEIGHTS.map(([type, weight]) => (
              <li key={type} className="flex items-center gap-2 py-0.5">
                <span
                  className="w-6 rounded-full bg-[#2b3033]"
                  style={{ height: weight }}
                  aria-hidden="true"
                />
                {type}
              </li>
            ))}
          </ul>
        )}
      </div>
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
