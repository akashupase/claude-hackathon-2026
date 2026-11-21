"use client";

import { useEffect, useState } from "react";

// Citizens can endorse a contractor for their ward. Stored in this browser only (no shared database in the prototype).
export default function EndorseButton({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    try { setDone(localStorage.getItem(`ftr-endorsed-${id}`) === "1"); } catch { /* storage blocked */ }
  }, [id]);
  return (
    <button
      type="button"
      disabled={done}
      onClick={() => { try { localStorage.setItem(`ftr-endorsed-${id}`, "1"); } catch { /* ignore */ } setDone(true); }}
      className="rounded-full bg-[#ee7454] px-4 py-2 font-[family-name:var(--font-bricolage)] text-sm font-semibold text-white hover:bg-[#e0603f] disabled:bg-[#dcfce7] disabled:text-[#166534]"
    >
      {done ? "You endorsed this contractor" : "Endorse for my ward"}
    </button>
  );
}
