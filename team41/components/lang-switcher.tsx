"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LANGS, isLang, type Lang } from "@/lib/i18n";
import { readLangCookie, setLangCookie, useLang } from "@/lib/lang-client";

// EN / हिंदी / मराठी. Saves a cookie and re-renders server pages in the new language.
export default function LangSwitcher({ lang: given }: { lang?: Lang }) {
  const own = useLang();
  const lang = given ?? own;
  const router = useRouter();
  // ?lang=hi in a link sets the language for this visitor, then re-renders server parts in it.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (isLang(q) && q !== readLangCookie()) { setLangCookie(q); router.refresh(); }
  }, [router]);
  return (
    <div role="group" aria-label="Language" className="flex flex-none items-center gap-1 rounded-full bg-[rgba(43,48,51,.06)] p-1">
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={lang === l.code}
          onClick={() => { setLangCookie(l.code); router.refresh(); }}
          className={`rounded-full px-2.5 py-1 font-[family-name:var(--font-bricolage)] text-[13px] font-semibold leading-none ${
            lang === l.code ? "bg-[#2b3033] text-white" : "text-[#2b3033] hover:text-[#ee7454]"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
