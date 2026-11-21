import { Suspense } from "react";
import { connection } from "next/server";
import PageShell from "@/components/page-shell";
import { inter } from "@/lib/fonts";
import { loadRupee } from "@/lib/rupee";
import ContractorsView from "./ContractorsView";

export const metadata = { title: "Contractors · Follow the Rupee" };

const ORDER = { A: 0, B: 1, C: 2, D: 3 };

async function Contractors() {
  await connection();
  const D = await loadRupee();
  const ranked = [...D.contractors].sort(
    (a, b) => ORDER[a.grade] - ORDER[b.grade] || b.durability_vs_expected_pp - a.durability_vs_expected_pp,
  );
  return <ContractorsView contractors={ranked} />;
}

export default function ContractorsPage() {
  return (
    <PageShell current="contractors">
      {/* Plain sans for this page, same as /audit and /map. */}
      <div
        className={`${inter.variable} font-[family-name:var(--font-inter)] [--font-bricolage:var(--font-inter)] [--font-newsreader:var(--font-inter)]`}
      >
        <p className="text-[13px] font-bold uppercase tracking-[.14em] text-[#ee7454]">Contractors · graded fairly</p>
        <h1 className="mt-3 text-[clamp(36px,5.5vw,72px)] font-extrabold leading-[.95] tracking-[-.05em]">
          Who did the work,
          <span className="block text-[.62em] tracking-[-.04em]">and did it last?</span>
        </h1>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-2xl bg-white/60" />}>
          <Contractors />
        </Suspense>

        <details className="mt-8 rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(43,48,51,.12)]">
          <summary className="cursor-pointer text-[16px] font-bold">How the grade works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px]">
            <li><b>Durability</b> (fixes that last), against expected: 5+ points better = +2, 5+ worse = −2. Counts double: a failed fix is paid for twice.</li>
            <li><b>Speed</b> (deadlines met), against expected: 5+ points better = +1, 5+ worse = −1.</li>
            <li><b>Billing</b>: over-billed and repeat bills above 5% of jobs = −2, above 1% = −1.</li>
            <li>2+ points = A, 0 to 1 = B, −1 to −2 = C, lower = D. Warranty (DLP) payments are BMC&apos;s decision, so they are not counted against contractors.</li>
          </ul>
        </details>
      </div>
    </PageShell>
  );
}
