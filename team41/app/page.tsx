import HomeHero from "@/components/home-hero";
import { fontVars } from "@/lib/fonts";

export default function Home() {
  return (
    <div className={`${fontVars} font-[family-name:var(--font-newsreader)] text-[#2b3033]`}>
      <HomeHero />
    </div>
  );
}
