"use client";

import type { TrailFocus } from "./SearchBar";
import type { WardSimulatorEntry } from "./audit";
import type { TrailRecord } from "./trail";
import TrailPanel from "./TrailPanel";
import WardSimulator from "./WardSimulator";

export type DrawerTab = "simulator" | "trail";

// Tabbed widget rendered in the ward drawer footer: the monsoon simulator and
// the citizen Trail & Evidence tab share the space.
export default function WardDrawerPanels({
  wardCode,
  wardName,
  sim,
  trailRecords,
  roadById,
  focus,
  tab,
  onTabChange,
}: {
  wardCode: string;
  wardName: string;
  sim: WardSimulatorEntry | null;
  trailRecords: TrailRecord[];
  roadById: Map<string, string>;
  focus: TrailFocus | null;
  tab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
}) {
  return (
    <section aria-label="Ward drawer panels">
      <div
        className="mb-2 flex gap-1 rounded-lg bg-[#f4ede4] p-0.5"
        role="tablist"
        aria-label="Ward drawer panels"
      >
        {(
          [
            ["simulator", "Budget planner"],
            ["trail", `Citizen trail · ${trailRecords.length}`],
          ] as [DrawerTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => onTabChange(key)}
            className={`flex-1 rounded-md px-1.5 py-1 text-[11.5px] font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ee7454] ${
              tab === key
                ? "bg-white text-[#2b3033] shadow-[0_1px_3px_rgba(0,0,0,.18)]"
                : "text-[#4a4f52] hover:text-[#2b3033]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "simulator" ? "flex flex-col" : "hidden"}>
        {sim ? (
          <WardSimulator sim={sim} />
        ) : (
          <p className="text-[12.5px] text-[#4a4f52]">
            Simulator data missing for ward {wardCode} — regenerate the audit feeds.
          </p>
        )}
      </div>
      <div className={tab === "trail" ? "flex max-h-[420px] flex-col" : "hidden"}>
        {tab === "trail" && (
          <TrailPanel records={trailRecords} roadById={roadById} focus={focus} />
        )}
      </div>
      <p className="mt-2 text-[10.5px] leading-[1.4] text-[#4a4f52]">
        {wardName} · audit simulation with synthetic (fake) data.
      </p>
    </section>
  );
}
