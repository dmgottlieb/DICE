/** Model outputs shown in charts, the data table and the CSV download. */
import type { Solution } from "../dice/solve";
import { formatNumber } from "./format";

export interface Variable {
  id: string;
  label: string;
  unit: string;
  get(sol: Solution): number[];
  format(v: number): string;
  /** Include zero in the chart's y-range. */
  zeroBased: boolean;
}

const arr = (a: ArrayLike<number>, f = (v: number) => v) => Array.from(a, f);
const dollars = (v: number) => "$" + formatNumber(v, 1);
const percent = (digits: number) => (v: number) => v.toFixed(digits) + "%";

export const VARIABLES: Variable[] = [
  { id: "TATM", label: "Atmospheric temperature", unit: "°C above 1900", get: (s) => arr(s.path.TATM), format: (v) => v.toFixed(2), zeroBased: true },
  { id: "EIND", label: "Industrial CO₂ emissions", unit: "Gt CO₂ per year", get: (s) => arr(s.path.EIND), format: (v) => formatNumber(v, 1), zeroBased: true },
  { id: "MIU", label: "Emissions control rate", unit: "% of emissions abated", get: (s) => arr(s.path.MIU, (v) => 100 * v), format: percent(1), zeroBased: true },
  { id: "CPRICE", label: "Carbon price", unit: "$ per t CO₂ (2005 $)", get: (s) => arr(s.path.CPRICE), format: dollars, zeroBased: true },
  { id: "SCC", label: "Social cost of carbon", unit: "$ per t CO₂ (2005 $)", get: (s) => arr(s.scc), format: dollars, zeroBased: true },
  { id: "DAMFRAC", label: "Climate damages", unit: "% of gross output", get: (s) => arr(s.path.DAMFRAC, (v) => 100 * v), format: percent(2), zeroBased: true },
  { id: "ABATE", label: "Abatement cost", unit: "% of gross output", get: (s) => Array.from(s.path.ABATECOST, (v, i) => (100 * v) / s.path.YGROSS[i]), format: percent(2), zeroBased: true },
  { id: "MAT", label: "Atmospheric CO₂ concentration", unit: "ppm", get: (s) => arr(s.path.MAT, (v) => v / 2.13), format: (v) => v.toFixed(0), zeroBased: false },
  { id: "CPC", label: "Consumption per person", unit: "thousand 2005 $ per year", get: (s) => arr(s.path.CPC), format: (v) => formatNumber(v, 2), zeroBased: true },
  { id: "Y", label: "World output (net)", unit: "trillion 2005 $ per year", get: (s) => arr(s.path.Y), format: (v) => formatNumber(v, 1), zeroBased: true },
  { id: "S", label: "Savings rate", unit: "% of output", get: (s) => arr(s.path.S, (v) => 100 * v), format: percent(1), zeroBased: false },
  { id: "RI", label: "Real interest rate", unit: "% per year", get: (s) => arr(s.path.RI, (v) => 100 * v), format: percent(2), zeroBased: false },
];

export const CHART_VARIABLES = ["TATM", "EIND", "MIU", "CPRICE", "SCC", "DAMFRAC"];
export const variable = (id: string) => VARIABLES.find((v) => v.id === id)!;

export interface SeriesSource { id: string; label: string; sol: Solution | null }

/** CSV with one row per (series, year) and one column per variable. */
export function toCsv(sources: SeriesSource[]): string {
  const head = ["series", "year", ...VARIABLES.map((v) => v.id + " (" + v.unit + ")")];
  const rows = [head.map(csvCell).join(",")];
  for (const src of sources) {
    if (!src.sol) continue;
    const cols = VARIABLES.map((v) => v.get(src.sol!));
    src.sol.exogenous.year.forEach((y, i) => {
      rows.push([csvCell(src.label), String(y), ...cols.map((c) => (Number.isFinite(c[i]) ? String(c[i]) : ""))].join(","));
    });
  }
  return rows.join("\n") + "\n";
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
