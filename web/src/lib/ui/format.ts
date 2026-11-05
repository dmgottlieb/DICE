/** Number formatting for labels, tiles and tooltips. */

export function formatNumber(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 10000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 100) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (a >= 10) return v.toFixed(Math.min(digits, 1));
  return v.toFixed(digits);
}

/** Compact form for axis ticks: 0 / 500 / 1,000 / 10K / 1.5M. */
export function formatTick(v: number, step: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${trim(v / 1e6, step / 1e6)}M`;
  if (a >= 1e4) return `${trim(v / 1e3, step / 1e3)}K`;
  return trim(v, step).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function trim(v: number, step: number): string {
  // As many decimals as the step needs (0.25 -> 2, 0.5 -> 1, 100 -> 0).
  const frac = String(+step.toPrecision(6)).split(".")[1] ?? "";
  const decimals = Math.min(6, frac.length);
  const s = v.toFixed(decimals);
  return s === "-0" || /^-0\.0*$/.test(s) ? s.slice(1) : s;
}

export const formatSigned = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
