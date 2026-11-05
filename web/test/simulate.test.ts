import { describe, expect, it } from "vitest";
import { computeExogenous } from "../src/lib/dice/exogenous";
import { PATH_SERIES, simulate } from "../src/lib/dice/simulate";
import { SCENARIO_PARAMS, expectSeriesClose, loadGams, maxAbs, readJson } from "./helpers";

const COMPARE = ["K", "YGROSS", "EIND", "E", "CCA", "MAT", "MU", "ML", "FORC", "TATM", "TOCEAN", "DAMFRAC",
  "DAMAGES", "YNET", "ABATECOST", "CPRICE", "Y", "I", "C", "CPC", "RI", "PERIODU"] as const;
const fixtures = readJson("web/test/fixtures/simulation.json");

describe("simulation from GAMS controls reproduces GAMS", () => {
  for (const [scenario, p] of Object.entries(SCENARIO_PARAMS)) {
    describe(scenario, () => {
      const ref = loadGams(scenario);
      const path = simulate(computeExogenous(p), ref.series.MIU as number[], ref.series.S as number[]);
      for (const name of COMPARE) {
        it(name, () => expectSeriesClose(path[name], ref.series[name], name, { rtol: 1e-7, atol: 1e-7 }));
      }
      it("UTILITY", () => expect(Math.abs(path.UTILITY / ref.scalars.UTILITY - 1)).toBeLessThan(1e-9));
    });
  }
});

describe("simulation matches the Python reference", () => {
  for (const c of fixtures.cases) {
    const ex = computeExogenous(c.params);
    for (const sim of c.simulations) {
      it(`${c.name} / ${sim.name}: all ${PATH_SERIES.length} series and welfare`, () => {
        const path = simulate(ex, sim.path.MIU, sim.path.S);
        for (const name of PATH_SERIES) {
          expectSeriesClose(path[name], sim.path[name], `${c.name}/${sim.name}/${name}`,
            { rtol: 1e-12, atol: 1e-12 * maxAbs(sim.path[name]) });
        }
        expect(Math.abs(path.UTILITY - sim.path.UTILITY)).toBeLessThan(1e-9 * Math.abs(sim.path.UTILITY));
      });
    }
  }
});

describe("invariants", () => {
  const ex = computeExogenous();
  const ref = loadGams("opt");
  const path = simulate(ex, ref.series.MIU as number[], ref.series.S as number[]);
  const close = (a: number, b: number, tol = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

  it("accounting identities", () => {
    for (let i = 0; i < 60; i++) {
      close(path.YNET[i], path.YGROSS[i] - path.DAMAGES[i]);
      close(path.Y[i], path.YNET[i] - path.ABATECOST[i]);
      close(path.Y[i], path.C[i] + path.I[i]);
      close(path.I[i], path.S[i] * path.Y[i]);
      close(path.E[i], path.EIND[i] + ex.etree[i]);
    }
  });

  it("carbon mass balance", () => {
    for (let i = 0; i < 59; i++) {
      const d = path.MAT[i + 1] + path.MU[i + 1] + path.ML[i + 1] - (path.MAT[i] + path.MU[i] + path.ML[i]);
      close(d, (path.E[i] * 5) / 3.666, 1e-9);
    }
  });

  it("initial conditions and undefined final interest rate", () => {
    expect([path.K[0], path.MAT[0], path.MU[0], path.ML[0], path.TATM[0], path.TOCEAN[0], path.CCA[0]])
      .toEqual([135, 830.4, 1527, 10010, 0.8, 0.0068, 90]);
    expect(Number.isNaN(path.RI[59])).toBe(true);
  });

  it("rejects control paths of the wrong length", () => {
    expect(() => simulate(ex, new Float64Array(59), new Float64Array(60))).toThrow();
  });
});
