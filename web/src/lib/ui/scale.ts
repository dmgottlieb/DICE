/** Linear scales and "nice" axis ticks. */

export function niceStep(span: number, target: number): number {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const r = raw / mag;
  const nice = r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10;
  return nice * mag;
}

/** Extend [lo, hi] to multiples of a nice step and list the ticks. */
export function niceDomain(lo: number, hi: number, target = 5): { lo: number; hi: number; step: number; ticks: number[] } {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 0; hi = 1; }
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) { const d = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1; lo -= d; hi += d; }
  const step = niceStep(hi - lo, target);
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return { lo: a, hi: b, step, ticks };
}

export const linear = (d0: number, d1: number, r0: number, r1: number) =>
  (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
