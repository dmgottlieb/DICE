/** Scalar parameters of DICE-2013R; defaults from DICE2013R_110513_vanilla.gms.
 * Field names match the GAMS names (and the Python reference implementation). */
export interface Params {
  nperiods: number; tstep: number;
  elasmu: number; prstp: number;
  gama: number; pop0: number; popadj: number; popasym: number; dk: number; q0: number;
  k0: number; a0: number; ga0: number; dela: number;
  gsigma1: number; dsig: number; eland0: number; deland: number; e0: number; miu0: number;
  mat0: number; mu0: number; ml0: number; mateq: number; mueq: number; mleq: number;
  b12: number; b23: number;
  t2xco2: number; fex0: number; fex1: number; tocean0: number; tatm0: number;
  c10: number; c1beta: number; c3: number; c4: number; fco22x: number;
  a1: number; a2: number; a3: number;
  expcost2: number; pback: number; gback: number; limmiu: number; tnopol: number;
  cprice0: number; gcprice: number;
  periodfullpart: number; partfract2010: number; partfractfull: number;
  fosslim: number;
  scale1: number; scale2: number;
  cca0: number; miu_cap1_before: number; nfixsav: number;
  fix_miu0: boolean; miu_lo: number; tatm_up: number;
  /** Terminal savings rate; null = optlrsav computed from the parameters. */
  fixed_savings: number | null;
  /** Imported participation fraction per period (Copenhagen scenario); null = the ramp. */
  partfract_path: number[] | null;
  /** Control rate fixed per period in the optimal run (null entries free); null = none. */
  miu_path: (number | null)[] | null;
}

export const DEFAULT: Readonly<Params> = Object.freeze({
  nperiods: 60, tstep: 5,
  elasmu: 1.45, prstp: 0.015,
  gama: 0.3, pop0: 6838, popadj: 0.134, popasym: 10500, dk: 0.1, q0: 63.69,
  k0: 135, a0: 3.8, ga0: 0.079, dela: 0.006,
  gsigma1: -0.01, dsig: -0.001, eland0: 3.3, deland: 0.2, e0: 33.61, miu0: 0.039,
  mat0: 830.4, mu0: 1527, ml0: 10010, mateq: 588, mueq: 1350, mleq: 10000,
  b12: 0.088, b23: 0.0025,
  t2xco2: 2.9, fex0: 0.25, fex1: 0.7, tocean0: 0.0068, tatm0: 0.8,
  c10: 0.098, c1beta: 0.01243, c3: 0.088, c4: 0.025, fco22x: 3.8,
  a1: 0, a2: 0.00267, a3: 2,
  expcost2: 2.8, pback: 344, gback: 0.025, limmiu: 1.2, tnopol: 45,
  cprice0: 1, gcprice: 0.02,
  periodfullpart: 21, partfract2010: 1, partfractfull: 1,
  fosslim: 6000,
  scale1: 0.016408662, scale2: -3855.106895,
  cca0: 90, miu_cap1_before: 30, nfixsav: 10,
  fix_miu0: true, miu_lo: 0, tatm_up: 40,
  fixed_savings: null,
  partfract_path: null,
  miu_path: null,
});

/** optlrsav at the default parameters (used by the GAMS Stern scenarios). */
export const optimalLongRunSavingsDefault = ((DEFAULT.dk + 0.004) / (DEFAULT.dk + 0.004 * DEFAULT.elasmu + DEFAULT.prstp)) * DEFAULT.gama;

export function withParams(changes: Partial<Params>, base: Readonly<Params> = DEFAULT): Params {
  return { ...base, ...changes };
}
