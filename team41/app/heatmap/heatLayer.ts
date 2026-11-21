import type * as Leaflet from "leaflet";

// A tiny canvas heat layer for Leaflet (no plugin). Each point adds a smooth
// kernel into a float density grid; the grid is scaled to the 98th percentile
// of what's on screen (so dense and sparse layers both show contrast) and
// mapped through a light→dark coral ramp.

export type HeatInput = { lat: number; lon: number; w: number }[];

// Sequential ramp, one hue family, light → dark.
export const HEAT_STOPS: [number, string][] = [
  [0.0, "#fdeae4"],
  [0.25, "#fbd5c6"],
  [0.5, "#f5a183"],
  [0.72, "#e8643f"],
  [0.88, "#bf3d1c"],
  [1.0, "#7a2210"],
];

function buildPalette(): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  for (const [o, col] of HEAT_STOPS) g.addColorStop(o, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

// Smooth compact kernel (1 - d²/r²)², precomputed per radius.
function buildKernel(r: number): Float32Array {
  const size = r * 2 + 1;
  const k = new Float32Array(size * size);
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const t = 1 - (x * x + y * y) / (r * r);
      k[(y + r) * size + (x + r)] = t > 0 ? t * t : 0;
    }
  return k;
}

export function createHeatLayer(L: typeof Leaflet) {
  let palette: Uint8ClampedArray | null = null;
  const kernels = new Map<number, Float32Array>();

  const HeatLayer = L.Layer.extend({
    initialize(this: HeatState) {
      this._points = [];
      this._radius = 16;
    },

    setData(this: HeatState, points: HeatInput, radius: number) {
      this._points = points;
      this._radius = radius;
      if (this._map) this._redraw();
      return this;
    },

    onAdd(this: HeatState, map: Leaflet.Map) {
      const pane = map.getPane("heat") ?? map.createPane("heat");
      pane.style.zIndex = "390";
      pane.style.pointerEvents = "none";
      this._canvas = L.DomUtil.create("canvas", "heat-canvas", pane) as HTMLCanvasElement;
      this._canvas.style.position = "absolute";
      map.on("moveend resize", this._redraw, this);
      map.on("zoomstart", this._hide, this);
      this._redraw();
      return this;
    },

    onRemove(this: HeatState, map: Leaflet.Map) {
      map.off("moveend resize", this._redraw, this);
      map.off("zoomstart", this._hide, this);
      this._canvas?.remove();
      this._canvas = undefined;
      return this;
    },

    _hide(this: HeatState) {
      if (this._canvas) this._canvas.style.visibility = "hidden";
    },

    _redraw(this: HeatState) {
      const map = this._map;
      const canvas = this._canvas;
      if (!map || !canvas) return;
      // Density grid at CSS-pixel resolution; the browser smooths it on HiDPI.
      const { x: W, y: H } = map.getSize();
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      canvas.style.visibility = "visible";
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, W, H);
      if (!this._points.length || !W || !H) return;

      // Grow blobs gently with zoom so detail resolves as you zoom in.
      const r = Math.round(Math.max(6, Math.min(70, this._radius * Math.pow(1.35, map.getZoom() - 11))));
      let kernel = kernels.get(r);
      if (!kernel) {
        kernel = buildKernel(r);
        kernels.set(r, kernel);
      }
      const ks = r * 2 + 1;

      const grid = new Float32Array(W * H);
      const bounds = map.getBounds().pad(0.2);
      for (const p of this._points) {
        if (!bounds.contains([p.lat, p.lon])) continue;
        const pt = map.latLngToContainerPoint([p.lat, p.lon]);
        const cx = Math.round(pt.x);
        const cy = Math.round(pt.y);
        const y0 = Math.max(0, cy - r);
        const y1 = Math.min(H - 1, cy + r);
        const x0 = Math.max(0, cx - r);
        const x1 = Math.min(W - 1, cx + r);
        for (let y = y0; y <= y1; y++) {
          const row = y * W;
          const krow = (y - cy + r) * ks - cx + r;
          for (let x = x0; x <= x1; x++) grid[row + x] += kernel[krow + x] * p.w;
        }
      }

      // Normalise to the 98th percentile of non-zero cells (sampled).
      const sample: number[] = [];
      const stride = Math.max(1, Math.floor(grid.length / 40000));
      for (let i = 0; i < grid.length; i += stride) if (grid[i] > 0) sample.push(grid[i]);
      if (!sample.length) return;
      sample.sort((a, b) => a - b);
      const norm = sample[Math.floor(sample.length * 0.98)] || sample[sample.length - 1];

      palette ??= buildPalette();
      const img = ctx.createImageData(W, H);
      const px = img.data;
      for (let i = 0; i < grid.length; i++) {
        const v = grid[i];
        if (v <= 0) continue;
        const t = Math.min(1, Math.sqrt(v / norm)); // sqrt lifts the faint edges
        if (t < 0.04) continue;
        const j = Math.round(t * 255) * 4;
        const o = i * 4;
        px[o] = palette[j];
        px[o + 1] = palette[j + 1];
        px[o + 2] = palette[j + 2];
        px[o + 3] = Math.round(Math.min(1, t * 1.6) * 215);
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  return () => new (HeatLayer as unknown as new () => HeatLayerApi)();
}

export type HeatLayerApi = Leaflet.Layer & {
  setData(points: HeatInput, radius: number): HeatLayerApi;
};

type HeatState = {
  _map?: Leaflet.Map;
  _canvas?: HTMLCanvasElement;
  _points: HeatInput;
  _radius: number;
  _redraw(): void;
  _hide(): void;
};
