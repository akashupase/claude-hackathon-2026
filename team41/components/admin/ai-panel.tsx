"use client";

import { useRef, useState } from "react";

// "Analyse with AI" + a chatbot for officials. Talks to /api/ai (Claude), which streams plain text.

type Turn = { role: "user" | "assistant"; content: string };
const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]";
const SUGGESTIONS = [
  "Which contractor should we stop giving work to, and why?",
  "Which flagged bills should I hold first?",
  "Why are deadlines being missed here?",
  "Where should the remaining budget go?",
];

function contractsFromBrowser(): unknown[] {
  try { return JSON.parse(localStorage.getItem("ftr-admin-contracts") ?? "[]"); } catch { return []; }
}

async function streamAI(body: object, onText: (t: string) => void): Promise<void> {
  const res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) { onText(await res.text().catch(() => "The AI could not be reached.")); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(dec.decode(value, { stream: true }));
  }
}

// Light formatting for the AI's markdown: **bold**, "- " bullets and "1. " lists, kept as plain text otherwise.
function Formatted({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 leading-relaxed">
      {text.split("\n").map((line, i) => {
        const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, k) => (p.startsWith("**") && p.endsWith("**") ? <b key={k}>{p.slice(2, -2)}</b> : <span key={k}>{p}</span>));
        if (/^#{1,4}\s/.test(line)) return <div key={i} className={`${B} pt-2 font-semibold`}>{bold(line.replace(/^#{1,4}\s/, ""))}</div>;
        if (/^\s*[-*]\s/.test(line)) return <div key={i} className="pl-4 -indent-3">• {bold(line.replace(/^\s*[-*]\s/, ""))}</div>;
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <div key={i}>{bold(line)}</div>;
      })}
    </div>
  );
}

export default function AIPanel({ ward, scopeLabel }: { ward?: string; scopeLabel: string }) {
  const [analysis, setAnalysis] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [chat, setChat] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function analyse() {
    setAnalysis(""); setAnalysing(true);
    await streamAI({ mode: "analyse", ward, contracts: contractsFromBrowser() }, (t) => setAnalysis((a) => a + t));
    setAnalysing(false);
  }

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history: Turn[] = [...chat, { role: "user", content: question }];
    setChat([...history, { role: "assistant", content: "" }]);
    setInput(""); setBusy(true);
    await streamAI({ mode: "chat", ward, messages: history, contracts: contractsFromBrowser() }, (t) => {
      setChat((c) => { const n = [...c]; n[n.length - 1] = { role: "assistant", content: n[n.length - 1].content + t }; return n; });
      endRef.current?.scrollIntoView({ block: "nearest" });
    });
    setBusy(false);
  }

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={`${B} text-[clamp(22px,2.4vw,30px)] font-semibold tracking-[-.02em]`}>AI assistant</h2>
        <span className="text-sm text-[#4a4f52]">Looking at: {scopeLabel} · answers come from this tool&apos;s data</span>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        {/* Analyse with AI */}
        <div className={`${CARD} flex flex-col`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className={`${B} text-lg font-semibold`}>Analyse with AI</h3>
              <p className="text-sm text-[#4a4f52]">Top problems, money at risk, and what to do this week.</p>
            </div>
            <button onClick={analyse} disabled={analysing}
              className={`${B} flex-none rounded-full bg-[#ee7454] px-5 py-2 font-semibold text-white hover:bg-[#e0603f] disabled:opacity-60`}>
              {analysing ? "Analysing…" : analysis ? "Run again" : "Analyse"}
            </button>
          </div>
          <div className="mt-4 min-h-[160px] flex-1 rounded-xl bg-[#faf3eb] p-4 text-[15px]">
            {analysis ? <Formatted text={analysis} /> : (
              <p className="text-[#4a4f52]">{analysing ? "Reading the data…" : "Click Analyse to get a short briefing for this scope."}</p>
            )}
          </div>
        </div>

        {/* Chatbot */}
        <div className={`${CARD} flex flex-col`}>
          <h3 className={`${B} text-lg font-semibold`}>Ask a question</h3>
          <div className="mt-3 max-h-[420px] min-h-[160px] flex-1 space-y-3 overflow-y-auto rounded-xl bg-[#faf3eb] p-4 text-[15px]">
            {chat.length === 0 && (
              <div className="space-y-2">
                <p className="text-[#4a4f52]">Try one of these:</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="block w-full rounded-lg bg-white px-3 py-2 text-left shadow-[0_0_0_1px_rgba(43,48,51,.12)] hover:text-[#ee7454]">{s}</button>
                ))}
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={m.role === "user" ? "max-w-[85%] rounded-2xl rounded-br-sm bg-[#2b3033] px-3.5 py-2 text-white" : "max-w-full"}>
                  {m.role === "user" ? m.content : m.content ? <Formatted text={m.content} /> : <span className="text-[#4a4f52]">Thinking…</span>}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-3 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about contractors, bills, wards…" aria-label="Your question"
              className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 shadow-[0_0_0_1px_rgba(43,48,51,.2)] outline-none focus:shadow-[0_0_0_2px_#ee7454]" />
            <button disabled={busy || !input.trim()} className={`${B} flex-none rounded-full bg-[#2b3033] px-5 py-2.5 font-semibold text-white disabled:opacity-50`}>
              {busy ? "…" : "Send"}
            </button>
          </form>
          {chat.length > 0 && <button onClick={() => setChat([])} className="mt-2 self-start text-sm text-[#4a4f52] underline">Clear chat</button>}
        </div>
      </div>
      <p className="mt-3 text-sm text-[#4a4f52]">AI answers can be wrong. Check the work orders it cites before acting.</p>
    </section>
  );
}
