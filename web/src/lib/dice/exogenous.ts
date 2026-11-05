/** Exogenous paths and derived scalars (mirrors python/dice2013r/exogenous.py).
 * Arrays are 0-indexed: index i is GAMS period t = i + 1, year 2005 + 5t. */
import { DEFAULT, type Params } from "./params";

export interface CarbonMatrix { b11: number; b12: number; b21: number; b22: number; b23: number; b32: number; b33: number }

export interface Exogenous {
  params: Params;
  period: Float64Array; year: Float64Array;
  l: Float64Array; ga: Float64Array; al: Float64Array;
  gsig: Float64Array; sigma: Float64Array;
  pbacktime: Float64Array; cost1: Float64Array; etree: Float64Array;
  rr: Float64Array; forcoth: Float64Array; partfract: Float64Array;
  cpricebase: Float64Array; miu_up: Float64Array;
  carbon: CarbonMatrix;
  sig0: number; lam: number; c1: number; optlrsav: number;
}

export function carbonMatrix(p: Params): CarbonMatrix {
  const b11 = 1 - p.b12;
  const b21 = (p.b12 * p.mateq) / p.mueq;
  const b22 = 1 - b21 - p.b23;
  const b32 = (p.b23 * p.mueq) / p.mleq;
  const b33 = 1 - b32;
  return { b11, b12: p.b12, b21, b22, b23: p.b23, b32, b33 };
}

export const initialSigma = (p: Params) => p.e0 / (p.q0 * (1 - p.miu0));
export const optimalLongRunSavings = (p: Params) => ((p.dk + 0.004) / (p.dk + 0.004 * p.elasmu + p.prstp)) * p.gama;

export function participation(p: Params): Float64Array {
  const n = p.nperiods;
  if (p.partfract_path) {
    if (p.partfract_path.length !== n) throw new Error("partfract_path must have one value per period");
    return Float64Array.from(p.partfract_path);
  }
  const pf = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i + 1;
    pf[i] = t > p.periodfullpart
      ? p.partfractfull
      : p.partfract2010 + ((p.partfractfull - p.partfract2010) * (t - 1)) / p.periodfullpart;
  }
  pf[0] = p.partfract2010;
  return pf;
}

export function computeExogenous(p: Params = DEFAULT): Exogenous {
  const n = p.nperiods;
  const mk = () => new Float64Array(n);
  const period = mk(), year = mk(), l = mk(), ga = mk(), al = mk(), gsig = mk(), sigma = mk();
  const pbacktime = mk(), cost1 = mk(), etree = mk(), rr = mk(), forcoth = mk(), cpricebase = mk(), miu_up = mk();
  const partfract = participation(p);
  l[0] = p.pop0; al[0] = p.a0; gsig[0] = p.gsigma1; sigma[0] = initialSigma(p);
  for (let i = 0; i < n; i++) {
    const t = i + 1;
    period[i] = t;
    year[i] = 2005 + p.tstep * t;
    ga[i] = p.ga0 * Math.exp(-p.dela * p.tstep * (t - 1));
    if (i + 1 < n) {
      l[i + 1] = l[i] * (p.popasym / l[i]) ** p.popadj;
      al[i + 1] = al[i] / (1 - ga[i]);
      gsig[i + 1] = gsig[i] * (1 + p.dsig) ** p.tstep;
      sigma[i + 1] = sigma[i] * Math.exp(gsig[i] * p.tstep);
    }
    pbacktime[i] = p.pback * (1 - p.gback) ** (t - 1);
    etree[i] = p.eland0 * (1 - p.deland) ** (t - 1);
    rr[i] = 1 / (1 + p.prstp) ** (p.tstep * (t - 1));
    forcoth[i] = p.fex0 + (t < 19 ? (1 / 18) * (p.fex1 - p.fex0) * (t - 1) : p.fex1 - p.fex0);
    cpricebase[i] = p.cprice0 * (1 + p.gcprice) ** (p.tstep * (t - 1));
    miu_up[i] = t < p.miu_cap1_before ? 1 : p.limmiu * partfract[i];
  }
  for (let i = 0; i < n; i++) cost1[i] = (pbacktime[i] * sigma[i]) / p.expcost2 / 1000;
  return {
    params: p, period, year, l, ga, al, gsig, sigma, pbacktime, cost1, etree, rr, forcoth, partfract,
    cpricebase, miu_up, carbon: carbonMatrix(p), sig0: sigma[0], lam: p.fco22x / p.t2xco2,
    c1: p.c10 + p.c1beta * (p.t2xco2 - 2.9),
    optlrsav: p.fixed_savings ?? optimalLongRunSavings(p),
  };
}
