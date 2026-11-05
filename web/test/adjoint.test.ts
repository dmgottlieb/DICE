/** The adjoint gradient must agree with finite differences of the simulator. */
import { describe, expect, it } from "vitest";
import { Evaluator, type Penalty } from "../src/lib/dice/adjoint";
import { computeExogenous } from "../src/lib/dice/exogenous";
import { DEFAULT, withParams, type Params } from "../src/lib/dice/params";
import { simulate } from "../src/lib/dice/simulate";
import { loadGams, readJson } from "./helpers";

const fixtures = readJson("web/test/fixtures/simulation.json");

function controls(p: Params, seed: number) {
  const n = p.nperiods;
  const miu = new Float64Array(n), s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    miu[i] = Math.min(1, 0.05 + 0.8 * t ** (0.7 + 0.3 * seed) + 0.03 * Math.sin(5 * t + seed));
    s[i] = 0.22 + 0.05 * Math.cos(3 * t + seed);
  }
  return { miu, s };
}

/** Central difference of J in coordinate i. */
function fd(ev: Evaluator, miu: Float64Array, s: Float64Array, which: "miu" | "s", i: number, pen?: Penalty, h = 1e-6) {
  const x = which === "miu" ? miu : s;
  const x0 = x[i];
  x[i] = x0 + h; const jp = ev.evaluate(miu, s, pen).J;
  x[i] = x0 - h; const jm = ev.evaluate(miu, s, pen).J;
  x[i] = x0;
  return (jp - jm) / (2 * h);
}

const cases: [string, Params][] = fixtures.cases.map((c: any) => [c.name, c.params]);

describe("objective value", () => {
  for (const [name, p] of cases) {
    it(`${name}: utility equals the simulator's`, () => {
      const ex = computeExogenous(p);
      const { miu, s } = controls(p, 1);
      expect(new Evaluator(ex).evaluate(miu, s).utility).toBeCloseTo(simulate(ex, miu, s).UTILITY, 9);
    });
  }
  it("GAMS optimal controls give the GAMS welfare", () => {
    const ref = loadGams("opt");
    const u = new Evaluator(computeExogenous()).evaluate(ref.series.MIU as number[], ref.series.S as number[]).utility;
    expect(Math.abs(u / ref.scalars.UTILITY - 1)).toBeLessThan(1e-12);
  });
});

describe("gradient vs finite differences", () => {
  for (const [name, p] of cases) {
    it(`${name}: all 120 partial derivatives`, () => {
      const ex = computeExogenous(p);
      const ev = new Evaluator(ex);
      const { miu, s } = controls(p, 2);
      const r = ev.evaluate(miu, s);
      const gm = Float64Array.from(r.gradMIU), gs = Float64Array.from(r.gradS);
      const scale = Math.max(...gm.map(Math.abs), ...gs.map(Math.abs));
      for (let i = 0; i < p.nperiods; i++) {
        expect(Math.abs(gm[i] - fd(ev, miu, s, "miu", i))).toBeLessThan(1e-6 * scale);
        expect(Math.abs(gs[i] - fd(ev, miu, s, "s", i))).toBeLessThan(1e-6 * scale);
      }
    });
  }

  it("with active augmented-Lagrangian penalties", () => {
    const p = withParams({ fosslim: 1500, tatm_up: 2.5 });
    const ex = computeExogenous(p);
    const ev = new Evaluator(ex);
    const { miu, s } = controls(p, 0);
    for (let i = 0; i < 60; i++) miu[i] *= 0.3; // high emissions -> both constraints violated
    const pen: Penalty = { rho: 50, lamCCA: new Float64Array(60).fill(0.1), lamTATM: new Float64Array(60).fill(0.2) };
    const r = ev.evaluate(miu, s, pen);
    expect(Math.max(...r.gCCA)).toBeGreaterThan(0);
    expect(Math.max(...r.gTATM)).toBeGreaterThan(0);
    const gm = Float64Array.from(r.gradMIU), gs = Float64Array.from(r.gradS);
    const scale = Math.max(...gm.map(Math.abs), ...gs.map(Math.abs));
    for (let i = 0; i < 60; i++) {
      expect(Math.abs(gm[i] - fd(ev, miu, s, "miu", i, pen))).toBeLessThan(1e-5 * scale);
      expect(Math.abs(gs[i] - fd(ev, miu, s, "s", i, pen))).toBeLessThan(1e-5 * scale);
    }
  });

  it("with damages switched off (Hotelling step)", () => {
    const ex = computeExogenous();
    const ev = new Evaluator(ex);
    const { miu, s } = controls(DEFAULT, 3);
    const g = Float64Array.from(ev.evaluate(miu, s, undefined, false).gradMIU);
    const h = 1e-6;
    for (const i of [1, 20, 40]) {
      const m2 = Float64Array.from(miu);
      m2[i] += h; const jp = ev.evaluate(m2, s, undefined, false).J;
      m2[i] -= 2 * h; const jm = ev.evaluate(m2, s, undefined, false).J;
      expect(g[i]).toBeCloseTo((jp - jm) / (2 * h), 5);
    }
  });
});

describe("emission and consumption sensitivities", () => {
  it("dJ/dE and dJ/dC match perturbations of the simulation", () => {
    // Perturb emissions at period t via etree, and consumption via a direct
    // utility perturbation computed from the simulator.
    const p = DEFAULT;
    const { miu, s } = controls(p, 1);
    const base = computeExogenous(p);
    const r = new Evaluator(base).evaluate(miu, s);
    const dJdE = Float64Array.from(r.dJdE), dJdC = Float64Array.from(r.dJdC);
    for (const t of [3, 25, 50]) {
      const h = 1e-4;
      const mk = (d: number) => {
        const ex = computeExogenous(p);
        ex.etree[t] += d;
        return -simulate(ex, miu, s).UTILITY;
      };
      expect(dJdE[t]).toBeCloseTo((mk(h) - mk(-h)) / (2 * h), 7);
      // dJ/dC: welfare is separable in C(t) once controls and states are fixed.
      const sim = simulate(base, miu, s);
      const w = p.tstep * p.scale1 * base.l[t] * base.rr[t];
      const u = (c: number) => ((1000 * c / base.l[t]) ** (1 - p.elasmu) - 1) / (1 - p.elasmu);
      expect(dJdC[t]).toBeCloseTo(-w * (u(sim.C[t] + h) - u(sim.C[t] - h)) / (2 * h), 7);
    }
  });

  it("returns Infinity for infeasible controls instead of NaN", () => {
    const ex = computeExogenous();
    const s = new Float64Array(60).fill(1.0); // zero consumption
    expect(new Evaluator(ex).evaluate(new Float64Array(60), s).J).toBe(Infinity);
  });
});
