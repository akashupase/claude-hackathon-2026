"use client";

import { useEffect, useMemo, useState } from "react";

// Officer workspace: add contracts and track complaints. Edits are saved in this browser
// (localStorage) for the demo; a shared database would replace load/save below.

export type AdminComplaint = { id: string; ward: string; date: string; issue: string; text: string; status: string };
export type AdminData = {
  wards: { code: string; name: string }[];
  contractors: string[];
  roads: { ward: string; name: string }[];
  workTypes: string[];
  complaints: AdminComplaint[];
  lockedWard?: string; // ward officers only see their ward
};

type Contract = {
  id: string; name: string; contractor: string; ward: string; road: string; workType: string;
  amount: number; start: string; deadline: string; status: ContractStatus; progress: number; created: string;
  docs?: Doc[];
};
type Doc = { id: string; name: string; size: number; type: string };
const MAX_FILE = 10 * 1024 * 1024; // 10 MB
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg";

// Uploaded files live in IndexedDB (localStorage is too small for PDFs). Same browser only.
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("ftr-admin", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function fileOp<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((res, rej) => {
    const req = fn(db.transaction("files", mode).objectStore("files"));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
const putFile = (id: string, f: Blob) => fileOp("readwrite", (s) => s.put(f, id));
const getFile = (id: string) => fileOp<Blob | undefined>("readonly", (s) => s.get(id));
const delFile = (id: string) => fileOp("readwrite", (s) => s.delete(id));
async function storeFiles(prefix: string, files: File[]): Promise<Doc[]> {
  const docs: Doc[] = [];
  for (const f of files) {
    const id = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await putFile(id, f);
    docs.push({ id, name: f.name, size: f.size, type: f.type });
  }
  return docs;
}
async function openDoc(d: Doc) {
  const blob = await getFile(d.id);
  if (!blob) return alert("This file is no longer stored in this browser.");
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const tooBig = (files: File[]) => files.find((f) => f.size > MAX_FILE);
type ContractStatus = "Not started" | "In progress" | "Completed" | "On hold";
const CONTRACT_STATUS: ContractStatus[] = ["Not started", "In progress", "Completed", "On hold"];

const STAGES = ["Received", "Assigned", "Work started", "Repaired", "Verified"] as const;
type Stage = (typeof STAGES)[number];
const stageFromData = (s: string): Stage => (s === "In Progress" ? "Work started" : "Received");

const K_CONTRACTS = "ftr-admin-contracts";
const K_COMPLAINTS = "ftr-admin-complaint-stage";
function load<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ }
}

const B = "font-[family-name:var(--font-bricolage)]";
const CARD = "rounded-2xl bg-white p-5 shadow-[0_0_0_1px_rgba(43,48,51,.14),0_18px_40px_-24px_rgba(0,0,0,.35)]";
const BOX = "rounded-lg bg-white px-3 py-2 shadow-[0_0_0_1px_rgba(43,48,51,.2)] outline-none focus:shadow-[0_0_0_2px_#ee7454]";
const FIELD = `w-full ${BOX}`;
const inr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} lakh` : `₹${Math.round(n).toLocaleString("en-IN")}`);

export default function AdminWorkspace({ data }: { data: AdminData }) {
  const [tab, setTab] = useState<"contracts" | "complaints">("contracts");
  return (
    <div className="mt-8">
      <div role="tablist" className="flex gap-2">
        {([["contracts", "Contracts"], ["complaints", "Complaints"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`${B} rounded-full px-5 py-2 text-[16px] font-semibold ${tab === k ? "bg-[#2b3033] text-white" : "bg-white shadow-[0_0_0_1px_rgba(43,48,51,.16)] hover:text-[#ee7454]"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">{tab === "contracts" ? <Contracts data={data} /> : <Complaints data={data} />}</div>
      <p className="mt-6 text-sm text-[#4a4f52]">Prototype: additions and edits are saved in this browser only.</p>
    </div>
  );
}

