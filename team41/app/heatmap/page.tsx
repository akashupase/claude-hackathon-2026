import { Suspense } from "react";
import { connection } from "next/server";
import SiteHeader from "@/components/site-header";
import { fontVars, inter } from "@/lib/fonts";
import { loadWardOutlines } from "../map/data";
import { loadHeatmapData } from "./data";
import HeatmapExplorer from "./HeatmapExplorer";

export const metadata = {
  title: "Heatmap · Follow the Rupee",
  description: "Complaints, accidents, flood hotspots, facilities and roads across Mumbai wards, as heatmaps (synthetic data)",
};

async function Body() {
  // Query Postgres per request.
  await connection();
  const [data, outlines] = await Promise.all([loadHeatmapData(), loadWardOutlines()]);
  return <HeatmapExplorer data={data} outlines={outlines} />;
}

export default function Page() {
  return (
    <div
      className={`${fontVars} ${inter.variable} flex min-h-dvh w-full flex-col gap-3 bg-[#faf3eb] font-[family-name:var(--font-inter)] text-[#2b3033] lg:h-dvh lg:min-h-0`}
    >
      <SiteHeader />
      <Suspense
        fallback={
          <main className="flex min-h-0 flex-1 gap-4 px-5 pb-5 sm:px-[max(20px,6%)]">
            <div className="hidden w-[360px] animate-pulse rounded-2xl bg-white/70 lg:block" />
            <div className="h-[62dvh] flex-1 animate-pulse rounded-2xl bg-white/70 lg:h-auto" />
          </main>
        }
      >
        <Body />
      </Suspense>
    </div>
  );
}
