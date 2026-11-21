import Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/lib/auth";
import { ANALYSE_PROMPT, SYSTEM_PROMPT, buildContext } from "@/lib/ai-context";
import { loadRupee } from "@/lib/rupee";

// POST /api/ai  { mode: "analyse" | "chat", ward?: "R/N", messages?: [{role, content}], contracts?: [...] }
// Signed-in officials only. Streams plain text back. Needs ANTHROPIC_API_KEY on the server.

type ChatTurn = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Please sign in again.", { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return new Response("AI is not set up yet: add ANTHROPIC_API_KEY to the server environment.", { status: 503 });
  }

  let body: { mode?: string; ward?: string; messages?: ChatTurn[]; contracts?: unknown[] };
  try { body = await req.json(); } catch { return new Response("Bad request.", { status: 400 }); }

  const D = await loadRupee();
  // Ward officers are limited to their own ward; admins may pick any ward or the whole city.
  const ward = user.role === "ward_officer" ? user.ward : D.wards.some((w) => w.ward_code === body.ward) ? body.ward : undefined;

  const turns: ChatTurn[] = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (body.mode === "analyse") turns.splice(0, turns.length, { role: "user", content: ANALYSE_PROMPT });
  if (!turns.length || turns[turns.length - 1].role !== "user") return new Response("Ask a question first.", { status: 400 });

  // The officer's own contracts (saved in their browser) go in as data on the first user turn, not in the cached system prompt.
  const contracts = Array.isArray(body.contracts) ? JSON.stringify(body.contracts).slice(0, 20000) : "";
  if (contracts && contracts !== "[]") {
    turns[0] = { role: "user", content: `<officer_contracts>\n${contracts}\n</officer_contracts>\n\n${turns[0].content}` };
  }

  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if the model declines, the API retries on a fallback model in the same call
    output_config: { effort: body.mode === "analyse" ? "medium" : "low" },
    system: [
      { type: "text", text: SYSTEM_PROMPT },
      { type: "text", text: `<data scope="${ward ?? "all wards"}">\n${buildContext(D, ward)}\n</data>`, cache_control: { type: "ephemeral" } },
    ],
    messages: turns,
  });

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n(The AI declined to answer this one. Try rephrasing.)"));
        if (final.stop_reason === "max_tokens") controller.enqueue(encoder.encode("\n\n(Answer cut short.)"));
      } catch (err) {
        const msg =
          err instanceof Anthropic.AuthenticationError ? "The AI key is not valid."
          : err instanceof Anthropic.RateLimitError ? "The AI is busy. Try again in a minute."
          : err instanceof Anthropic.APIError ? `AI error (${err.status ?? "network"}).`
          : "Something went wrong talking to the AI.";
        controller.enqueue(encoder.encode(`\n\n${msg}`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
