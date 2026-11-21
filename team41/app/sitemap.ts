import type { MetadataRoute } from "next";
import { promises as fs } from "fs";
import path from "path";
import { wardSlug } from "@/lib/rupee";

// Set NEXT_PUBLIC_SITE_URL in production so /sitemap.xml carries absolute URLs.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const LAST_UPDATED = new Date();

const STATIC_ROUTES: { path: string; priority: number; frequency: "daily" | "weekly" }[] = [
  { path: "/", priority: 1, frequency: "daily" },
  { path: "/map", priority: 0.9, frequency: "daily" },
  { path: "/audit", priority: 0.9, frequency: "daily" },
  { path: "/contractors", priority: 0.8, frequency: "weekly" },
  { path: "/heatmap", priority: 0.8, frequency: "weekly" },
  { path: "/plan", priority: 0.8, frequency: "weekly" },
  { path: "/track", priority: 0.7, frequency: "daily" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: LAST_UPDATED,
    changeFrequency: r.frequency,
    priority: r.priority,
  }));

  // Ward report pages (/ward/[code]): slugs come straight from data/wards.csv
  // (ward codes contain "/" — e.g. F/S — URLs use "-", e.g. F-S). Read from the
  // repo's CSV so the sitemap works at build time without touching the database.
  const csv = await fs.readFile(path.join(process.cwd(), "data", "wards.csv"), "utf8");
  const wards = csv
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[0].trim())
    .filter((code) => code.length > 0 && code.length <= 4);

  return pages.concat(
    wards.map((code) => ({
      url: `${SITE_URL}/ward/${wardSlug(code)}`,
      lastModified: LAST_UPDATED,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }))
  );
}
