import { describe, expect, it } from "vitest";
import { DEFAULT, withParams } from "../src/lib/dice/params";
import { preset } from "../src/lib/ui/presets";
import { decodeParams, encodeParams } from "../src/lib/ui/url";

describe("url state", () => {
  it("defaults encode to an empty query", () => expect(encodeParams(DEFAULT)).toBe(""));

  it("round-trips changed parameters", () => {
    const p = withParams({ t2xco2: 4.5, prstp: 0.001, a2: 0.00267 * 2, tatm_up: 2 });
    const q = encodeParams(p);
    expect(q).toContain("t2xco2=4.5");
    expect(decodeParams(q)).toEqual({ params: p, presetId: "opt" });
    expect(decodeParams("?" + q).params).toEqual(p);
  });

  it("encodes a scenario and only the changes relative to it", () => {
    const base = preset("copen").params;
    const p = { ...base, t2xco2: 3.5 };
    const q = encodeParams(p, "copen");
    expect(q).toBe("scenario=copen&t2xco2=3.5");
    const back = decodeParams(q);
    expect(back.presetId).toBe("copen");
    expect(back.params).toEqual(p);
    expect(back.params.miu_path).toEqual(base.miu_path);
    expect(encodeParams(base, "copen")).toBe("scenario=copen");
  });

  it("ignores unknown keys and scenarios, non-numbers and non-numeric parameters", () => {
    const r = decodeParams("scenario=bogus&t2xco2=abc&bogus=3&fix_miu0=0&fixed_savings=0.2&prstp=");
    expect(r).toEqual({ params: { ...DEFAULT }, presetId: "opt" });
  });
});