/* ---------------- Contracts ---------------- */
function Contracts({ data }: { data: AdminData }) {
  const [list, setList] = useState<Contract[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Deferred so we don't set state synchronously in the effect (post-hydration read).
    const t = window.setTimeout(() => { setList(load<Contract[]>(K_CONTRACTS, [])); setReady(true); }, 0);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => { if (ready) save(K_CONTRACTS, list); }, [list, ready]);

  const firstWard = data.lockedWard ?? data.wards[0]?.code ?? "";
  const blank = { name: "", contractor: data.contractors[0] ?? "", ward: firstWard, road: "", workType: data.workTypes[0] ?? "", amount: "", start: "", deadline: "" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileKey, setFileKey] = useState(0); // resets the file input after adding
  const roads = useMemo(() => data.roads.filter((r) => r.ward === f.ward), [data.roads, f.ward]);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Give the contract a name.");
    if (!f.amount || Number(f.amount) <= 0) return setErr("Enter the contract amount in rupees.");
    if (f.start && f.deadline && f.deadline < f.start) return setErr("The deadline is before the start date.");
    const big = tooBig(files);
    if (big) return setErr(`“${big.name}” is larger than 10 MB.`);
    setErr("");
    const id = `CT-${Date.now().toString(36).toUpperCase()}`;
    let docs: Doc[] = [];
    try { docs = await storeFiles(id, files); } catch { return setErr("Could not save the files in this browser."); }
    const c: Contract = {
      id, docs, name: f.name.trim(), contractor: f.contractor, ward: f.ward,
      road: f.road, workType: f.workType, amount: Number(f.amount), start: f.start, deadline: f.deadline,
      status: "Not started", progress: 0, created: new Date().toISOString().slice(0, 10),
    };
    setList((prev) => [c, ...prev]);
    setF({ ...blank, ward: f.ward });
    setFiles([]);
    setFileKey((k) => k + 1);
  }
  const update = (id: string, patch: Partial<Contract>) => setList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const visible = list.filter((c) => !data.lockedWard || c.ward === data.lockedWard);

  return (
    <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
      <form onSubmit={add} className={`${CARD} space-y-3 self-start`}>
        <h2 className={`${B} text-xl font-semibold`}>Add a new contract</h2>
        <Label text="Contract name"><input className={FIELD} value={f.name} onChange={set("name")} placeholder="e.g. SV Road pothole repairs, Phase 2" /></Label>
        <Label text="Contractor"><select className={FIELD} value={f.contractor} onChange={set("contractor")}>{data.contractors.map((c) => <option key={c}>{c}</option>)}</select></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Ward">
            <select className={FIELD} value={f.ward} onChange={(e) => setF({ ...f, ward: e.target.value, road: "" })} disabled={!!data.lockedWard}>
              {data.wards.map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name}</option>)}
            </select>
          </Label>
          <Label text="Road">
            <select className={FIELD} value={f.road} onChange={set("road")}>
              <option value="">Whole ward</option>
              {roads.map((r) => <option key={r.name}>{r.name}</option>)}
            </select>
          </Label>
        </div>
        <Label text="Type of work"><select className={FIELD} value={f.workType} onChange={set("workType")}>{data.workTypes.map((w) => <option key={w}>{w}</option>)}</select></Label>
        <Label text="Amount (₹)"><input className={FIELD} type="number" min={1} step={1} value={f.amount} onChange={set("amount")} placeholder="250000" /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Start date"><input className={FIELD} type="date" value={f.start} onChange={set("start")} /></Label>
          <Label text="Deadline"><input className={FIELD} type="date" value={f.deadline} onChange={set("deadline")} /></Label>
        </div>
        <Label text="Tender and documents">
          <input key={fileKey} type="file" multiple accept={ACCEPT}
            onChange={(e) => setFiles([...(e.target.files ?? [])])}
            className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#2b3033] file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-[#ee7454]" />
          <span className="mt-1 block text-xs text-[#4a4f52]">PDF, Word, Excel or images, up to 10 MB each. You can add more later.</span>
          {files.length > 0 && <ul className="mt-2 space-y-1 text-sm">{files.map((x) => <li key={x.name}>📎 {x.name} <span className="text-[#4a4f52]">· {kb(x.size)}</span></li>)}</ul>}
        </Label>
        {err && <p role="alert" className="rounded-lg bg-[#fde8e1] px-3 py-2 text-[#9a3412]">{err}</p>}
        <button className={`${B} w-full rounded-full bg-[#ee7454] px-5 py-2.5 text-lg font-semibold text-white hover:bg-[#e0603f]`}>Add contract</button>
      </form>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className={`${B} text-xl font-semibold`}>Contracts ({visible.length})</h2>
          {visible.length > 0 && <span className="text-sm text-[#4a4f52]">Total {inr(visible.reduce((s, c) => s + c.amount, 0))}</span>}
        </div>
        {ready && visible.length === 0 && <div className={`${CARD} text-[#4a4f52]`}>No contracts yet. Add one with the form.</div>}
        {visible.map((c) => (
          <div key={c.id} className={CARD}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className={`${B} text-lg font-semibold leading-tight [overflow-wrap:anywhere]`}>{c.name}</div>
                <div className="text-sm text-[#4a4f52]">{c.id} · {c.contractor} · ward {c.ward}{c.road ? ` · ${c.road}` : ""} · {c.workType}</div>
                <div className="text-sm text-[#4a4f52]">{inr(c.amount)}{c.start ? ` · from ${c.start}` : ""}{c.deadline ? ` · due ${c.deadline}` : ""}</div>
              </div>
              <button onClick={() => { if (confirm(`Delete contract “${c.name}” and its documents?`)) { (c.docs ?? []).forEach((d) => delFile(d.id).catch(() => {})); setList((prev) => prev.filter((x) => x.id !== c.id)); } }}
                className="flex-none text-sm text-[#4a4f52] underline hover:text-[#c2410c]">Delete</button>
            </div>
            <div className="mt-3 grid items-center gap-3 sm:grid-cols-[180px_1fr_52px]">
              <select className={FIELD} value={c.status} aria-label="Status"
                onChange={(e) => { const s = e.target.value as ContractStatus; update(c.id, { status: s, progress: s === "Completed" ? 100 : s === "Not started" ? 0 : c.progress }); }}>
                {CONTRACT_STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <input type="range" min={0} max={100} step={5} value={c.progress} aria-label="Progress" className="accent-[#ee7454]"
                onChange={(e) => { const p = Number(e.target.value); update(c.id, { progress: p, status: p === 100 ? "Completed" : p > 0 && c.status === "Not started" ? "In progress" : c.status }); }} />
              <span className={`${B} text-right font-semibold tabular-nums`}>{c.progress}%</span>
            </div>
            <Bar pct={c.progress} tone={c.status === "On hold" ? "#b45309" : c.progress === 100 ? "#0ca30c" : "#ee7454"} />
            <div className="mt-4 border-t border-dotted border-[rgba(43,48,51,.2)] pt-3">
              <div className={`${B} text-sm font-semibold`}>Tender and documents ({c.docs?.length ?? 0})</div>
              <ul className="mt-1.5 space-y-1">
                {(c.docs ?? []).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">📎 {d.name} <span className="text-[#4a4f52]">· {kb(d.size)}</span></span>
                    <button type="button" onClick={() => openDoc(d)} className="flex-none underline hover:text-[#ee7454]">View</button>
                    <button type="button" onClick={() => { delFile(d.id).catch(() => {}); update(c.id, { docs: (c.docs ?? []).filter((x) => x.id !== d.id) }); }}
                      className="flex-none text-[#4a4f52] underline hover:text-[#c2410c]">Remove</button>
                  </li>
                ))}
              </ul>
              <label className={`${B} mt-2 inline-block cursor-pointer rounded-full px-3 py-1 text-sm font-semibold shadow-[0_0_0_1px_rgba(43,48,51,.2)] hover:text-[#ee7454]`}>
                + Upload document
                <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={async (e) => {
                  const picked = [...(e.target.files ?? [])]; e.target.value = "";
                  if (!picked.length) return;
                  const big = tooBig(picked);
                  if (big) return alert(`“${big.name}” is larger than 10 MB.`);
                  try { const docs = await storeFiles(c.id, picked); update(c.id, { docs: [...(c.docs ?? []), ...docs] }); }
                  catch { alert("Could not save the files in this browser."); }
                }} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Complaints ---------------- */
function Complaints({ data }: { data: AdminData }) {
  const [stage, setStage] = useState<Record<string, Stage>>({});
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => { setStage(load<Record<string, Stage>>(K_COMPLAINTS, {})); setReady(true); }, 0);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => { if (ready) save(K_COMPLAINTS, stage); }, [stage, ready]);

  const [ward, setWard] = useState(data.lockedWard ?? "");
  const [q, setQ] = useState("");
  const [show, setShow] = useState<"all" | Stage>("all");
  const [page, setPage] = useState(1);
  const PER = 15;
  const stageOf = (c: AdminComplaint) => stage[c.id] ?? stageFromData(c.status);

  const rows = data.complaints.filter((c) =>
    (!ward || c.ward === ward) && (show === "all" || stageOf(c) === show) &&
    (!q || c.id.toLowerCase().includes(q.toLowerCase()) || c.text.toLowerCase().includes(q.toLowerCase())));
  const counts = STAGES.map((s) => data.complaints.filter((c) => (!ward || c.ward === ward) && stageOf(c) === s).length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2">
        {STAGES.map((s, i) => (
          <button key={s} onClick={() => { setShow(show === s ? "all" : s); setPage(1); }}
            className={`rounded-xl px-3 py-2 text-left ${show === s ? "bg-[#2b3033] text-white" : "bg-white shadow-[0_0_0_1px_rgba(43,48,51,.12)]"}`}>
            <div className={`${B} text-2xl font-semibold tabular-nums`}>{counts[i]}</div>
            <div className="text-sm">{s}</div>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <select className={`${FIELD} max-w-[260px]`} value={ward} onChange={(e) => { setWard(e.target.value); setPage(1); }} disabled={!!data.lockedWard} aria-label="Ward">
          <option value="">All wards</option>
          {data.wards.map((w) => <option key={w.code} value={w.code}>{w.code} · {w.name}</option>)}
        </select>
        <input className={`${FIELD} max-w-[320px]`} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search complaint number or text" aria-label="Search" />
        <span className="self-center text-sm text-[#4a4f52]">{rows.length} complaints</span>
      </div>

      <div className="space-y-2">
        {rows.slice((page - 1) * PER, page * PER).map((c) => {
          const s = stageOf(c), i = STAGES.indexOf(s);
          return (
            <div key={c.id} className={`${CARD} py-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#4a4f52]"><span className={`${B} font-semibold text-[#2b3033]`}>{c.id}</span> · ward {c.ward} · {c.date} · {c.issue}</div>
                  <div className="mt-0.5 truncate">“{c.text}”</div>
                </div>
                <select className={`${BOX} w-[170px] flex-none`} value={s} aria-label={`Status of ${c.id}`}
                  onChange={(e) => setStage({ ...stage, [c.id]: e.target.value as Stage })}>
                  {STAGES.map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {STAGES.map((x, k) => (
                  <div key={x} className="flex-1">
                    <div className={`h-2 rounded-full ${k <= i ? (i === STAGES.length - 1 ? "bg-[#0ca30c]" : "bg-[#ee7454]") : "bg-[rgba(43,48,51,.12)]"}`} />
                    <div className={`mt-1 hidden text-xs sm:block ${k <= i ? "text-[#2b3033]" : "text-[#9aa3ad]"}`}>{x}</div>
                  </div>
                ))}
                <span className={`${B} w-12 text-right font-semibold tabular-nums`}>{Math.round((i / (STAGES.length - 1)) * 100)}%</span>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className={`${CARD} text-[#4a4f52]`}>No complaints match.</div>}
      </div>
      {rows.length > PER && (
        <div className="flex items-center gap-3">
          <button disabled={page === 1} onClick={() => setPage(page - 1)} className="rounded-full bg-white px-4 py-1.5 shadow-[0_0_0_1px_rgba(43,48,51,.16)] disabled:opacity-40">← Previous</button>
          <span className="text-sm">Page {page} of {Math.ceil(rows.length / PER)}</span>
          <button disabled={page * PER >= rows.length} onClick={() => setPage(page + 1)} className="rounded-full bg-white px-4 py-1.5 shadow-[0_0_0_1px_rgba(43,48,51,.16)] disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return <label className="block"><span className={`${B} mb-1 block text-sm font-semibold`}>{text}</span>{children}</label>;
}
function Bar({ pct, tone }: { pct: number; tone: string }) {
  return <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(43,48,51,.1)]"><div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: tone }} /></div>;
}
