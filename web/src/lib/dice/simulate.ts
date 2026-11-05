/** Forward simulation for given control paths (mirrors python/dice2013r/simulate.py). */
import * as eq from "./equations";
import type { Exogenous } from "./exogenous";

export const PATH_SERIES = [
  "MIU", "S", "K", "YGROSS", "EIND", "E", "CCA", "MAT", "MU", "ML", "FORC", "TATM", "TOCEAN",
  "DAMFRAC", "DAMAGES", "YNET", "ABATECOST", "MCABATE", "CPRICE", "Y", "I", "C", "CPC", "RI",
  "PERIODU", "CEMUTOTPER",
] as const;
export type SeriesName = (typeof PATH_SERIES)[number];
export type Path = Record<SeriesName, Float64Array> & { UTILITY: number };

type Vec = ArrayLike<number>;

export function simulate(ex: Exogenous, miu: Vec, s: Vec): Path {
  const p = ex.params;
  const n = p.nperiods;
  if (miu.length !== n || s.length !== n) throw new Error(`miu and s must have length ${n}`);
  const cm = ex.carbon;
  const out = {} as Record<SeriesName, Float64Array>;
  for (const k of PATH_SERIES) out[k] = new Float64Array(n);
  const { MIU, S, K, YGROSS, EIND, E, CCA, MAT, MU, ML, FORC, TATM, TOCEAN, DAMFRAC, DAMAGES, YNET,
    ABATECOST, MCABATE, CPRICE, Y, I, C, CPC, RI, PERIODU, CEMUTOTPER } = out;

  K[0] = p.k0; MAT[0] = p.mat0; MU[0] = p.mu0; ML[0] = p.ml0;
  TATM[0] = p.tatm0; TOCEAN[0] = p.tocean0; CCA[0] = p.cca0;
  FORC[0] = eq.forcing(MAT[0], ex.forcoth[0], p.fco22x, p.mateq);
  let total = 0;
  for (let i = 0; i < n; i++) {
    MIU[i] = miu[i]; S[i] = s[i];
    YGROSS[i] = eq.grossOutput(ex.al[i], ex.l[i], K[i], p.gama);
    EIND[i] = eq.industrialEmissions(ex.sigma[i], YGROSS[i], MIU[i]);
    E[i] = eq.totalEmissions(EIND[i], ex.etree[i]);
    DAMFRAC[i] = eq.damageFraction(TATM[i], p.a1, p.a2, p.a3);
    DAMAGES[i] = eq.damages(YGROSS[i], DAMFRAC[i]);
    YNET[i] = eq.netOutputOfDamages(YGROSS[i], DAMFRAC[i]);
    ABATECOST[i] = eq.abatementCost(YGROSS[i], ex.cost1[i], MIU[i], ex.partfract[i], p.expcost2);
    MCABATE[i] = eq.marginalAbatementCost(ex.pbacktime[i], MIU[i], p.expcost2);
    CPRICE[i] = eq.carbonPrice(ex.pbacktime[i], MIU[i], ex.partfract[i], p.expcost2);
    Y[i] = eq.output(YNET[i], ABATECOST[i]);
    I[i] = eq.investment(S[i], Y[i]);
    C[i] = eq.consumption(Y[i], I[i]);
    CPC[i] = eq.consumptionPerCapita(C[i], ex.l[i]);
    PERIODU[i] = eq.periodUtility(C[i], ex.l[i], p.elasmu);
    CEMUTOTPER[i] = eq.discountedPeriodUtility(PERIODU[i], ex.l[i], ex.rr[i]);
    total += CEMUTOTPER[i];
    if (i + 1 < n) {
      K[i + 1] = eq.capitalNext(K[i], I[i], p.dk, p.tstep);
      CCA[i + 1] = eq.cumulativeEmissionsNext(CCA[i], EIND[i], p.tstep);
      MAT[i + 1] = eq.matNext(MAT[i], MU[i], E[i], cm.b11, cm.b21, p.tstep);
      MU[i + 1] = eq.muNext(MAT[i], MU[i], ML[i], cm.b12, cm.b22, cm.b32);
      ML[i + 1] = eq.mlNext(MU[i], ML[i], cm.b23, cm.b33);
      FORC[i + 1] = eq.forcing(MAT[i + 1], ex.forcoth[i + 1], p.fco22x, p.mateq);
      TATM[i + 1] = eq.tatmNext(TATM[i], TOCEAN[i], FORC[i + 1], ex.c1, p.c3, p.fco22x, p.t2xco2);
      TOCEAN[i + 1] = eq.toceanNext(TATM[i], TOCEAN[i], p.c4);
    }
  }
  for (let i = 0; i + 1 < n; i++) RI[i] = eq.interestRate(CPC[i], CPC[i + 1], p.prstp, p.elasmu, p.tstep);
  RI[n - 1] = NaN;
  return { ...out, UTILITY: eq.welfare(total, p.scale1, p.scale2, p.tstep) };
}
