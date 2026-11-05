import { describe, expect, it } from "vitest";
import { Evaluator } from "../src/lib/dice/adjoint";
import { DEFAULT, withParams, type Params } from "../src/lib/dice/params";
import { PATH_SERIES } from "../src/lib/dice/simulate";
import { solveBaseline, solveOptimal, type Solution } from "../src/lib/dice/solve";
import { SCENARIO_PARAMS, expectSeriesClose, loadGams, maxAbs, readJson } from "./helpers";

const fixtures = readJson("web/test/fixtures/optimal.json");
const ALL_BUT_LAST = { from: 0, to: 59 };
// Series that depend on the final-period control rate, which is economically
// irrelevant (no future benefit) and sits on a flat stretch of the objective.
const MIU_DEPENDENT = new Set(["MIU", "EIND", "E", "ABATECOST", "MCABATE", "CPRICE"]);

/** Tolerance relative to each value, with a floor relative to the series scale. */
function close(actual: ArrayLike<number>, expected: (number | null)[], name: string, rtol: number, range = {}) {
  expectSeriesClose(actual, expected, name, { rtol, atol: rtol * maxAbs(expected), ...range });
}

const memo = new Map<string, Solution>();
function solve(kind: "opt" | "base", p: Params): Solution {
  const key = kind + JSON.stringify(p);
  if (!memo.has(key)) memo.set(key, kind === "opt" ? solveOptimal(p) : solveBaseline(p));
  return memo.get(key)!;
}

describe("agreement with the Python/Ipopt reference", () => {
  const cases = [
    ...fixtures.optimal.map((c: any) => ({ ...c, kind: "opt" as const })),
    ...fixtures.baseline.map((c: any) => ({ ...c, kind: "base" as const })),
  ];
  for (const c of cases) {
    describe(`${c.kind} / ${c.name}`, () => {
      const sol = () => solve(c.kind, c.params);
      it("converges", () => {
        expect(sol().info.converged).toBe(true);
        expect(sol().info.maxViolation).toBeLessThan(1e-8);
      });
      it("welfare", () => expect(Math.abs(sol().path.UTILITY - c.path.UTILITY)).toBeLessThan(1e-7));
      it("all series", () => {
        for (const name of PATH_SERIES) {
          close(sol().path[name], c.path[name], name, 2e-6, MIU_DEPENDENT.has(name) ? ALL_BUT_LAST : {});
        }
      });
      it("social cost of carbon (both definitions)", () => {
        close(sol().scc, c.scc, "scc", 2e-6, ALL_BUT_LAST);
        close(sol().scc_output, c.scc_output, "scc_output", 2e-6, ALL_BUT_LAST);
      });
      if (c.kind === "base") {
        it("Hotelling rent", () => close(sol().photel!, c.photel, "photel", 1e-4, ALL_BUT_LAST));
      }
    });
  }
});

describe("agreement with GAMS", () => {
  for (const [scenario, p] of Object.entries(SCENARIO_PARAMS)) {
    it(scenario, () => {
      const ref = loadGams(scenario);
      const sol = solve(scenario === "base" ? "base" : "opt", p);
      expect(Math.abs(sol.path.UTILITY / ref.scalars.UTILITY - 1)).toBeLessThan(1e-10);
      for (const name of ["MIU", "S", "K", "TATM", "MAT", "C", "CPRICE", "E"] as const) {
        close(sol.path[name], ref.series[name], name, 2e-6, MIU_DEPENDENT.has(name) ? ALL_BUT_LAST : {});
      }
      close(sol.scc_output, ref.series.SCC, "SCC", 2e-6, ALL_BUT_LAST);
    });
  }
});

