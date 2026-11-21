"use client";

import SketchCityHero from "@/components/ui/sketch-city-hero";
import SiteHeader from "@/components/site-header";
import { tr } from "@/lib/i18n";
import { useLang } from "@/lib/lang-client";

// Home = the shared header + menu bar, then Ansh's illustrated hero, unchanged.
// Only the hero's own top bar is hidden here (CSS below), so every page has the same header.
// Counts come from data/wards.csv, work_orders.csv and complaints.csv.
export default function HomeHero() {
  const lang = useLang();
  const T = tr(lang);
  return (
    <div className="ftr-home flex h-dvh w-full flex-col bg-[#faf3eb]">
      <style>{".ftr-home .sch-bar{display:none!important}"}</style>
      <SiteHeader />
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <SketchCityHero
            key={lang}
            height="100%"
            brand={T("brand")}
            headline={[T("home_h1"), T("home_h2")]}
            stats={[
              { value: 24, label: T("stat_wards") },
              { value: 2499, label: T("stat_jobs") },
              { value: 6501, label: T("stat_complaints") },
            ]}
            blurb={T("home_blurb")}
            desktopSrc="/sketch-city-hero/mumbai-desktop.svg"
            mobileSrc="/sketch-city-hero/mumbai-mobile.svg"
          />
        </div>
      </div>
    </div>
  );
}
