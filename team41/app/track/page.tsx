import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import PageShell, { CARD, Chip, H1, LABEL, MUTED } from "@/components/page-shell";
import WOTimeline from "@/components/wo-timeline";
import { inr, loadRupee, wardSlug } from "@/lib/rupee";

export const metadata = { title: "Track a complaint · Follow the Rupee" };

async function Results({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const q = String(sp.q ?? "").trim();
  if (!q) return <p className={MUTED}>Try <Link className="underline" href="/track?q=BMC25-000295">BMC25-000295</Link>, <Link className="underline" href="/track?q=WO25-00117">WO25-00117</Link>, <Link className="underline" href="/track?q=SV Road">SV Road</Link> or <Link className="underline" href="/track?q=Kurla">Kurla</Link>.</p>;
  const D = await loadRupee();
  const up = q.toUpperCase();
  const ql = q.toLowerCase();

  // 1. complaint number
  const c = D.C[up];
  if (c) {
    const [ward, date, issue, , status, text, woId] = c;
    const msg = status.startsWith("Closed - Duplicate") ? "Marked as a duplicate of another complaint about the same problem."
      : status.startsWith("Forwarded") || status.startsWith("Rejected") ? "Not handled by BMC road repairs. Ask the ward office which department now owns it."
      : "No repair has been linked to this complaint. Follow up at the ward office, on 1916, or with your corporator.";
    return (
      <div className="space-y-4">
        <div className={CARD}>
          <div className={LABEL}>Complaint {up} · {date} · ward {ward || "unknown"} · {issue}</div>
          <p className="mt-2 text-lg">“{text}”</p>
          {!woId && <p className="mt-2"><Chip>{status}</Chip> <span className={MUTED}>{msg}</span></p>}
        </div>
        {woId && D.W[woId] && <WOTimeline id={woId} wo={D.W[woId]} />}
      </div>
    );
  }
  // 2. work order number
  if (D.W[up]) return <WOTimeline id={up} wo={D.W[up]} />;

  // 3. roads, wards, contractors
  const byRoad = new Map<string, string[]>();
  for (const [id, w] of Object.entries(D.W)) if (w[1].toLowerCase().includes(ql)) byRoad.set(w[1], [...(byRoad.get(w[1]) ?? []), id]);
  const wards = D.wards.filter((w) => w.ward_code.toLowerCase() === ql || w.ward_name.toLowerCase().includes(ql));
  const cons = D.contractors.filter((x) => x.short.toLowerCase().includes(ql));
  if (!byRoad.size && !wards.length && !cons.length) return <p className={MUTED}>Nothing found for “{q}”.</p>;
  return (
    <div className="space-y-4">
      {wards.length > 0 && (
        <div className={CARD}>
          <div className={LABEL}>Wards</div>
          <ul className="mt-2">{wards.map((w) => <li key={w.ward_code}><Link className="underline hover:text-[#ee7454]" href={`/ward/${wardSlug(w.ward_code)}`}>Ward {w.ward_code}: {w.ward_name}</Link></li>)}</ul>
        </div>
      )}
      {cons.length > 0 && (
        <div className={CARD}>
          <div className={LABEL}>Contractors</div>
          <ul className="mt-2">{cons.map((x) => <li key={x.contractor_id}><Link className="underline hover:text-[#ee7454]" href={`/contractors#${x.contractor_id}`}>{x.short}</Link> · grade {x.grade}</li>)}</ul>
        </div>
      )}
      {[...byRoad.entries()].slice(0, 6).map(([road, ids]) => (
        <div key={road} className={`${CARD} overflow-x-auto`}>
          <div className={LABEL}>Road · {ids.length} repair jobs · {inr(ids.reduce((s, i) => s + D.W[i][4], 0))}</div>
          <h2 className="mt-1 font-[family-name:var(--font-bricolage)] text-xl font-semibold">{road}</h2>
          <table className="mt-2 w-full text-[15px]">
            <thead className={`text-left text-sm ${MUTED}`}><tr><th className="py-1 pr-3">Work order</th><th className="pr-3">Method</th><th className="pr-3">Contractor</th><th className="pr-3">Completed</th><th className="pr-3">Lasted?</th><th className="text-right">Cost</th></tr></thead>
            <tbody>
              {ids.sort((a, b) => D.W[b][5].localeCompare(D.W[a][5])).map((id) => {
                const w = D.W[id];
                return (
                  <tr key={id} className="border-t border-[rgba(43,48,51,.12)]">
                    <td className="py-1.5 pr-3"><Link className="underline decoration-dotted hover:text-[#ee7454]" href={`/track?q=${id}`}>{id}</Link>{w[8] && <span className="ml-1 text-[#c2410c]">•</span>}</td>
                    <td className="pr-3">{w[2]}</td><td className="pr-3">{w[3]}</td><td className="pr-3">{w[5]}</td>
                    <td className={`pr-3 ${w[7] === "Y" ? "text-[#c2410c]" : "text-[#15803d]"}`}>{w[7] === "Y" ? "No" : "Yes"}</td>
                    <td className="text-right tabular-nums">{inr(w[4])}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={`mt-2 text-sm ${MUTED}`}><span className="text-[#c2410c]">•</span> = flagged in the audit.</p>
        </div>
      ))}
    </div>
  );
}

export default function TrackPage(props: PageProps<"/track">) {
  return (
    <PageShell current="track">
      <div className={LABEL}>For citizens</div>
      <h1 className={`${H1} mt-2`}>What happened to my complaint?</h1>
      <p className={`mt-3 max-w-[44em] ${MUTED}`}>
        Enter a complaint number, a work order, a road, a contractor or a ward. Follow it to the repair, who did it, what it cost, and whether it lasted.
      </p>
      <form action="/track" className="mt-5 flex flex-wrap gap-2">
        <input name="q" placeholder="BMC25-000295" aria-label="Search"
          className="min-w-0 flex-[1_1_280px] rounded-full bg-white px-5 py-3 shadow-[0_0_0_1px_rgba(43,48,51,.2)] outline-none focus:shadow-[0_0_0_2px_#ee7454]" />
        <button className="rounded-full bg-[#ee7454] px-6 py-3 font-[family-name:var(--font-bricolage)] font-semibold text-white hover:bg-[#e0603f]">Search</button>
      </form>
      <div className="mt-6">
        <Suspense fallback={<p className={MUTED}>Searching…</p>}>
          <Results searchParams={props.searchParams} />
        </Suspense>
      </div>
    </PageShell>
  );
}
