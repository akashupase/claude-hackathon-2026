"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AuditFlag,
  AuditFlagsData,
  ContractorScoresData,
  WardSimulatorData,
} from "./audit";
import type { Ward } from "./data";
import type { TrailFocus, SearchHit } from "./SearchBar";
import type { TrailIndexData } from "./trail";
import AuditFlagsPanel from "./AuditFlagsPanel";
import ClawbackNoticeModal from "./ClawbackNoticeModal";
import ContractorLeaderboard from "./ContractorLeaderboard";
import KpiTicker from "./KpiTicker";
import SearchBar from "./SearchBar";
import WardDrawerPanels, { type DrawerTab } from "./WardDrawerPanels";
import WardMap from "./WardMap";

type Tab = "flags" | "contractors";

// The single split-screen /map experience: universal search + KPI ticker on
// top, audit panel on the left (a bottom-sheet popup on mobile), Leaflet map
// on the right, budget planner and citizen trail inside the ward drawer.
export default function MapExperience({
  wards,
  outlines,
  audit,
  scores,
  simulator,
  trail,
}: {
  wards: Ward[];
  outlines: unknown;
  audit: AuditFlagsData | null;
  scores: ContractorScoresData | null;
  simulator: WardSimulatorData | null;
  trail: TrailIndexData | null;
}) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("flags");
  const [notice, setNotice] = useState<AuditFlag | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("simulator");
  const [trailFocus, setTrailFocus] = useState<TrailFocus | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close the mobile sheet with Escape.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const ward = useMemo(
    () => wards.find((w) => w.ward_code === selectedCode) ?? null,
    [wards, selectedCode],
  );
  const wardSim = useMemo(
    () => simulator?.wards.find((w) => w.ward_code === selectedCode) ?? null,
    [simulator, selectedCode],
  );
  const wardTrail = useMemo(
    () => (selectedCode ? trail?.complaints.filter((c) => c.ward_code === selectedCode) ?? [] : []),
    [trail, selectedCode],
  );
  const roadById = useMemo(
    () => new Map((trail?.roads ?? []).map((r) => [r.road_id, r.road_name])),
    [trail],
  );

  // A search pick selects the ward, opens the Citizen trail tab and focuses
  // the record.
  const handleSearchPick = (hit: SearchHit) => {
    const wardCode = hit.kind === "complaint" ? hit.record.ward_code : hit.road.ward_code;
    if (!wardCode) return;
    setSelectedCode(wardCode);
    setDrawerTab("trail");
    setTrailFocus({
      type: hit.kind === "complaint" ? "complaint" : "road",
      id: hit.kind === "complaint" ? hit.record.complaint_id : hit.road.road_id,
      seq: Date.now(),
    });
  };

  // Shared panel content: flags list on desktop, inside the sheet on mobile.
  const panelBody =
    tab === "flags" ? (
      audit ? (
        <AuditFlagsPanel
          audit={audit}
          wardCode={selectedCode}
          wardName={ward?.ward_name}
          onOpenNotice={setNotice}
        />
      ) : (
        <EmptyFeed text="Data feed missing — run python scripts/build_audit_data.py from the team41 folder to create it." />
      )
    ) : scores ? (
      <ContractorLeaderboard scores={scores} selectedWardCode={selectedCode} />
    ) : (
      <EmptyFeed text="Ratings feed missing — run python scripts/build_audit_data.py from the team41 folder to create it." />
    );

  const tabButtons = (
    [
      ["flags", "Wasted money"],
      ["contractors", "Contractor ratings"],
    ] as [Tab, string][]
  ).map(([key, label]) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={`flex-1 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#ee7454] ${
        tab === key
          ? "bg-white text-[#2b3033] shadow-[0_1px_3px_rgba(0,0,0,.15)]"
          : "text-[#4a4f52] hover:text-[#2b3033]"
      }`}
    >
      {label}
    </button>
  ));

  return (
    <>
      <div className="flex flex-none flex-col gap-2 px-5 pt-3 sm:px-[max(20px,6%)]">
        <SearchBar trail={trail} onPick={handleSearchPick} />
        <KpiTicker audit={audit} wardSim={wardSim} wardName={ward?.ward_code} />
      </div>

      <main className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-2 sm:px-[max(20px,6%)] lg:flex-row">
        {/* Left panel (desktop): audit flags / contractors */}
        <div className="hidden min-h-0 flex-col rounded-2xl bg-[#faf3eb] lg:flex lg:w-[400px] lg:flex-none xl:w-[430px]">
          <div
            className="mb-2 flex flex-none gap-1 rounded-xl bg-[#efe7dd] p-1"
            role="tablist"
            aria-label="Audit panels"
          >
            {tabButtons}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{panelBody}</div>
        </div>

        {/* Right: map */}
        <div className="relative h-[46dvh] flex-none overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)] lg:h-auto lg:min-h-0 lg:flex-1">
          <WardMap
            wards={wards}
            outlines={outlines}
            selectedCode={selectedCode}
            onWardSelect={setSelectedCode}
            drawerFooter={
              wardSim || wardTrail.length > 0 ? (
                <WardDrawerPanels
                  wardCode={selectedCode ?? ""}
                  wardName={ward?.ward_name ?? ""}
                  sim={wardSim}
                  trailRecords={wardTrail}
                  roadById={roadById}
                  focus={trailFocus}
                  tab={drawerTab}
                  onTabChange={setDrawerTab}
                />
              ) : null
            }
          />
        </div>

        {/* Mobile: open the audit panels as a bottom-sheet popup */}
        <div className="flex flex-none gap-2 lg:hidden">
          <button
            type="button"
            onClick={() => {
              setTab("flags");
              setSheetOpen(true);
            }}
            className="flex-1 rounded-full bg-[#2b3033] px-3.5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-[#ee7454] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
          >
            💸 Wasted money
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("contractors");
              setSheetOpen(true);
            }}
            className="flex-1 rounded-full bg-white px-3.5 py-2 text-[13.5px] font-medium text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.16)] transition-colors hover:bg-[#fdeae4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
          >
            ★ Contractor ratings
          </button>
        </div>
      </main>

      {/* Mobile bottom sheet */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[1800] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Audit details"
        >
          <div
            className="absolute inset-0 bg-[rgba(43,48,51,.45)]"
            onClick={() => setSheetOpen(false)}
          />
          <div className="sheet-panel absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-[#faf3eb] shadow-[0_-12px_40px_rgba(0,0,0,.35)]">
            <div
              className="mx-auto mt-2 h-1 w-10 flex-none rounded-full bg-[#c9c2ba]"
              aria-hidden="true"
            />
            <div className="flex flex-none items-center gap-2 px-4 pt-2">
              <div
                className="flex min-w-0 flex-1 gap-1 rounded-xl bg-[#efe7dd] p-1"
                role="tablist"
                aria-label="Audit panels"
              >
                {tabButtons}
              </div>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="grid size-8 flex-none place-items-center rounded-full text-lg text-[#4a4f52] hover:bg-[rgba(43,48,51,.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]"
                aria-label="Close panel"
              >
                ×
              </button>
            </div>
            <div className="flex min-h-[45dvh] flex-1 flex-col overflow-hidden px-4 pb-6 pt-3">
              {panelBody}
            </div>
          </div>
        </div>
      )}

      {notice && (
        <ClawbackNoticeModal
          flag={notice}
          wardName={ward?.ward_code === notice.ward_code ? ward?.ward_name : undefined}
          onClose={() => setNotice(null)}
        />
      )}
    </>
  );
}

function EmptyFeed({ text }: { text: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-white px-6 py-10 text-center text-[14px] leading-[1.6] text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
      {text}
    </div>
  );
}
