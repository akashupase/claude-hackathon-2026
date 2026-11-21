"use client";

import { tr } from "@/lib/i18n";
import { useLang } from "@/lib/lang-client";

// Placeholder for menu pages that are not built yet.
export default function ComingNext() {
  const T = tr(useLang());
  return <p className="rounded-2xl bg-white p-6 text-lg shadow-[0_0_0_1px_rgba(43,48,51,.14)]">{T("soon")}</p>;
}
