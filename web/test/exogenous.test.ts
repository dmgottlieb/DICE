import { describe, expect, it } from "vitest";
import { computeExogenous, participation, type Exogenous } from "../src/lib/dice/exogenous";
import * as eq from "../src/lib/dice/equations";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { expectSeriesClose, loadGams, readJson } from "./helpers";

const GAMS_SERIES = ["l", "al", "ga", "gsig", "sigma", "pbacktime", "cost1", "etree", "rr", "forcoth", "partfract"] as const;
const fixtures = readJson("web/test/fixtures/simulation.json");

describe("exogenous paths vs GAMS", () => {
  const ex = computeExogenous();
  for (const scenario of ["opt", "base"]) {
    const ref = loadGams(scenario);
    for (const name of GAMS_SERIES) {
      it(`${scenario}: ${name}`, () => {
        expectSeriesClose(ex[name], ref.series[name], name, { rtol: 1e-9, atol: 1e-10 });
      });
    }
  }
  it("Stern discount factors", () => {
    const stern = computeExogenous(withParams({ prstp: 0.001 }));
    expectSeriesClose(stern.rr, loadGams("stern").series.rr, "rr", { rtol: 1e-9, atol: 1e-10 });
  });
});

describe("exogenous paths vs Python reference", () => {
  for (const c of fixtures.cases) {
    describe(c.name, () => {
      const ex = computeExogenous(c.params);
      const py = c.exogenous;
      for (const name of Object.keys(py).filter((k) => Array.isArray(py[k]))) {
        it(name, () => expectSeriesClose((ex as any)[name], py[name], name, { rtol: 1e-13, atol: 1e-15 }));
      }
      it("scalars and carbon matrix", () => {
        for (const k of ["sig0", "lam", "c1", "optlrsav"] as const) expect(ex[k]).toBeCloseTo(py[k], 14);
        for (const [k, v] of Object.entries(py.carbon)) expect((ex.carbon as any)[k]).toBeCloseTo(v as number, 15);
      });
    });
  }
});

describe("structure", () => {
  const ex: Exogenous = computeExogenous();

  it("carbon matrix matches the GAMS sheet", () => {
    const expected = { b11: 0.912, b21: 0.0383288889, b12: 0.088, b22: 0.9591711111, b32: 0.0003375, b23: 0.0025, b33: 0.9996625 };
    for (const [k, v] of Object.entries(expected)) expect(Math.abs((ex.carbon as any)[k] - v)).toBeLessThan(5e-11);
  });

  it("carbon matrix conserves mass", () => {
    const c = ex.carbon;
    expect(c.b11 + c.b12).toBeCloseTo(1, 15);
    expect(c.b21 + c.b22 + c.b23).toBeCloseTo(1, 15);
    expect(c.b32 + c.b33).toBeCloseTo(1, 15);
  });

  it("equilibrium stocks are a fixed point", () => {
    const c = ex.carbon, p = DEFAULT;
    expect(eq.matNext(p.mateq, p.mueq, 0, c.b11, c.b21)).toBeCloseTo(p.mateq, 10);
    expect(eq.muNext(p.mateq, p.mueq, p.mleq, c.b12, c.b22, c.b32)).toBeCloseTo(p.mueq, 10);
    expect(eq.mlNext(p.mueq, p.mleq, c.b23, c.b33)).toBeCloseTo(p.mleq, 10);
  });

  it("years, bounds, ramps", () => {
    expect(ex.year[0]).toBe(2010);
    expect(ex.year[59]).toBe(2305);
    expect(Array.from(ex.miu_up.slice(0, 29)).every((v) => v === 1)).toBe(true);
    expect(Array.from(ex.miu_up.slice(29)).every((v) => v === 1.2)).toBe(true);
    expect(ex.forcoth[18]).toBeCloseTo(0.7, 14);
    expect(ex.cpricebase[1]).toBeCloseTo(1.02 ** 5, 14);
  });

  it("partial participation ramps linearly", () => {
    const pf = participation(withParams({ partfract2010: 0.2, partfractfull: 0.8, periodfullpart: 4 }));
    [0.2, 0.35, 0.5, 0.65, 0.8, 0.8].forEach((v, i) => expect(pf[i]).toBeCloseTo(v, 14));
  });

  it("fixed_savings overrides optlrsav", () => {
    expect(computeExogenous(withParams({ fixed_savings: 0.2 })).optlrsav).toBe(0.2);
  });
});
