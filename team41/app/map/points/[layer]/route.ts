import { loadPointLayer, POINT_LAYERS, type PointLayerKey } from "../../points";

// GET /map/points/<layer>: compact point rows for one ward-map layer.
export async function GET(_req: Request, ctx: RouteContext<"/map/points/[layer]">) {
  const { layer } = await ctx.params;
  if (!POINT_LAYERS.includes(layer as PointLayerKey)) {
    return Response.json({ error: `Unknown layer. Use one of: ${POINT_LAYERS.join(", ")}` }, { status: 404 });
  }
  const rows = await loadPointLayer(layer as PointLayerKey);
  return Response.json(rows, { headers: { "Cache-Control": "public, max-age=300" } });
}
