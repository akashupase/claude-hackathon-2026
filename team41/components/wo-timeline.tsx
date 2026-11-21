import Link from "next/link";
import { CARD, Chip, MUTED } from "@/components/page-shell";
import { inr, wardSlug, type WO } from "@/lib/rupee";

// One work order as a timeline: complaint -> assigned -> started -> completed -> held or failed, with proof.
export default function WOTimeline({ id, wo }: { id: string; wo: WO }) {
  const [ward, road, method, con, cost, , sla, reopened, flags, firstC, assigned, started, completed, photo, slaH, remark] = wo;
  const failed = reopened === "Y";
  const proof = photo && photo !== "nan" ? photo : "";
  const steps: { label: string; when: string; tone: "blue" | "good" | "bad"; note?: string }[] = [];
  if (firstC) steps.push({ label: "First complaint received", when: firstC, tone: "blue", note: proof ? `Citizen photo shows: ${proof}` : undefined });
  steps.push({ label: `Assigned to ${con}`, when: assigned, tone: "blue" });
  steps.push({ label: "Work started", when: started, tone: "blue" });
  steps.push({
    label: `Completed ${sla === "Y" ? "on time" : "late"} (target ${slaH} h)`, when: completed, tone: sla === "Y" ? "good" : "bad",
    note: remark ? `Engineer remark: “${remark}”` : undefined,
  });
  steps.sort((a, b) => a.when.localeCompare(b.when));
  steps.push({ label: failed ? "Problem came back within 30 days" : "Held for 30 days", when: "", tone: failed ? "bad" : "good" });
  const dot = { blue: "bg-[#2a78d6]", good: "bg-[#0ca30c]", bad: "bg-[#d03b3b]" };

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-[family-name:var(--font-bricolage)] text-lg font-semibold">{id}</span>
        {failed ? <Chip tone="red">Failed within 30 days</Chip> : <Chip tone="green">Fixed and held 30+ days</Chip>}
      </div>
      <p className={`mt-1 ${MUTED}`}>
        {method} on {road} · <Link className="underline decoration-dotted hover:text-[#ee7454]" href={`/ward/${wardSlug(ward)}`}>ward {ward}</Link> · {con} · {inr(cost)}
      </p>
      {flags && (
        <p className="mt-2 text-[#c2410c]">
          <b>Audit:</b> {flags}. See “Jobs to check” in <Link className="underline" href={`/ward/${wardSlug(ward)}#jobs`}>ward {ward}</Link>.
        </p>
      )}
      <ol className="mt-4 border-l-2 border-[rgba(43,48,51,.14)]">
        {steps.map((s, i) => (
          <li key={i} className="relative pb-4 pl-5">
            <span className={`absolute -left-[7px] top-[7px] size-3 rounded-full ring-2 ring-white ${dot[s.tone]}`} aria-hidden="true" />
            <b className="font-[family-name:var(--font-bricolage)] font-medium">{s.label}</b> <span className={`text-sm ${MUTED}`}>{s.when}</span>
            {s.note && <div className="mt-1.5 rounded-lg bg-[#faf3eb] px-3 py-2 text-[15px]">{s.note}</div>}
          </li>
        ))}
      </ol>
      <p className={`text-sm ${MUTED}`}>Proof: the dataset has placeholder photos, so the citizen photo is described in words. A live version would show before and after photos at each step.</p>
    </div>
  );
}
