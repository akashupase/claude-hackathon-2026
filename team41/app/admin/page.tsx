import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import PageShell, { CARD, H1, LABEL, MUTED, Stat } from "@/components/page-shell";
import { logout } from "./actions";
import { getUser } from "@/lib/auth";
import { inr, fmt, loadRupee, wardSlug } from "@/lib/rupee";

export const metadata = { title: "Officer dashboard · Follow the Rupee" };

async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await getUser();
  if (!user) redirect("/admin/login");
  const [sp, D] = await Promise.all([searchParams, loadRupee()]);

  // Ward officers see only their ward; BMC admins can pick any ward (?ward=L).
  const wanted = String(sp.ward ?? "").replace("-", "/");
  const code = user.role === "ward_officer" ? user.ward! : D.wards.some((w) => w.ward_code === wanted) ? wanted : "";
  const w = D.wards.find((x) => x.ward_code === code);
  const flags = D.flags.filter((f) => !w || f.ward_code === code);
  const highRisk = new Set(flags.filter((f) => f.confidence === "High" && f.flag !== "Paid during DLP").map((f) => f.work_order_id));
  const spent = w ? w.spent_inr : D.summary.total_spend_inr;
  const budget = w ? w.budget_inr : D.summary.total_budget_inr;
  const open = w ? w.complaints_open_not_fixed : D.summary.complaints.open_not_fixed;
  const pending = w ? w.pending_accidents.length : D.summary.connections.accidents_while_pending;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={LABEL}>{user.role === "ward_officer" ? "Ward officer" : "BMC admin"} · signed in as {user.username}</div>
          <h1 className={`${H1} mt-2`}>{w ? `Ward ${w.ward_code} · ${w.ward_name}` : "All 24 wards"}</h1>
          <p className={`mt-2 ${MUTED}`}>{user.name}</p>
        </div>
        <form action={logout}>
          <button className="rounded-full px-5 py-2 font-[family-name:var(--font-bricolage)] font-semibold shadow-[0_0_0_1px_rgba(43,48,51,.2)] hover:text-[#ee7454]">Log out</button>
        </form>
      </div>

      {user.role === "bmc_admin" && (
        <div className="mt-5 flex flex-wrap gap-1.5">
          <Link href="/admin" className={`rounded-full px-3 py-1 font-[family-name:var(--font-bricolage)] text-sm font-medium shadow-[0_0_0_1px_rgba(43,48,51,.14)] ${!w ? "bg-[#ee7454] text-white" : "bg-white hover:text-[#ee7454]"}`}>All</Link>
          {D.wards.map((x) => (
            <Link key={x.ward_code} href={`/admin?ward=${wardSlug(x.ward_code)}`}
              className={`rounded-full px-3 py-1 font-[family-name:var(--font-bricolage)] text-sm font-medium shadow-[0_0_0_1px_rgba(43,48,51,.14)] ${x.ward_code === code ? "bg-[#ee7454] text-white" : "bg-white hover:text-[#ee7454]"}`}>
              {x.ward_code}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat value={inr(budget - spent)} label={`budget left of ${inr(budget)}`} bad={budget - spent < 0} />
        <Stat value={fmt(highRisk.size)} label="high-confidence bills to review" bad={highRisk.size > 0} />
        <Stat value={fmt(open)} label="complaints still waiting" />
        <Stat value={fmt(pending)} label="accidents while a repair waited" bad={pending > 0} />
      </div>

      <div className={`${CARD} mt-6`}>
        <p className={MUTED}>Dashboard tools go here next.</p>
        {w && <Link className="mt-2 inline-block underline hover:text-[#ee7454]" href={`/ward/${wardSlug(w.ward_code)}`}>Open the public ward report →</Link>}
      </div>
    </>
  );
}

export default function AdminPage(props: PageProps<"/admin">) {
  return (
    <PageShell>
      <Suspense fallback={<div className="h-40" />}>
        <Dashboard searchParams={props.searchParams} />
      </Suspense>
    </PageShell>
  );
}
