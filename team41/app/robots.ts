import type { MetadataRoute } from "next";

// Set NEXT_PUBLIC_SITE_URL in production (e.g. https://follow-the-rupee.vercel.app)
// so /robots.txt advertises the real /sitemap.xml address.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// AI crawlers we explicitly welcome (ChatGPT, Claude, Perplexity, Gemini, ...).
// They get their own rules group so a later tightening of "*" won't lock them out.
const AI_CRAWLERS = [
  "GPTBot", // OpenAI model training
  "OAI-SearchBot", // ChatGPT search
  "ChatGPT-User", // live browsing by ChatGPT users
  "ClaudeBot", // Anthropic model training
  "Claude-User", // live browsing by Claude users
  "Claude-SearchBot", // Claude search
  "PerplexityBot", // Perplexity index
  "Perplexity-User", // live browsing by Perplexity users
  "Google-Extended", // Gemini
  "Applebot-Extended", // Apple Intelligence
  "CCBot", // Common Crawl corpus
  "meta-externalagent", // Meta AI
  "Amazonbot", // Alexa
  "MistralAI-User", // Mistral Le Chat
  "YouBot", // You.com
  "DuckAssistBot", // DuckDuckGo AI
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Search engines: index the pages, skip the dashboard and raw JSON endpoints.
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/"],
      },
      {
        // AI agents: same page rules, but the public JSON APIs stay open to them
        // (see /llms.txt for the endpoint guide).
        userAgent: AI_CRAWLERS,
        allow: "/",
        disallow: ["/admin", "/api/ai"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
