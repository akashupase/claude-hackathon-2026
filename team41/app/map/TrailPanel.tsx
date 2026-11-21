"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TrailFocus } from "./SearchBar";
import type { TrailRecord } from "./trail";
import { formatInr } from "./format";

const LANG_LABEL: Record<string, string> = {
  en: "EN",
  "hi-en": "HI-EN",
  mr: "MR",
  hi: "HI",
};

const SHORT_CHANNEL: Record<string, string> = {
  "MyBMC App": "MyBMC App",
  "1916 Helpline": "1916 Helpline",
  "MyBMC Web Portal": "Web Portal",
  "Ward Office Walk-in": "Walk-in",
};

type StepState = "done" | "pending" | "ok" | "warn" | "failed";
type Step = { label: string; when: string; note: string; state: StepState };

function timelineFor(r: TrailRecord): Step[] {
  const steps: Step[] = [
    {
      label: "Logged",
      when: r.received_at || "—",
      note: r.channel || "—",
      state: "done",
    },
  ];
  const wo = r.work_order;
  if (wo) {
    steps.push(
      {
        label: "Job assigned",
        when: wo.assigned_at || "—",
        note: wo.work_order_id,
        state: wo.assigned_at ? "done" : "pending",
      },
      {
        label: "Work Started",
        when: wo.work_started_at || "—",
        note: wo.repair_method || "—",
        state: wo.work_started_at ? "done" : "pending",
      },
      {
        label: "Completed",
        when: wo.completed_at || "—",
        note: wo.cost_inr ? `${formatInr(wo.cost_inr)} billed` : "—",
        state: wo.completed_at ? "done" : "pending",
      },
    );
    if (wo.reopened_within_30d) {
      steps.push({
        label: "Did it last 30 days?",
        when: "within 30 days",
        note: "No — the same problem came back",
        state: "failed",
      });
    } else if (wo.sla_met) {
      steps.push({
        label: "Did it last 30 days?",
        when: wo.completed_at || "—",
        note: "Yes — no repeat complaint on record",
        state: "ok",
      });
    } else {
      steps.push({
        label: "Did it last 30 days?",
        when: wo.completed_at || "—",
        note: "Fix was late — past the BMC deadline",
        state: "warn",
      });
    }
  } else {
    steps.push(
      { label: "Job assigned", when: "—", note: "no work order on file", state: "pending" },
      { label: "Work Started", when: "—", note: "—", state: "pending" },
      { label: "Completed", when: "—", note: "—", state: "pending" },
      {
        label: "Did it last 30 days?",
        when: "—",
        note: `Never fixed — ${r.status || "still open"}`,
        state: "failed",
      },
    );
  }
  return steps;
}

