import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Demo login for ward officers and BMC admins (hackathon prototype).
// Passwords are demo values; in production this would be BMC single sign-on, never passwords in code.
// Set ADMIN_SECRET on Vercel so session cookies cannot be forged.

export type Role = "ward_officer" | "bmc_admin";
export type User = { username: string; name: string; role: Role; ward?: string };

// Single demo login for now (admin / test123), sees all wards. Ward-officer accounts can be added here later.
const USERS: (User & { password: string })[] = [
  { username: "admin", password: "test123", name: "BMC Admin", role: "bmc_admin" },
];

const COOKIE = "ftr-session";
const MAX_AGE = 8 * 60 * 60; // 8 hours
const SECRET = process.env.ADMIN_SECRET || "dev-only-secret-change-me";

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => createHmac("sha256", SECRET).update(payload).digest("base64url");

export function checkLogin(username: string, password: string): User | null {
  const u = USERS.find((x) => x.username === username.trim().toLowerCase());
  if (!u) return null;
  const a = Buffer.from(password), b = Buffer.from(u.password);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const { password: _pw, ...user } = u;
  void _pw;
  return user;
}

export async function startSession(user: User) {
  const payload = b64(JSON.stringify({ u: user.username, exp: Date.now() + MAX_AGE * 1000 }));
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

// The signed-in user, or null. Call inside <Suspense> (cookies are request data).
export async function getUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const good = Buffer.from(sign(payload)), got = Buffer.from(sig);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp < Date.now()) return null;
    const user = USERS.find((x) => x.username === u);
    if (!user) return null;
    const { password: _pw, ...rest } = user;
    void _pw;
    return rest;
  } catch {
    return null;
  }
}
