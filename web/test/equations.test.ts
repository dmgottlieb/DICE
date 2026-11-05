/** Each equation, evaluated on the GAMS solution's own values, reproduces the GAMS solution. */
import { describe, expect, it } from "vitest";
import * as eq from "../src/lib/dice/equations";
import { computeExogenous } from "../src/lib/dice/exogenous";
import { SCENARIO_PARAMS, expectSeriesClose, loadGams } from "./helpers";

const R = 1e-8, A = 1e-8;

for (const [scenario, p] of Object.entries(SCENARIO_PARAMS)) {
  describe(`equations on GAMS ${scenario} solution`, () => {
    const ex = computeExogenous(p);
    const r = loadGams(scenario).series as Record<string, number[]>;
    const n = p.nperiods;
    const map = (f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i));
    // f(i) -> value expected in period i + 1, for the 59 transitions
    const next = (f: (i: number) => number) => Array.from({ length: n - 1 }, (_, i) => f(i));
    const cm = ex.carbon;

    it("YGROSSEQ", () => expectSeriesClose(map((i) => eq.grossOutput(ex.al[i], ex.l[i], r.K[i], p.gama)), r.YGROSS, "YGROSS", { rtol: R, atol: A }));
    it("EINDEQ", () => expectSeriesClose(map((i) => eq.industrialEmissions(ex.sigma[i], r.YGROSS[i], r.MIU[i])), r.EIND, "EIND", { rtol: 1e-7, atol: 1e-7 }));
    it("EEQ", () => expectSeriesClose(map((i) => eq.totalEmissions(r.EIND[i], ex.etree[i])), r.E, "E", { rtol: R, atol: A }));
    it("CCACCA", () => expectSeriesClose(next((i) => eq.cumulativeEmissionsNext(r.CCA[i], r.EIND[i])), r.CCA.slice(1), "CCA", { rtol: R, atol: 1e-7 }));
    it("FORCE", () => expectSeriesClose(map((i) => eq.forcing(r.MAT[i], ex.forcoth[i], p.fco22x)), r.FORC, "FORC", { rtol: R, atol: A }));
    it("DAMFRACEQ", () => expectSeriesClose(map((i) => eq.damageFraction(r.TATM[i], p.a1, p.a2, p.a3)), r.DAMFRAC, "DAMFRAC", { rtol: R, atol: 1e-10 }));
    it("DAMEQ", () => expectSeriesClose(map((i) => eq.damages(r.YGROSS[i], r.DAMFRAC[i])), r.DAMAGES, "DAMAGES", { rtol: R, atol: 2e-7 }));
    it("ABATEEQ", () => expectSeriesClose(map((i) => eq.abatementCost(r.YGROSS[i], ex.cost1[i], r.MIU[i], ex.partfract[i], p.expcost2)), r.ABATECOST, "ABATECOST", { rtol: 1e-7, atol: 1e-9 }));
    it("CARBPRICEEQ", () => expectSeriesClose(map((i) => eq.carbonPrice(ex.pbacktime[i], r.MIU[i], ex.partfract[i], p.expcost2)), r.CPRICE, "CPRICE", { rtol: 1e-7, atol: 1e-7 }));
    it("MMAT", () => expectSeriesClose(next((i) => eq.matNext(r.MAT[i], r.MU[i], r.E[i], cm.b11, cm.b21)), r.MAT.slice(1), "MAT", { rtol: R, atol: 1e-7 }));
    it("MMU", () => expectSeriesClose(next((i) => eq.muNext(r.MAT[i], r.MU[i], r.ML[i], cm.b12, cm.b22, cm.b32)), r.MU.slice(1), "MU", { rtol: R, atol: 1e-7 }));
    it("MML", () => expectSeriesClose(next((i) => eq.mlNext(r.MU[i], r.ML[i], cm.b23, cm.b33)), r.ML.slice(1), "ML", { rtol: R, atol: 1e-7 }));
    it("TATMEQ", () => expectSeriesClose(next((i) => eq.tatmNext(r.TATM[i], r.TOCEAN[i], r.FORC[i + 1], ex.c1, p.c3, p.fco22x, p.t2xco2)), r.TATM.slice(1), "TATM", { rtol: R, atol: A }));
    it("TOCEANEQ", () => expectSeriesClose(next((i) => eq.toceanNext(r.TATM[i], r.TOCEAN[i], p.c4)), r.TOCEAN.slice(1), "TOCEAN", { rtol: R, atol: A }));
    it("YNETEQ", () => expectSeriesClose(map((i) => eq.netOutputOfDamages(r.YGROSS[i], r.DAMFRAC[i])), r.YNET, "YNET", { rtol: R, atol: A }));
    it("YY", () => expectSeriesClose(map((i) => eq.output(r.YNET[i], r.ABATECOST[i])), r.Y, "Y", { rtol: R, atol: A }));
    it("SEQ", () => expectSeriesClose(map((i) => eq.investment(r.S[i], r.Y[i])), r.I, "I", { rtol: R, atol: A }));
    it("CC", () => expectSeriesClose(map((i) => eq.consumption(r.Y[i], r.I[i])), r.C, "C", { rtol: R, atol: A }));
    it("CPCE", () => expectSeriesClose(map((i) => eq.consumptionPerCapita(r.C[i], ex.l[i])), r.CPC, "CPC", { rtol: R, atol: A }));
    it("KK binds", () => expectSeriesClose(next((i) => eq.capitalNext(r.K[i], r.I[i], p.dk)), r.K.slice(1), "K", { rtol: R, atol: 1e-7 }));
    it("RIEQ", () => expectSeriesClose(next((i) => eq.interestRate(r.CPC[i], r.CPC[i + 1], p.prstp, p.elasmu)), r.RI.slice(0, -1), "RI", { rtol: 1e-7, atol: 1e-9 }));
    it("PERIODUEQ", () => expectSeriesClose(map((i) => eq.periodUtility(r.C[i], ex.l[i], p.elasmu)), r.PERIODU, "PERIODU", { rtol: R, atol: A }));
    it("UTIL", () => {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += eq.discountedPeriodUtility(r.PERIODU[i], ex.l[i], ex.rr[i]);
      const u = eq.welfare(sum, p.scale1, p.scale2);
      expect(Math.abs(u / loadGams(scenario).scalars.UTILITY - 1)).toBeLessThan(1e-9);
    });
  });
}

