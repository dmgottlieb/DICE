import { describe, expect, it } from "vitest";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { readJson } from "./helpers";

describe("params", () => {
  it("defaults equal the Python reference defaults (which are tested against the .gms file)", () => {
    const py = readJson("web/test/fixtures/simulation.json").default_params;
    expect({ ...DEFAULT }).toEqual(py);
  });

  it("DEFAULT is frozen", () => {
    expect(Object.isFrozen(DEFAULT)).toBe(true);
  });

  it("withParams returns a modified copy", () => {
    const p = withParams({ prstp: 0.001 });
    expect(p.prstp).toBe(0.001);
    expect(DEFAULT.prstp).toBe(0.015);
    expect(p.elasmu).toBe(DEFAULT.elasmu);
  });
});
