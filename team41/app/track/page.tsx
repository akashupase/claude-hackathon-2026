import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import PageShell, { H1, LABEL, MUTED } from "@/components/page-shell";
import { Journey, RoadStory, StoryCards } from "@/components/track";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { loadRupee, wardSlug } from "@/lib/rupee";

export const metadata = { title: "Track a complaint · Follow the Rupee" };

async function TrackContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const [lang, D] = await Promise.all([getLang(sp.lang), loadRupee()]);
  const T = (k: Parameters<typeof t>[1]) => t(lang, k);
  const q = String(sp.q ?? "").trim();
  const up = q.toUpperCase();
  const ql = q.toLowerCase();

  let result: React.ReactNode = null;
  if (q) {
    if (D.C[up]) {
      const c = D.C[up];
      result = <Journey lang={lang} complaint={c} cid={up} woId={c[6] || undefined} wo={c[6] ? D.W[c[6]] : undefined} flags={D.flags.filter((f) => f.work_order_id === c[6])} />;
    } else if (D.W[up]) {
      result = <Journey lang={lang} woId={up} wo={D.W[up]} flags={D.flags.filter((f) => f.work_order_id === up)} />;
    } else {
      const byRoad = new Map<string, string[]>();
      for (const [id, w] of Object.entries(D.W)) if (w[1].toLowerCase().includes(ql)) byRoad.set(w[1], [...(byRoad.get(w[1]) ?? []), id]);
      const wards = D.wards.filter((w) => w.ward_code.toLowerCase() === ql || w.ward_name.toLowerCase().includes(ql));
      const cons = D.contractors.filter((x) => x.short.toLowerCase().includes(ql));
      result = byRoad.size || wards.length || cons.length ? (
        <div className="space-y-4">
          {(wards.length > 0 || cons.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {wards.map((w) => (
                <Link key={w.ward_code} href={`/ward/${wardSlug(w.ward_code)}`} className="rounded-full bg-white px-4 py-2 font-[family-name:var(--font-bricolage)] font-semibold shadow-[0_0_0_1px_rgba(43,48,51,.14)] hover:text-[#ee7454]">
                  {T("ward")} {w.ward_code}: {w.ward_name} →
                </Link>
              ))}
              {cons.map((x) => (
                <Link key={x.contractor_id} href={`/contractors#${x.contractor_id}`} className="rounded-full bg-white px-4 py-2 font-[family-name:var(--font-bricolage)] font-semibold shadow-[0_0_0_1px_rgba(43,48,51,.14)] hover:text-[#ee7454]">
                  {x.short} · {T("grade")} {x.grade} →
                </Link>
              ))}
            </div>
          )}
          {[...byRoad.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 3).map(([road, ids]) => (
            <RoadStory key={road} D={D} lang={lang} road={road} ids={ids} />
          ))}
        </div>
      ) : <p className={`rounded-xl bg-white px-4 py-3 ${MUTED}`}>{T("nothing")}</p>;
    }
  }

  return (
    <>
      <div className={LABEL}>{T("tk_label")}</div>
      <h1 className={`${H1} mt-2`}>{T("tk_h")}</h1>
      <form action="/track" className="mt-5 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder={T("tk_p")} aria-label={T("tk_p")}
          className="min-w-0 flex-[1_1_280px] rounded-full bg-white px-5 py-3 text-lg shadow-[0_0_0_1px_rgba(43,48,51,.2)] outline-none focus:shadow-[0_0_0_2px_#ee7454]" />
        <button className="rounded-full bg-[#ee7454] px-7 py-3 font-[family-name:var(--font-bricolage)] text-lg font-semibold text-white hover:bg-[#e0603f]">{T("tk_btn")}</button>
      </form>
      {result && <div className="mt-6">{result}</div>}
      <h2 className="mb-3 mt-10 font-[family-name:var(--font-bricolage)] text-lg font-semibold">{T("tk_try")}</h2>
      <StoryCards D={D} lang={lang} />
    </>
  );
}

export default function TrackPage(props: PageProps<"/track">) {
  return (
    <PageShell current="track">
      <Suspense fallback={<div className="h-40" />}>
        <TrackContent searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}
