import { Suspense } from "react";
import { connection } from "next/server";
import PageShell from "@/components/page-shell";
import { inter } from "@/lib/fonts";
import { loadAuditFlags } from "../map/audit";
import WastedMoney from "./WastedMoney";

export const metadata = {
  title: "Wasted money · Follow the Rupee",
  description: "Recoverable road-repair money across Mumbai wards (audit simulation, synthetic data)",
};

async function Body() {
  // Re-read the feed per request so a fresh build_audit_data.py run shows up.
  await connection();
  const audit = await loadAuditFlags();
  if (!audit) {
    return (
      <p className="rounded-2xl bg-white p-6 text-lg shadow-[0_0_0_1px_rgba(43,48,51,.14)]">
        Data feed missing — run python scripts/build_audit_data.py from the team41 folder to create it.
      </p>
    );
  }
  return <WastedMoney audit={audit} />;
}

export default function Page() {
  return (
    <PageShell>
      {/* Plain sans for this page: every font var below resolves to Inter. */}
      <div
        className={`${inter.variable} font-[family-name:var(--font-inter)] [--font-bricolage:var(--font-inter)] [--font-newsreader:var(--font-inter)]`}
      >
      <Suspense fallback={<p className="text-[#4a4f52]">Loading…</p>}>
        <Body />
      </Suspense>
      </div>
    </PageShell>
  );
}
