"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LangSwitcher from "@/components/lang-switcher";
import { tr, type Key } from "@/lib/i18n";
import { useLang } from "@/lib/lang-client";

// Shared top bar, styled to match the landing hero (components/ui/sketch-city-hero.tsx).
function Mark() {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-[30px] flex-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 9.5 11 7l10 3 7-2.5v15.5L21 25.5l-10-3L4 25z" />
      <path d="M11 7v15.5M21 10v15.5" />
      <path
        d="M16 19.5s-4-3.6-4-6.6a4 4 0 0 1 8 0c0 3-4 6.6-4 6.6z"
        fill="#ee7454"
        stroke="#2b3033"
      />
      <circle cx="16" cy="12.9" r="1.2" fill="#faf3eb" stroke="none" />
    </svg>
  );
}

// Top menu: one page per element. Add new pages here.
export const MENU: { href: string; key: Key; match: (p: string) => boolean }[] = [
  { href: "/", key: "nav_home", match: (p) => p === "/" },
  { href: "/map", key: "nav_map", match: (p) => p.startsWith("/map") },
  { href: "/wards", key: "nav_wards", match: (p) => p.startsWith("/ward") },
  { href: "/audit", key: "nav_audit", match: (p) => p.startsWith("/audit") },
  { href: "/plan", key: "nav_plan", match: (p) => p.startsWith("/plan") },
  { href: "/contractors", key: "nav_contractors", match: (p) => p.startsWith("/contractors") },
  { href: "/people", key: "nav_people", match: (p) => p.startsWith("/people") },
  { href: "/flood", key: "nav_flood", match: (p) => p.startsWith("/flood") },
  { href: "/track", key: "nav_track", match: (p) => p.startsWith("/track") },
];

function NavList({ path, T }: { path: string | null; T: (k: Key) => string }) {
  return (
    <ul className="flex gap-1 overflow-x-auto py-1.5 font-[family-name:var(--font-bricolage)] [scrollbar-width:none]">
      {MENU.map((m) => {
        const on = path !== null && m.match(path);
        return (
          <li key={m.href} className="flex-none">
            <Link
              href={m.href}
              aria-current={on ? "page" : undefined}
              className={`block whitespace-nowrap rounded-full px-3.5 py-1.5 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454] ${
                on ? "bg-[#ee7454] text-white" : "text-[#2b3033] hover:bg-[rgba(238,116,84,.12)] hover:text-[#c2410c]"
              }`}
            >
              {T(m.key)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// usePathname() is request data in Next 16, so it lives in its own Suspense boundary.
function ActiveNav({ T }: { T: (k: Key) => string }) {
  return <NavList path={usePathname() ?? "/"} T={T} />;
}

// `current` is kept so existing pages compile; the active item comes from the URL.
export default function SiteHeader({}: { current?: string }) {
  const lang = useLang();
  const T = tr(lang);
  return (
    <header className="relative z-20 flex-none bg-white shadow-[0_1px_0_rgba(43,48,51,.14),0_8px_18px_-14px_rgba(0,0,0,.28)]">
      <div className="flex h-14 items-center gap-4 px-5 sm:h-16 sm:px-[max(20px,6%)]">
        <Link
          href="/"
          className="flex items-center gap-[9px] font-[family-name:var(--font-newsreader)] text-[21px] leading-none tracking-[-.01em] text-[#2b3033] sm:text-[24px]"
          aria-label={T("brand")}
        >
          <Mark />
          <span>{T("brand")}</span>
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/admin" className="hidden rounded-full px-3 py-1.5 font-[family-name:var(--font-bricolage)] text-sm font-semibold text-[#2b3033] shadow-[0_0_0_1px_rgba(43,48,51,.18)] hover:text-[#ee7454] sm:block">
            Officer login
          </Link>
          <LangSwitcher lang={lang} />
        </div>
      </div>
      <nav aria-label={T("menu")} className="border-t border-[rgba(43,48,51,.08)] px-3 sm:px-[max(12px,calc(6%-8px))]">
        <Suspense fallback={<NavList path={null} T={T} />}>
          <ActiveNav T={T} />
        </Suspense>
      </nav>
    </header>
  );
}
