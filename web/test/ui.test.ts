import { describe, expect, it } from "vitest";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { solveOptimal } from "../src/lib/dice/solve";
import { CONTROLS, baselineParams, isDefault } from "../src/lib/ui/controls";
import { formatNumber, formatTick } from "../src/lib/ui/format";
import { niceDomain, niceStep } from "../src/lib/ui/scale";
import { SolverSession } from "../src/lib/ui/session";
import { consumptionEquivalent, summarize } from "../src/lib/ui/summary";
import { loadGams } from "./helpers";

describe("controls", () => {
  it("ids are unique", () => expect(new Set(CONTROLS.map((c) => c.id)).size).toBe(CONTROLS.length));

  for (const c of CONTROLS) {
    describe(c.id, () => {
      it("default lies within the slider range and on a step", () => {
        const v = c.get(DEFAULT);
        expect(v).toBeGreaterThanOrEqual(c.min);
        expect(v).toBeLessThanOrEqual(c.max);
        const k = (v - c.min) / c.step;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
        expect(isDefault(c, DEFAULT)).toBe(true);
      });
      it("set then get round-trips and leaves other controls alone", () => {
        const v = c.min + Math.round((c.max - c.min) / c.step / 3) * c.step;
        const p = c.set(DEFAULT, v);
        expect(c.get(p)).toBeCloseTo(v, 9);
        for (const other of CONTROLS) if (other !== c) expect(other.get(p)).toBeCloseTo(other.get(DEFAULT), 9);
      });
      it("does not mutate its input", () => {
        const p = { ...DEFAULT };
        c.set(p, c.max);
        expect(p).toEqual({ ...DEFAULT });
      });
      it("formats values", () => expect(c.format(c.get(DEFAULT))).toMatch(/\d/));
    });
  }

  it("display units map to the right parameters", () => {
    const get = (id: string) => CONTROLS.find((c) => c.id === id)!;
    expect(get("prstp").get(DEFAULT)).toBeCloseTo(1.5);
    expect(get("damage3").get(DEFAULT)).toBeCloseTo(2.403);
    expect(get("popasym").get(DEFAULT)).toBeCloseTo(10.5);
    expect(get("gsigma1").get(DEFAULT)).toBeCloseTo(-1);
    expect(get("damage3").set(DEFAULT, 4.806).a2).toBeCloseTo(2 * DEFAULT.a2, 12);
  });

  it("baseline ignores a temperature cap", () => {
    expect(baselineParams(withParams({ tatm_up: 2 })).tatm_up).toBe(40);
  });
});

describe("format", () => {
  it("numbers", () => {
    expect(formatNumber(17.7348)).toBe("17.7");
    expect(formatNumber(2.4)).toBe("2.40");
    expect(formatNumber(1234.5)).toBe("1,235");
    expect(formatNumber(NaN)).toBe("–");
  });
  it("ticks", () => {
    expect(formatTick(0, 0.5)).toBe("0.0");
    expect(formatTick(1.5, 0.5)).toBe("1.5");
    expect(formatTick(0.75, 0.25)).toBe("0.75");
    expect(formatTick(100, 50)).toBe("100");
    expect(formatTick(2000, 1000)).toBe("2,000");
    expect(formatTick(20000, 10000)).toBe("20K");
    expect(formatTick(-0.0000001, 0.25)).toBe("0.00");
  });
});

describe("scale", () => {
  it("nice steps", () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1, 4)).toBe(0.25);
    expect(niceStep(700, 5)).toBe(200);
  });
  it("nice domains contain the data and land on ticks", () => {
    for (const [lo, hi] of [[0, 3.3], [-27.4, 122.9], [0.8, 6.49], [0, 0], [5, 5], [1e-9, 2e-9]]) {
      const d = niceDomain(lo, hi);
      expect(d.lo).toBeLessThanOrEqual(lo);
      expect(d.hi).toBeGreaterThanOrEqual(hi);
      expect(d.ticks[0]).toBeCloseTo(d.lo, 12);
      expect(d.ticks[d.ticks.length - 1]).toBeCloseTo(d.hi, 12);
      expect(d.ticks.length).toBeGreaterThanOrEqual(2);
      expect(d.ticks.length).toBeLessThanOrEqual(12);
    }
  });
});

describe("summary", () => {
  const opt = solveOptimal();
  const ref = loadGams("opt");
  it("headline numbers match GAMS", () => {
    const s = summarize(opt);
    expect(s.scc2015).toBeCloseTo(ref.series.SCC[1]!, 4);
    expect(s.cprice2050).toBeCloseTo(ref.series.CPRICE[8]!, 3);
    const peak = Math.max(...(ref.series.TATM as number[]));
    expect(s.peakTemp).toBeCloseTo(peak, 5);
    expect(s.temp2100).toBeCloseTo(ref.series.TATM[18]!, 5);
    // GAMS: control rate first reaches 1 in ... ; emissions zero then.
    const firstFull = ref.years[(ref.series.EIND as number[]).findIndex((e) => e <= 1e-6)];
    expect(s.netZeroYear).toBe(firstFull);
  });
  it("consumption equivalent is zero against itself and positive optimal vs worse", () => {
    expect(consumptionEquivalent(opt, opt)).toBeCloseTo(0, 12);
    const session = new SolverSession();
    const r = session.solve(DEFAULT);
    const ce = consumptionEquivalent(r.optimal, r.baseline!);
    expect(ce).toBeGreaterThan(0);
    expect(ce).toBeLessThan(5);
  });
});

describe("solver session", () => {
  it("solves both runs, warm-starts, and matches cold solves", () => {
    const s = new SolverSession();
    const first = s.solve(DEFAULT);
    expect(first.optimal.path.UTILITY).toBeCloseTo(loadGams("opt").scalars.UTILITY, 7);
    expect(first.baseline!.path.UTILITY).toBeCloseTo(loadGams("base").scalars.UTILITY, 7);
    expect(first.baselineError).toBeNull();
    const p = withParams({ t2xco2: 3.5, tatm_up: 2.5 });
    const second = s.solve(p);
    const cold = solveOptimal(p);
    expect(second.optimal.path.UTILITY).toBeCloseTo(cold.path.UTILITY, 8);
    expect(second.baseline!.params.tatm_up).toBe(40);
    expect(Math.max(...second.optimal.path.TATM)).toBeLessThanOrEqual(2.5 + 1e-7);
    expect(second.reference).toBe(first.reference);
  });

  it("reports an infeasible baseline but still solves the optimum, then recovers", () => {
    const s = new SolverSession();
    // Damages of 80% of output at 2 degrees: unabated warming destroys all output.
    const extreme = s.solve(withParams({ a2: 0.05, a3: 4, elasmu: 3, prstp: 0 }));
    expect(extreme.baseline).toBeNull();
    expect(extreme.baselineError).toMatch(/feasible/);
    expect(Number.isFinite(extreme.optimal.path.UTILITY)).toBe(true);
    expect(Math.max(...extreme.optimal.path.TATM)).toBeLessThan(2);
    const back = s.solve(DEFAULT);
    expect(back.baselineError).toBeNull();
    expect(back.optimal.path.UTILITY).toBeCloseTo(loadGams("opt").scalars.UTILITY, 7);
  });
});
