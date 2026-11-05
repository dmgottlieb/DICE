/** Headline numbers derived from a solution. */
import type { Solution } from "../dice/solve";

export interface Summary {
  scc2015: number;
  cprice2050: number;
  peakTemp: number;
  peakYear: number;
  temp2100: number;
  /** First year industrial emissions reach zero or below; null if never. */
  netZeroYear: number | null;
  /** Consumption-equivalent welfare gain vs another run (percent of consumption every period). */
}

const idx = (sol: Solution, year: number) => Array.from(sol.exogenous.year).indexOf(year);

export function summarize(sol: Solution): Summary {
  const { path } = sol, years = sol.exogenous.year;
  let peak = -Infinity, peakI = 0;
  // Peak over the window where results are meaningful (to 2300).
  for (let i = 0; i < path.TATM.length; i++) if (path.TATM[i] > peak) { peak = path.TATM[i]; peakI = i; }
  let nz: number | null = null;
  for (let i = 0; i < path.EIND.length - 1; i++) if (path.EIND[i] <= 1e-6) { nz = years[i]; break; }
  return {
    scc2015: sol.scc[idx(sol, 2015)],
    cprice2050: path.CPRICE[idx(sol, 2050)],
    peakTemp: peak,
    peakYear: years[peakI],
    temp2100: path.TATM[idx(sol, 2100)],
    netZeroYear: nz,
  };
}

/** Percent increase in consumption, in every period, that would make the
 * `worse` run as good as the `better` one, for a common utility function.
 * Uses U(c * (1+g)) scaling: with CRRA utility, sum(w * c^(1-a)) scales by (1+g)^(1-a). */
export function consumptionEquivalent(better: Solution, worse: Solution): number {
  const p = better.params, ex = better.exogenous;
  if (worse.params.elasmu !== p.elasmu || worse.params.prstp !== p.prstp) return NaN;
  const a = p.elasmu;
  let A = 0, B = 0, L = 0;
  for (let i = 0; i < ex.l.length; i++) {
    const w = ex.l[i] * ex.rr[i];
    const cb = better.path.CPC[i], cw = worse.path.CPC[i];
    if (Math.abs(1 - a) < 1e-12) { A += w * Math.log(cb); B += w * Math.log(cw); L += w; }
    else { A += w * cb ** (1 - a); B += w * cw ** (1 - a); }
  }
  if (Math.abs(1 - a) < 1e-12) return 100 * (Math.exp((A - B) / L) - 1);
  return 100 * ((A / B) ** (1 / (1 - a)) - 1);
}
