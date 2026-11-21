import { Bricolage_Grotesque, Inter, Newsreader } from "next/font/google";

// Shared fonts for every page (same as the landing hero and the ward map).
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", weight: ["500", "600", "700", "800"] });
export const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", weight: "400" });
export const fontVars = `${bricolage.variable} ${newsreader.variable}`;

// Plain sans for data-heavy pages (e.g. /audit).
export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
