"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/actions";

const INPUT =
  "w-full rounded-xl bg-white px-4 py-3 text-lg shadow-[0_0_0_1px_rgba(43,48,51,.2)] outline-none focus:shadow-[0_0_0_2px_#ee7454]";

export default function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-[family-name:var(--font-bricolage)] text-sm font-semibold">Username</span>
        <input name="username" autoComplete="username" required className={INPUT} placeholder="admin" />
      </label>
      <label className="block">
        <span className="mb-1 block font-[family-name:var(--font-bricolage)] text-sm font-semibold">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </label>
      {state.error && <p role="alert" className="rounded-lg bg-[#fde8e1] px-3 py-2 text-[#9a3412]">{state.error}</p>}
      <button
        disabled={pending}
        className="w-full rounded-full bg-[#ee7454] px-6 py-3 font-[family-name:var(--font-bricolage)] text-lg font-semibold text-white hover:bg-[#e0603f] disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
