import { describe, expect, it } from "vitest";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { decodeParams, encodeParams } from "../src/lib/ui/url";

describe("url state", () => {
  it("defaults encode to an empty query", () => expect(encodeParams(DEFAULT)).toBe(""));

  it("round-trips changed parameters", () => {
    const p = withParams({ t2xco2: 4.5, prstp: 0.001, a2: 0.00267 * 2, tatm_up: 2 });
    const q = encodeParams(p);
    expect(q).toContain("t2xco2=4.5");
    expect(decodeParams(q)).toEqual(p);
    expect(decodeParams("?" + q)).toEqual(p);
  });

  it("ignores unknown keys, non-numbers and non-numeric parameters", () => {
    const p = decodeParams("t2xco2=abc&bogus=3&fix_miu0=0&fixed_savings=0.2&prstp=");
    expect(p).toEqual({ ...DEFAULT });
  });
});
