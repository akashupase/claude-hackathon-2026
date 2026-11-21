import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import PageShell, { CARD, H1, LABEL } from "@/components/page-shell";
import LoginForm from "@/components/admin/login-form";
import { getUser } from "@/lib/auth";

export const metadata = { title: "Officer login · Follow the Rupee" };

// Already signed in? Go straight to the dashboard.
async function AlreadyIn() {
  await connection();
  if (await getUser()) redirect("/admin");
  return null;
}

export default function LoginPage() {
  return (
    <PageShell>
      <Suspense fallback={null}><AlreadyIn /></Suspense>
      <div className="mx-auto max-w-[440px]">
        <div className={LABEL}>For ward officers and BMC officials</div>
        <h1 className={`${H1} mt-2`}>Officer login</h1>
        <div className={`${CARD} mt-6`}>
          <LoginForm />
        </div>
      </div>
    </PageShell>
  );
}
