import { describe, expect, it } from "vitest";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { PATH_SERIES } from "../src/lib/dice/simulate";
import { solveOptimal } from "../src/lib/dice/solve";
import { baselineParams, hasCap } from "../src/lib/ui/controls";
import { PRESETS, preset } from "../src/lib/ui/presets";
import { expectSeriesClose, maxAbs, readJson } from "./helpers";

const scenarios: any[] = readJson("web/test/fixtures/optimal.json").scenarios;

describe("presets", () => {
  it("cover exactly the Python scenario set", () => {
    expect(PRESETS.map((p) => p.id).sort()).toEqual(scenarios.map((s) => s.name).sort());
  });

  for (const sc of scenarios) {
    describe(sc.name, () => {
      it("parameters are identical to python/dice2013r/scenarios.py", () => {
        expect({ ...preset(sc.name).params }).toEqual(sc.params);
      });
      it("solution matches the Python/Ipopt solution", () => {
        const sol = solveOptimal(preset(sc.name).params);
        expect(sol.info.converged).toBe(true);
        expect(Math.abs(sol.path.UTILITY - sc.path.UTILITY)).toBeLessThan(1e-6);
        for (const name of PATH_SERIES) {
          expectSeriesClose(sol.path[name], sc.path[name], name, { rtol: 5e-6, atol: 5e-6 * maxAbs(sc.path[name]), to: 59 });
        }
        expectSeriesClose(sol.scc, sc.scc, "scc", { rtol: 5e-6, atol: 5e-6 * maxAbs(sc.scc), to: 59 });
      });
    });
  }

  it("Copenhagen fixes every control rate after 2010", () => {
    const p = preset("copen").params;
    const sol = solveOptimal(p);
    for (let i = 1; i < 60; i++) expect(sol.path.MIU[i]).toBe(p.miu_path![i]);
  });

  it("unknown ids fall back to the default", () => expect(preset("nope").id).toBe("opt"));

  it("baseline drops the policy paths and the cap", () => {
    const b = baselineParams(preset("copen").params);
    expect(b.miu_path).toBeNull();
    expect(b.partfract_path).toBeNull();
    expect(b.tatm_up).toBe(40);
  });

  it("cap detection ignores the scenarios' non-binding 15 degree bound", () => {
    expect(hasCap(DEFAULT)).toBe(false);
    expect(hasCap(preset("stern").params)).toBe(false);
    expect(hasCap(preset("lim2").params)).toBe(true);
    expect(hasCap(withParams({ tatm_up: 3 }))).toBe(true);
  });

  it("path parameters are validated", () => {
    expect(() => solveOptimal(withParams({ miu_path: [0.5] }))).toThrow();
    expect(() => solveOptimal(withParams({ partfract_path: [1, 1] }))).toThrow();
  });
});