describe("hand-computed checks", () => {
  it("forcing at CO2 doubling equals fco22x", () => {
    expect(eq.forcing(2 * 588, 0, 3.8)).toBeCloseTo(3.8, 14);
    expect(eq.forcing(588, 0.5, 3.8)).toBeCloseTo(0.5, 14);
  });
  it("damages at 3 degrees", () => expect(eq.damageFraction(3, 0, 0.00267, 2)).toBeCloseTo(0.02403, 14));
  it("backstop price at full control", () => {
    expect(eq.carbonPrice(344, 1, 1, 2.8)).toBe(344);
    expect(eq.marginalAbatementCost(344, 1, 2.8)).toBe(344);
  });
  it("miuFromCarbonPrice inverts carbonPrice", () => {
    for (const miu of [0, 0.039, 0.5, 1, 1.2]) {
      const price = eq.carbonPrice(300, miu, 0.8, 2.8);
      expect(eq.miuFromCarbonPrice(price, 300, 0.8, 2.8)).toBeCloseTo(miu, 13);
    }
    expect(eq.miuFromCarbonPrice(1, 344, 1, 2.8)).toBeCloseTo(0.038976323, 9);
  });
  it("log utility at elasmu = 1 (limit of the GAMS formula)", () => {
    expect(eq.periodUtility(7, 1000, 1)).toBeCloseTo(Math.log(7) - 1, 14);
    expect(eq.periodUtility(7, 1000, 1 + 1e-7)).toBeCloseTo(Math.log(7) - 1, 6);
  });
  it("unit conversion", () => expect(eq.emissionsToCarbon(3.666)).toBeCloseTo(5, 14));
  it("temperature converges to climate sensitivity at doubled CO2", () => {
    let tatm = 0.8, tocean = 0.0068;
    for (let k = 0; k < 5000; k++) [tatm, tocean] = [eq.tatmNext(tatm, tocean, 3.8, 0.098, 0.088, 3.8, 2.9), eq.toceanNext(tatm, tocean, 0.025)];
    expect(tatm).toBeCloseTo(2.9, 9);
    expect(tocean).toBeCloseTo(2.9, 9);
  });
});
