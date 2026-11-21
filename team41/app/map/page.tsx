import { Bricolage_Grotesque, Newsreader } from "next/font/google";
import { connection } from "next/server";
import SiteHeader from "@/components/site-header";
import { loadWardOutlines, loadWards } from "./data";
import WardMap from "./WardMap";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  weight: ["500", "600"],
});
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  weight: "400",
});

export const metadata = {
  title: "Ward map · Follow the Rupee",
  description: "Mumbai BMC ward boundaries (approximate)",
};

export default async function MapPage() {
  // Read the data files per request rather than at build time.
  await connection();
  const [wards, outlines] = await Promise.all([loadWards(), loadWardOutlines()]);

  return (
    <div
      className={`${bricolage.variable} ${newsreader.variable} flex h-dvh w-full flex-col bg-[#faf3eb] font-[family-name:var(--font-newsreader)] text-[#2b3033]`}
    >
      <SiteHeader current="map" />
      <main className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-5 sm:px-[max(20px,6%)] sm:pt-7">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <h1 className="font-[family-name:var(--font-bricolage)] text-[clamp(28px,4.2vw,52px)] font-semibold leading-[.98] tracking-[-.035em]">
            Mumbai, ward by ward.
          </h1>
          <p className="max-w-[27.5em] text-[17px] leading-[1.5] text-[#4a4f52]">
            <span className="text-[#ee7454]">{wards.length}</span> BMC wards,
            drawn from approximate boundaries. Click one to see its numbers.
          </p>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]">
          <WardMap wards={wards} outlines={outlines} />
        </div>
      </main>
    </div>
  );
}
