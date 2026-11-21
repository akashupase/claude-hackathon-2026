"use server";

import { redirect } from "next/navigation";
import { checkLogin, endSession, startSession } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const user = checkLogin(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!user) return { error: "Wrong username or password." };
  await startSession(user);
  redirect("/admin");
}

export async function logout() {
  await endSession();
  redirect("/admin/login");
}
