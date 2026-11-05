import { describe, expect, it } from "vitest";
import { DEFAULT, withParams, type Params } from "../src/lib/dice/params";
import { solveOptimal } from "../src/lib/dice/solve";
import { SolverClient, type WorkerLike } from "../src/lib/ui/solver-client";
import { CHART_VARIABLES, VARIABLES, toCsv, variable } from "../src/lib/ui/variables";
import { loadGams } from "./helpers";

describe("variables", () => {
  const sol = solveOptimal();
  const ref = loadGams("opt").series;
  it("each yields 60 values and formats them", () => {
    for (const v of VARIABLES) {
      const xs = v.get(sol);
      expect(xs.length).toBe(60);
      expect(v.format(xs[1])).toMatch(/\d/);
    }
  });
  it("unit conversions", () => {
    expect(variable("MAT").get(sol)[0]).toBeCloseTo(ref.MAT_ppm[0]!, 6);
    expect(variable("MIU").get(sol)[0]).toBeCloseTo(3.9, 12);
    expect(variable("DAMFRAC").get(sol)[0]).toBeCloseTo(100 * ref.DAMFRAC[0]!, 6);
    expect(variable("SCC").get(sol)[1]).toBeCloseTo(ref.SCC[1]!, 4);
  });
  it("chart variables exist", () => CHART_VARIABLES.forEach((id) => expect(variable(id)).toBeTruthy()));
  it("CSV has a header and one row per series-year, quoting labels", () => {
    const csv = toCsv([{ id: "a", label: 'Optimal, "yours"', sol }, { id: "b", label: "Missing", sol: null }]);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(61);
    expect(lines[0].split(",").length).toBe(2 + VARIABLES.length);
    expect(lines[1].startsWith('"Optimal, ""yours""",2010,0.8')).toBe(true);
  });
});

describe("solver client", () => {
  function fakeWorker() {
    const sent: { id: number; params: Params }[] = [];
    const w: WorkerLike & { sent: typeof sent; reply(i: number): void } = {
      onmessage: null,
      sent,
      postMessage: (m) => sent.push(m),
      reply(i) {
        const m = sent[i];
        w.onmessage!({ data: { type: "result", id: m.id, results: { tag: m.params.t2xco2 } as any } } as MessageEvent);
      },
    };
    return w;
  }

  it("keeps one request in flight and only solves the latest pending parameters", () => {
    const w = fakeWorker();
    const got: number[] = [], busy: boolean[] = [];
    const c = new SolverClient(w, (r: any) => got.push(r.tag), () => {}, (b) => busy.push(b));
    for (const t of [3, 3.1, 3.2, 3.3]) c.request(withParams({ t2xco2: t }));
    expect(w.sent.map((m) => m.params.t2xco2)).toEqual([3]);
    w.reply(0);
    expect(w.sent.map((m) => m.params.t2xco2)).toEqual([3, 3.3]); // 3.1 and 3.2 skipped
    w.reply(1);
    expect(got).toEqual([3, 3.3]);
    expect(busy.at(-1)).toBe(false);
  });

  it("passes errors through and carries on", () => {
    const w = fakeWorker();
    const errors: string[] = [];
    const c = new SolverClient(w, () => {}, (m) => errors.push(m));
    c.request(DEFAULT);
    c.request(withParams({ a2: 1 }));
    w.onmessage!({ data: { type: "error", id: w.sent[0].id, message: "boom" } } as MessageEvent);
    expect(errors).toEqual(["boom"]);
    expect(w.sent.length).toBe(2);
  });
});
