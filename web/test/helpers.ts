import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { DEFAULT, type Params } from "../src/lib/dice/params";
import { PRESETS } from "../src/lib/ui/presets";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..", "..");

export function readJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(resolve(ROOT, path), "utf8"));
}

export type Series = (number | null)[];
export interface GamsReference { series: Record<string, Series>; scalars: Record<string, number>; years: number[] }

export function loadGams(scenario: string): GamsReference {
  const ref = readJson<GamsReference>(`reference/gams_${scenario}.json`);
  ref.series.RI = [...ref.series.RI];
  ref.series.RI[ref.series.RI.length - 1] = null; // GAMS prints the undefined last-period rate as 0
  return ref;
}

/** Parameters reproducing each GAMS sheet (see python/tests/conftest.py). */
export const SCENARIO_PARAMS: Record<string, Params> = {
  base: { ...DEFAULT },
  ...Object.fromEntries(PRESETS.map((p) => [p.id, p.params])),
};

const toNum = (v: number | null | undefined) => (v === null || v === undefined ? NaN : v);

/** Elementwise |a - e| <= atol + rtol |e|; NaN matches NaN. Reports the worst period. */
export function expectSeriesClose(
  actual: ArrayLike<number | null>, expected: ArrayLike<number | null>, name: string,
  { rtol = 1e-8, atol = 1e-10, from = 0, to }: { rtol?: number; atol?: number; from?: number; to?: number } = {},
) {
  const end = to ?? expected.length;
  expect(actual.length, `${name} length`).toBe(expected.length);
  let worst = -Infinity, worstI = -1, bad = 0;
  for (let i = from; i < end; i++) {
    const a = toNum(actual[i]), e = toNum(expected[i]);
    if (Number.isNaN(a) && Number.isNaN(e)) continue;
    const excess = Math.abs(a - e) - (atol + rtol * Math.abs(e));
    if (!(excess <= 0)) bad++;
    if (Number.isNaN(excess) || excess > worst) { worst = Number.isNaN(excess) ? Infinity : excess; worstI = i; }
  }
  if (bad > 0) {
    const a = actual[worstI], e = expected[worstI];
    throw new Error(`${name}: ${bad} periods out of tolerance; worst at period ${worstI + 1}: actual=${a} expected=${e}`);
  }
}

export const maxAbs = (xs: ArrayLike<number | null>) => {
  let m = 0;
  for (let i = 0; i < xs.length; i++) { const v = toNum(xs[i]); if (Number.isFinite(v)) m = Math.max(m, Math.abs(v)); }
  return m;
};