// Ward drawer "Trail & Evidence" tab: cleaned citizen issue cards with the
// full paper trail from complaint to durability, plus the dispute radar.
export default function TrailPanel({
  records,
  roadById,
  focus,
}: {
  records: TrailRecord[];
  roadById: Map<string, string>;
  focus: TrailFocus | null;
}) {
  const roadFilterId = focus?.type === "road" ? focus.id : null;
  const visible = useMemo(
    () =>
      roadFilterId
        ? records.filter((r) => r.work_order?.road_id === roadFilterId)
        : records,
    [records, roadFilterId],
  );

  // Expanded card: a fresh search focus wins until the user toggles manually.
  // Derived during render — no setState-in-effect.
  const [manual, setManual] = useState<{ id: string | null; seq: number }>({
    id: null,
    seq: -1,
  });
  const focusSeq = focus?.seq ?? -1;
  const expandedId =
    manual.seq >= focusSeq
      ? manual.id
      : focus?.type === "complaint"
        ? focus.id
        : manual.id;
  const handleToggle = (id: string) =>
    setManual((cur) => ({ id: cur.id === id ? null : id, seq: Date.now() }));

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus || focus.type !== "complaint") return;
    // let React paint the expanded card first, then scroll it into view
    const t = window.setTimeout(() => {
      listRef.current
        ?.querySelector(`[data-trail-id="${focus.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focus]);

  if (records.length === 0) {
    return (
      <p className="rounded-xl bg-white px-4 py-6 text-center text-[13px] leading-[1.5] text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
        No citizen complaints indexed for this ward yet. To create the data, run{" "}
        <code className="rounded bg-[#faf3eb] px-1 py-0.5 text-[11.5px]">
          python scripts/build_trail_data.py
        </code>
      </p>
    );
  }

  return (
    <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-0.5">
      {roadFilterId && (
        <p className="rounded-lg bg-[#fdeae4] px-3 py-1.5 text-[12px] text-[#b23a1d]">
          Filtered to road {roadFilterId} ·{" "}
          {roadById.get(roadFilterId) ?? "unknown name"} — {visible.length} indexed{" "}
          {visible.length === 1 ? "complaint" : "complaints"}.
        </p>
      )}
      {visible.length === 0 && (
        <p className="rounded-xl bg-white px-4 py-5 text-center text-[13px] text-[#4a4f52] shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
          None of this ward&rsquo;s indexed complaints tie to that road segment.
        </p>
      )}
      {visible.map((r) => (
        <TrailCard
          key={r.complaint_id}
          r={r}
          roadName={r.work_order ? roadById.get(r.work_order.road_id) ?? r.work_order.road_id : null}
          expanded={expandedId === r.complaint_id}
          onToggle={() => handleToggle(r.complaint_id)}
        />
      ))}
      <p className="pb-1 pt-0.5 text-center text-[11px] text-[#4a4f52]">
        {records.length} complaint records for this ward · audit simulation with synthetic (fake) data
      </p>
    </div>
  );
}

function TrailCard({
  r,
  roadName,
  expanded,
  onToggle,
}: {
  r: TrailRecord;
  roadName: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const steps = timelineFor(r);
  return (
    <article
      data-trail-id={r.complaint_id}
      className="scroll-mt-2 rounded-xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14)]"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="block w-full rounded-xl px-3 py-2.5 text-left hover:bg-[#fff6ef] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#ee7454]"
      >
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[#f4ede4] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[#4a4f52]">
            {r.complaint_id}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#2b3033]">
            {r.category_reported}
            {r.locality_text ? ` · ${r.locality_text}` : ""}
          </span>
          <span className="flex-none text-[11px] tabular-nums text-[#4a4f52]">
            ▲ {r.upvotes}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="rounded-full bg-[#ece4f7] px-1.5 py-px text-[10px] font-semibold text-[#5b3a99]">
            {LANG_LABEL[r.language] ?? r.language.toUpperCase()}
          </span>
          <span
            className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
              r.work_order
                ? r.work_order.reopened_within_30d
                  ? "bg-[#fdeae4] text-[#b23a1d]"
                  : "bg-[#e3f2e4] text-[#1e6b34]"
                : "bg-[#fdeae4] text-[#b23a1d]"
            }`}
          >
            {r.work_order
              ? r.work_order.reopened_within_30d
                ? "Broke again"
                : r.work_order.sla_met
                  ? "Fix held up"
                  : "Finished late"
              : "Never fixed"}
          </span>
          {r.social_dispute && (
            <span className="rounded-full bg-[#b23a1d] px-1.5 py-px text-[10px] font-semibold text-white">
              ⚠ Disputed on WhatsApp/X
            </span>
          )}
          {r.duplicate_count > 1 && (
            <span className="rounded-full bg-[#f4ede4] px-1.5 py-px text-[10px] font-semibold text-[#4a4f52]">
              ×{r.duplicate_count} citizens
            </span>
          )}
          <span className="ml-auto text-[10px] text-[#4a4f52]">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t-2 border-dotted border-[rgba(43,48,51,.12)] px-3 pb-3 pt-2.5">
          {/* Cleaned issue card */}
          <p className="text-[13px] leading-[1.55] text-[#2b3033]">
            &ldquo;{r.description}&rdquo;
          </p>
          <p className="mt-1.5 text-[11.5px] text-[#4a4f52]">
            {r.locality_text ? `${r.locality_text} · ` : ""}Ward {r.ward_code} ·{" "}
            {r.assistant_commissioner_office || "ward office"}
            {r.geocoded && (
              <span className="ml-1 rounded-full bg-[#e3f2e4] px-1.5 py-px text-[10px] font-semibold text-[#1e6b34]">
                geocoded from locality text
              </span>
            )}
          </p>
          {r.duplicate_count > 1 && (
            <p className="mt-1.5 rounded-lg bg-[#faf3eb] px-2.5 py-1.5 text-[11.5px] text-[#4a4f52]">
              <span className="font-semibold text-[#2b3033]">
                {r.duplicate_count} citizens reported
              </span>{" "}
              across{" "}
              {(r.duplicate_channels.length
                ? r.duplicate_channels
                : [r.channel]
              ).map((c) => SHORT_CHANNEL[c] ?? c).join(" & ")}{" "}
              within 48 hours.
            </p>
          )}

          {/* 5-step timeline */}
          <ol className="mt-2.5 space-y-0">
            {steps.map((s, i) => (
              <li key={s.label} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <span
                    className={`mt-1 size-2.5 flex-none rounded-full border-2 ${
                      s.state === "done"
                        ? "border-[#ee7454] bg-[#ee7454]"
                        : s.state === "ok"
                          ? "border-[#1e6b34] bg-[#1e6b34]"
                          : s.state === "failed"
                            ? "border-[#b23a1d] bg-[#b23a1d]"
                            : s.state === "warn"
                              ? "border-[#8a6116] bg-[#8a6116]"
                              : "border-[#c9c2ba] bg-white"
                    }`}
                  />
                  {i < steps.length - 1 && (
                    <span className="w-0 flex-1 border-l-2 border-dotted border-[rgba(43,48,51,.2)]" />
                  )}
                </div>
                <div className={i < steps.length - 1 ? "pb-2" : ""}>
                  <div className="text-[12px] font-medium leading-[1.3] text-[#2b3033]">
                    {s.label}
                    {s.when !== "—" && (
                      <span className="ml-1.5 font-normal tabular-nums text-[#4a4f52]">
                        {s.when}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[11.5px] leading-[1.35] ${
                      s.state === "failed"
                        ? "font-medium text-[#b23a1d]"
                        : s.state === "ok"
                          ? "font-medium text-[#1e6b34]"
                          : "text-[#4a4f52]"
                    }`}
                  >
                    {s.note}
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {/* Work order facts */}
          {r.work_order && (
            <p className="mt-2 rounded-lg bg-[#faf3eb] px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-[#4a4f52]">
              <span className="font-medium text-[#2b3033]">
                {r.work_order.contractor_name.replace(" (synthetic)", "")}
              </span>{" "}
              · {r.work_order.repair_method}
              {roadName ? ` · ${roadName}` : ""} · billed{" "}
              <span className="tabular-nums">{formatInr(r.work_order.cost_inr)}</span>
            </p>
          )}

          {/* Visual evidence — descriptions only, never the placeholder photo */}
          {(r.photo_description || r.work_order?.engineer_remark) && (
            <div className="mt-2 rounded-lg border border-dashed border-[rgba(43,48,51,.25)] px-2.5 py-2">
              <div className="text-[10px] font-medium uppercase tracking-[.08em] text-[#4a4f52]">
                What the photo shows (as text)
              </div>
              {r.photo_description && (
                <p className="mt-1 text-[12px] leading-[1.45] text-[#2b3033]">
                  📷 {r.photo_description}
                </p>
              )}
              {r.work_order?.engineer_remark && (
                <p className="mt-1 text-[12px] italic leading-[1.45] text-[#4a4f52]">
                  Engineer&rsquo;s note: &ldquo;{r.work_order.engineer_remark}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Social dispute callout */}
          {r.social_dispute && (
            <div className="mt-2 rounded-lg bg-[#fdeae4] px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(178,58,29,.35)]">
              <div className="text-[11px] font-semibold uppercase tracking-[.06em] text-[#b23a1d]">
                ⚠️ People complained again on WhatsApp/X — BMC closed this on {r.work_order?.completed_at || "earlier"},
                new post {r.social_dispute.posted_at}
              </div>
              <blockquote className="mt-1 border-l-2 border-[#b23a1d]/50 pl-2 text-[12px] leading-[1.45] text-[#2b3033]">
                &ldquo;{r.social_dispute.text}&rdquo;
                <footer className="mt-0.5 text-[10.5px] not-italic text-[#4a4f52]">
                  — {r.social_dispute.source} · {r.social_dispute.posted_at} ·{" "}
                  {r.social_dispute.likes_or_forwards} likes/forwards
                </footer>
              </blockquote>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
