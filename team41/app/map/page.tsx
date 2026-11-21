import { Suspense } from "react";
import { connection } from "next/server";
import SiteHeader from "@/components/site-header";
import { fontVars, inter } from "@/lib/fonts";
import {
  loadAuditFlags,
  loadContractorScores,
  loadWardSimulator,
} from "./audit";
import { loadRoads, loadWardOutlines, loadWards } from "./data";
import MapExperience from "./MapExperience";
import { loadTrailIndex } from "./trail";

export const metadata = {
  title: "Ward map · Follow the Rupee",
  description:
    "Mumbai BMC ward map with an audit simulation: recoverable rupees, contractor fairness and a monsoon spend simulator (synthetic data)",
};

// Static shell — the data-dependent body streams in via Suspense so the route
// can still prerender its frame (Next 16 blocking-prerender-dynamic).
export default function MapPage() {
  return (
    <div
      className={`${fontVars} ${inter.variable} flex min-h-dvh w-full flex-col gap-3 bg-[#faf3eb] text-[#2b3033] lg:h-dvh lg:min-h-0`}
    >
      <SiteHeader current="map" />
      {/* Plain sans below the header, same as /audit: font vars resolve to Inter. */}
      <div className="contents font-[family-name:var(--font-inter)] [--font-bricolage:var(--font-inter)] [--font-newsreader:var(--font-inter)]">
        <Suspense fallback={<MapFallback />}>
          <MapBody />
        </Suspense>
      </div>
    </div>
  );
}

async function MapBody() {
  // Read the data files per request rather than at build time.
  await connection();
  const [wards, outlines, roads, audit, scores, simulator, trail] =
    await Promise.all([
      loadWards(),
      loadWardOutlines(),
      loadRoads(),
      loadAuditFlags(),
      loadContractorScores(),
      loadWardSimulator(),
      loadTrailIndex(),
    ]);

  return (
    <MapExperience
      wards={wards}
      outlines={outlines}
      roads={roads}
      audit={audit}
      scores={scores}
      simulator={simulator}
      trail={trail}
    />
  );
}

function MapFallback() {
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-2 sm:px-[max(20px,6%)] lg:flex-row">
      <div className="h-[120px] flex-none animate-pulse rounded-xl bg-white/70" />
      <div className="h-[46dvh] flex-1 animate-pulse rounded-2xl bg-white/70" />
    </main>
  );
}
