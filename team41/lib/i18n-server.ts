import { cookies } from "next/headers";
import { COOKIE, isLang, type Lang } from "./i18n";

// Call inside a <Suspense> boundary (cookies are request data).
// A ?lang= value from the URL (pass searchParams.lang) wins over the saved cookie.
export async function getLang(fromUrl?: unknown): Promise<Lang> {
  const u = Array.isArray(fromUrl) ? fromUrl[0] : fromUrl;
  if (isLang(u)) return u;
  const v = (await cookies()).get(COOKIE)?.value;
  return isLang(v) ? v : "en";
}