describe("solution properties", () => {
  const opt = () => solve("opt", DEFAULT);

  it("fixed controls and bounds", () => {
    const { path, exogenous: ex } = opt();
    expect(path.MIU[0]).toBe(DEFAULT.miu0);
    for (let i = 50; i < 60; i++) expect(path.S[i]).toBe(ex.optlrsav);
    for (let i = 0; i < 60; i++) {
      expect(path.MIU[i]).toBeGreaterThanOrEqual(0);
      expect(path.MIU[i]).toBeLessThanOrEqual(ex.miu_up[i]);
    }
    // The control rate sits exactly on its caps (1 to 2150, 1.2 after) for decades.
    expect(path.MIU.filter((v, i) => v === ex.miu_up[i]).length).toBeGreaterThan(10);
  });

  it("final-period control is at (or within the flat region of) its lower bound", () => {
    for (const [kind, p] of [["opt", DEFAULT], ["opt", SCENARIO_PARAMS.lim2], ["base", DEFAULT]] as const) {
      const m = solve(kind, p).path.MIU[59];
      expect(m).toBeGreaterThanOrEqual(p.miu_lo);
      expect(m).toBeLessThan(p.miu_lo + 2e-3);
    }
  });

  it("projected gradient vanishes at the optimum", () => {
    const { path, exogenous: ex } = opt();
    const r = new Evaluator(ex).evaluate(path.MIU, path.S);
    const scale = maxAbs(r.gradMIU);
    for (let i = 1; i < 50; i++) {
      const g = r.gradMIU[i], m = path.MIU[i];
      const atLo = m <= 0 && g > 0, atHi = m >= ex.miu_up[i] && g < 0;
      if (!atLo && !atHi) expect(Math.abs(g)).toBeLessThan(1e-8 * scale);
      expect(Math.abs(r.gradS[i])).toBeLessThan(1e-8 * scale);
    }
  });

  it("SCC equals the carbon price where the control rate is interior", () => {
    const { path, exogenous: ex, scc } = opt();
    let count = 0;
    for (let i = 1; i < 50; i++) {
      if (path.MIU[i] > 1e-3 && path.MIU[i] < ex.miu_up[i] - 1e-3) {
        expect(scc[i]).toBeCloseTo(path.CPRICE[i], 4);
        count++;
      }
    }
    expect(count).toBeGreaterThan(10);
  });

  it("the two SCC definitions agree where savings are optimized", () => {
    const { scc, scc_output } = opt();
    for (let i = 0; i < 50; i++) expect(Math.abs(scc[i] / scc_output[i] - 1)).toBeLessThan(1e-9);
  });

  it("2 degree cap binds and is respected", () => {
    const sol = solve("opt", withParams({ tatm_up: 2 }));
    expect(Math.max(...sol.path.TATM)).toBeCloseTo(2, 8);
    expect(Math.max(...sol.path.TATM)).toBeLessThan(2 + 1e-8);
  });

  it("baseline fixes the carbon price at max(Hotelling, base price) for 45 periods", () => {
    const b = solve("base", DEFAULT);
    for (let i = 0; i < 45; i++) {
      expect(b.path.CPRICE[i]).toBeCloseTo(Math.max(b.photel![i], b.exogenous.cpricebase[i]), 9);
    }
    expect(solve("opt", DEFAULT).path.UTILITY).toBeGreaterThan(b.path.UTILITY);
  });

  it("reports an infeasible temperature cap instead of failing", () => {
    const sol = solveOptimal(withParams({ tatm_up: 1.0 }));
    expect(sol.info.maxViolation).toBeGreaterThan(1e-3);
    expect(Number.isFinite(sol.path.UTILITY)).toBe(true);
  });
});

describe("comparative statics", () => {
  const base = () => solve("opt", DEFAULT);
  for (const change of [{ a2: 2 * DEFAULT.a2 }, { prstp: 0.005 }, { t2xco2: 4 }]) {
    it(`more concern (${JSON.stringify(change)}) raises the SCC and control`, () => {
      const sol = solve("opt", withParams(change));
      expect(sol.scc[1]).toBeGreaterThan(base().scc[1]);
      expect(sol.path.MIU[2]).toBeGreaterThan(base().path.MIU[2]);
    });
  }
  it("a costlier backstop lowers early control", () => {
    expect(solve("opt", withParams({ pback: 600 })).path.MIU[1]).toBeLessThan(base().path.MIU[1]);
  });
});

describe("warm starts and speed", () => {
  // Regression guard (machine-independent): a binding temperature cap used to
  // take ~43,000 evaluations cold and fail to converge from a warm start,
  // because the penalty kept growing after the constraint was met.
  it("a binding temperature cap converges in a bounded number of evaluations", () => {
    const p = withParams({ t2xco2: 3.5, tatm_up: 2.5 });
    const cold = solveOptimal(p);
    const prev = solve("opt", DEFAULT);
    const warm = solveOptimal(p, { warmStart: { miu: prev.path.MIU, s: prev.path.S } });
    for (const sol of [cold, warm]) {
      expect(sol.info.converged).toBe(true);
      expect(sol.info.maxViolation).toBeLessThan(1e-9);
      expect(sol.info.evaluations).toBeLessThan(12000);
      expect(Math.max(...sol.path.TATM)).toBeCloseTo(2.5, 8);
    }
    expect(Math.abs(warm.path.UTILITY - cold.path.UTILITY)).toBeLessThan(1e-8);
    expectSeriesClose(warm.scc, cold.scc, "scc", { rtol: 1e-6, atol: 1e-6 * maxAbs(cold.scc), to: 59 });
  });

  it("warm start reaches the cold-start solution with far fewer evaluations", () => {
    const prev = solve("opt", DEFAULT);
    const p = withParams({ t2xco2: 3.1 });
    const cold = solve("opt", p);
    const warm = solveOptimal(p, { warmStart: { miu: prev.path.MIU, s: prev.path.S } });
    expectSeriesClose(warm.path.MIU, cold.path.MIU, "MIU", { rtol: 1e-7, atol: 1e-7, to: 59 });
    expect(Math.abs(warm.path.UTILITY - cold.path.UTILITY)).toBeLessThan(1e-9);
    expect(warm.info.evaluations).toBeLessThan(cold.info.evaluations / 2);
  });

  it("solves fast enough for interactive use", () => {
    const cold = solveOptimal(withParams({ a2: 0.003 }));
    const warm = solveOptimal(withParams({ a2: 0.0031 }), { warmStart: { miu: cold.path.MIU, s: cold.path.S } });
    // Generous bounds for slow CI machines; typical: ~40 ms cold, ~7 ms warm.
    expect(cold.info.ms).toBeLessThan(2000);
    expect(warm.info.ms).toBeLessThan(500);
  });
});
