"use client";

import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { createHeatLayer, type HeatInput, type HeatLayerApi } from "./heatLayer";

type Outlines = GeoJSON.FeatureCollection<GeoJSON.Geometry, { ward_code: string }>;

const OUTLINE = { color: "#2b3033", weight: 1, opacity: 0.35, fillOpacity: 0 };
const OUTLINE_HOVER = { color: "#2b3033", weight: 2, opacity: 0.8, fillColor: "#2b3033", fillOpacity: 0.04 };
const OUTLINE_FOCUS = { color: "#ee7454", weight: 2.5, opacity: 1, fillOpacity: 0 };

// Leaflet map: grey basemap, ward outlines (hover = ward name + count for the
// active layer), and one canvas heat layer.
export default function HeatMap({
  outlines,
  points,
  radius,
  wardTip,
  focusWard,
}: {
  outlines: unknown;
  points: HeatInput;
  radius: number;
  wardTip: (code: string) => string;
  focusWard: { code: string; seq: number } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const heat = useRef<HeatLayerApi | null>(null);
  const polys = useRef(new Map<string, Leaflet.Polygon>());
  const mapRef = useRef<Leaflet.Map | null>(null);
  const tipRef = useRef(wardTip);
  const focusRef = useRef<string | null>(null);
  const latest = useRef({ points, radius });

  useEffect(() => {
    tipRef.current = wardTip;
  }, [wardTip]);

  useEffect(() => {
    latest.current = { points, radius };
    heat.current?.setData(points, radius);
  }, [points, radius]);

  useEffect(() => {
    if (!focusWard) return;
    const poly = polys.current.get(focusWard.code);
    const map = mapRef.current;
    if (!poly || !map) return;
    const prev = focusRef.current;
    if (prev) polys.current.get(prev)?.setStyle(OUTLINE);
    focusRef.current = focusWard.code;
    poly.setStyle(OUTLINE_FOCUS);
    map.flyToBounds(poly.getBounds(), { padding: [40, 40], duration: 0.6 });
  }, [focusWard]);

  useEffect(() => {
    const node = el.current;
    const polyMap = polys.current;
    if (!node) return;
    let map: Leaflet.Map | undefined;
    let cancelled = false;

    // Leaflet touches `window` on import, so load it only in the browser.
    import("leaflet").then((L) => {
      if (cancelled) return;
      map = L.map(node, { scrollWheelZoom: true, zoomControl: true, zoomSnap: 0.25 }).setView([19.07, 72.88], 11);
      mapRef.current = map;
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 16, attribution: "Tiles &copy; Esri" },
      ).addTo(map);

      const make = createHeatLayer(L);
      heat.current = make().addTo(map) as HeatLayerApi;
      const { points: p, radius: r } = latest.current;
      heat.current.setData(p, r);

      const wardsLayer = L.geoJSON(outlines as Outlines, {
        style: OUTLINE,
        onEachFeature: (feature, item) => {
          const poly = item as Leaflet.Polygon;
          const code = feature.properties.ward_code;
          polyMap.set(code, poly);
          poly.bindTooltip(() => tipRef.current(code), { sticky: true, className: "ward-tip" });
          poly.on({
            mouseover: () => poly.setStyle(OUTLINE_HOVER),
            mouseout: () => poly.setStyle(focusRef.current === code ? OUTLINE_FOCUS : OUTLINE),
          });
        },
      }).addTo(map);
      map.fitBounds(wardsLayer.getBounds(), { padding: [12, 12] });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      heat.current = null;
      polyMap.clear();
    };
  }, [outlines]);

  return <div ref={el} className="h-full w-full" aria-label="Heatmap of Mumbai wards" />;
}
