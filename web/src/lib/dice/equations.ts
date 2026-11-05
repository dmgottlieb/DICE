/** DICE-2013R model equations, one function per GAMS equation (names in comments).
 * Mirrors python/dice2013r/equations.py. Units: trillions 2005 USD, millions of
 * people, GtCO2/yr emissions, GtC carbon stocks, degrees C above 1900, $/tCO2. */

/** GAMS writes 5/3.666: GtCO2 per year -> GtC per 5-year period. */
export const CO2_PER_C = 3.666;
export const emissionsToCarbon = (e: number, tstep = 5) => (e * tstep) / CO2_PER_C;

// Emissions and damages
/** EINDEQ */
export const industrialEmissions = (sigma: number, ygross: number, miu: number) => sigma * ygross * (1 - miu);
/** EEQ */
export const totalEmissions = (eind: number, etree: number) => eind + etree;
/** CCACCA */
export const cumulativeEmissionsNext = (cca: number, eind: number, tstep = 5) => cca + emissionsToCarbon(eind, tstep);
/** FORCE (GAMS hard-codes 588 = mateq) */
export const forcing = (mat: number, forcoth: number, fco22x: number, mateq = 588) =>
  fco22x * (Math.log(mat / mateq) / Math.LN2) + forcoth;
/** DAMFRACEQ */
export const damageFraction = (tatm: number, a1: number, a2: number, a3: number) => a1 * tatm + a2 * tatm ** a3;
/** DAMEQ */
export const damages = (ygross: number, damfrac: number) => ygross * damfrac;
/** ABATEEQ */
export const abatementCost = (ygross: number, cost1: number, miu: number, partfract: number, expcost2: number) =>
  ygross * cost1 * miu ** expcost2 * partfract ** (1 - expcost2);
/** MCABATEEQ */
export const marginalAbatementCost = (pbacktime: number, miu: number, expcost2: number) =>
  pbacktime * miu ** (expcost2 - 1);
/** CARBPRICEEQ */
export const carbonPrice = (pbacktime: number, miu: number, partfract: number, expcost2: number) =>
  pbacktime * (miu / partfract) ** (expcost2 - 1);
/** Inverse of CARBPRICEEQ: the control rate that a carbon price supports. */
export const miuFromCarbonPrice = (cprice: number, pbacktime: number, partfract: number, expcost2: number) =>
  partfract * (cprice / pbacktime) ** (1 / (expcost2 - 1));

// Carbon cycle and climate
/** MMAT */
export const matNext = (mat: number, mu: number, e: number, b11: number, b21: number, tstep = 5) =>
  mat * b11 + mu * b21 + emissionsToCarbon(e, tstep);
/** MMU */
export const muNext = (mat: number, mu: number, ml: number, b12: number, b22: number, b32: number) =>
  mat * b12 + mu * b22 + ml * b32;
/** MML */
export const mlNext = (mu: number, ml: number, b23: number, b33: number) => ml * b33 + mu * b23;
/** TATMEQ */
export const tatmNext = (tatm: number, tocean: number, forcNext: number, c1: number, c3: number, fco22x: number, t2xco2: number) =>
  tatm + c1 * (forcNext - (fco22x / t2xco2) * tatm - c3 * (tatm - tocean));
/** TOCEANEQ */
export const toceanNext = (tatm: number, tocean: number, c4: number) => tocean + c4 * (tatm - tocean);

// Economy
/** YGROSSEQ */
export const grossOutput = (al: number, l: number, k: number, gama: number) => al * (l / 1000) ** (1 - gama) * k ** gama;
/** YNETEQ */
export const netOutputOfDamages = (ygross: number, damfrac: number) => ygross * (1 - damfrac);
/** YY */
export const output = (ynet: number, abatecost: number) => ynet - abatecost;
/** SEQ */
export const investment = (s: number, y: number) => s * y;
/** CC */
export const consumption = (y: number, i: number) => y - i;
/** CPCE */
export const consumptionPerCapita = (c: number, l: number) => (1000 * c) / l;
/** KK (binds at the optimum) */
export const capitalNext = (k: number, i: number, dk: number, tstep = 5) => (1 - dk) ** tstep * k + tstep * i;
/** RIEQ */
export const interestRate = (cpc: number, cpcNext: number, prstp: number, elasmu: number, tstep = 5) =>
  (1 + prstp) * (cpcNext / cpc) ** (elasmu / tstep) - 1;

// Utility
/** PERIODUEQ. The GAMS formula is 0/0 at elasmu = 1; there we use its limit, log(cpc) - 1. */
export const periodUtility = (c: number, l: number, elasmu: number) =>
  Math.abs(1 - elasmu) < 1e-12
    ? Math.log((c * 1000) / l) - 1
    : (((c * 1000) / l) ** (1 - elasmu) - 1) / (1 - elasmu) - 1;
/** CEMUTOTPEREQ */
export const discountedPeriodUtility = (periodu: number, l: number, rr: number) => periodu * l * rr;
/** UTIL */
export const welfare = (cemutotperSum: number, scale1: number, scale2: number, tstep = 5) =>
  tstep * scale1 * cemutotperSum + scale2;
