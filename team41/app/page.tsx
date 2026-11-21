import SketchCityHero from "@/components/ui/sketch-city-hero";

// Counts come from data/wards.csv, data/work_orders.csv and data/complaints.csv.
const STATS = [
  { value: 24, label: "wards" },
  { value: 2499, label: "repair jobs" },
  { value: 6501, label: "complaints" },
];

const MENU = [
  { label: "Ward map", href: "/map" },
  { label: "Kurla", href: "/map" },
  { label: "Dharavi", href: "/map" },
  { label: "Colaba", href: "/map" },
];

export default function Home() {
  return (
    <SketchCityHero
      brand="Follow the Rupee"
      menuLabel="Wards"
      menuItems={MENU}
      linkLabel="Open the map"
      linkHref="/map"
      headline={["Every monsoon rupee,", "followed to the road."]}
      stats={STATS}
      blurb="See where each Mumbai ward's road-repair money went, whether the fix lasted, and where the next rupee should go. Synthetic data, real questions."
      desktopSrc="/sketch-city-hero/mumbai-desktop.svg"
      mobileSrc="/sketch-city-hero/mumbai-mobile.svg"
    />
  );
}
