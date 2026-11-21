// Formatting helpers shared by the audit-simulation UI on /map.

const inrFull = new Intl.NumberFormat("en-IN");

export function formatInr(value: number): string {
  return `₹${inrFull.format(Math.round(value))}`;
}

// Indian short money: ₹1.24 Cr / ₹45.2 L / ₹9,800
export function formatInrShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)} L`;
  return `₹${inrFull.format(Math.round(value))}`;
}

export function pct(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export const FLAG_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  DLP_VIOLATION: {
    label: "Warranty ignored",
    className: "bg-[#fdeae4] text-[#b23a1d]",
  },
  OVERBILLED: {
    label: "Overcharged",
    className: "bg-[#fdf3d7] text-[#8a6116]",
  },
  DOUBLE_BILLED: {
    label: "Billed twice",
    className: "bg-[#ece4f7] text-[#5b3a99]",
  },
};

// Short tooltip explanations for the badges, in everyday words.
export const FLAG_HELP: Record<string, string> = {
  DLP_VIOLATION:
    "This road was still under the contractor's free-repair warranty (DLP), so BMC shouldn't have paid for the fix at all.",
  OVERBILLED:
    "The bill is more than 30% above the government rate card for this kind of repair.",
  DOUBLE_BILLED:
    "The same road and same work was billed again within 7 days, with no citizen complaint to explain it.",
};
