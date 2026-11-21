"use client";

import { useEffect, useState } from "react";
import { COOKIE, isLang, type Lang } from "./i18n";

export function readLangCookie(): Lang {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  const v = m ? decodeURIComponent(m[1]) : "en";
  return isLang(v) ? v : "en";
}

export function setLangCookie(lang: Lang) {
  document.cookie = `${COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(COOKIE));
}

// Current language in client components; updates when the switcher changes it.
export function useLang(): Lang {
  const [lang, setLang] = useState<Lang>("en");
  useEffect(() => {
    const read = () => setLang(readLangCookie());
    // Deferred so we don't set state synchronously in the effect (post-hydration read).
    const t = window.setTimeout(() => {
      // A ?lang=hi link wins over the saved choice (and is saved for next time).
      const q = new URLSearchParams(window.location.search).get("lang");
      if (isLang(q)) {
        if (q !== readLangCookie()) document.cookie = `${COOKIE}=${q}; path=/; max-age=31536000; samesite=lax`;
        setLang(q);
      } else read();
    }, 0);
    window.addEventListener(COOKIE, read);
    return () => { window.clearTimeout(t); window.removeEventListener(COOKIE, read); };
  }, []);
  return lang;
}
