import Link from "next/link";

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

export default function SiteHeader({ current }: { current?: "map" }) {
  const link =
    "flex h-10 items-center rounded-lg px-1 text-[15px] font-medium hover:text-[#ee7454] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ee7454]";
  return (
    <header className="relative z-20 flex h-16 flex-none items-center gap-4 bg-white px-5 shadow-[0_1px_0_rgba(43,48,51,.14),0_8px_18px_-14px_rgba(0,0,0,.28)] sm:h-20 sm:px-[max(20px,6%)]">
      <Link
        href="/"
        className="flex items-center gap-[9px] font-[family-name:var(--font-newsreader)] text-[22px] leading-none tracking-[-.01em] text-[#2b3033] sm:text-[25px]"
        aria-label="Follow the Rupee, home"
      >
        <Mark />
        <span>Follow the Rupee</span>
      </Link>
      <nav
        className="ml-auto flex items-center font-[family-name:var(--font-bricolage)] text-[#2b3033] sm:ml-[clamp(28px,6%,76px)] sm:mr-auto"
        aria-label="Main"
      >
        <Link href="/" className={link}>
          Home
        </Link>
        <span
          className="mx-4 h-7 border-l-2 border-dotted border-[rgba(43,48,51,.14)] sm:mx-[26px]"
          aria-hidden="true"
        />
        <Link
          href="/map"
          className={link + (current === "map" ? " text-[#ee7454]" : "")}
          aria-current={current === "map" ? "page" : undefined}
        >
          Ward map
        </Link>
      </nav>
    </header>
  );
}
