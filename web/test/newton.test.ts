import { describe, expect, it } from "vitest";
import { minimizeBoxNewton } from "../src/lib/dice/newton";

describe("minimizeBoxNewton", () => {
  it("solves a quadratic in one step", () => {
    const A = [[4, 1, 0], [1, 3, 1], [0, 1, 2]], b = [1, 2, 3];
    const r = minimizeBoxNewton((x, g) => {
      let f = 0;
      for (let i = 0; i < 3; i++) {
        let ax = 0;
        for (let j = 0; j < 3; j++) ax += A[i][j] * x[j];
        g[i] = ax - b[i];
        f += 0.5 * x[i] * ax - b[i] * x[i];
      }
      return f;
    }, [0, 0, 0], [-10, -10, -10], [10, 10, 10]);
    expect(r.converged).toBe(true);
    expect(r.iterations).toBeLessThanOrEqual(3);
    // A x = b  ->  x = [2/9, 1/9, 13/9]
    [2 / 9, 1 / 9, 13 / 9].forEach((v, i) => expect(r.x[i]).toBeCloseTo(v, 8));
  });

  it("handles active bounds exactly", () => {
    const c = [3, -3, 0.25];
    const r = minimizeBoxNewton((x, g) => {
      let f = 0;
      for (let i = 0; i < 3; i++) { f += (i + 1) * (x[i] - c[i]) ** 2; g[i] = 2 * (i + 1) * (x[i] - c[i]); }
      return f;
    }, [0, 0, 0], [-1, -1, -1], [1, 1, 1]);
    expect(r.x[0]).toBe(1);
    expect(r.x[1]).toBe(-1);
    expect(r.x[2]).toBeCloseTo(0.25, 9);
  });

  it("converges on Rosenbrock (nonconvex) with regularization", () => {
    const n = 10;
    const r = minimizeBoxNewton((x, g) => {
      let f = 0; g.fill(0);
      for (let i = 0; i < n - 1; i++) {
        const a = x[i + 1] - x[i] ** 2, b = 1 - x[i];
        f += 100 * a * a + b * b;
        g[i] += -400 * x[i] * a - 2 * b;
        g[i + 1] += 200 * a;
      }
      return f;
    }, new Float64Array(n).fill(-1.2), new Float64Array(n).fill(-5), new Float64Array(n).fill(5), { pgtol: 1e-9 });
    expect(r.converged).toBe(true);
    r.x.forEach((v) => expect(v).toBeCloseTo(1, 6));
  });

  it("is not derailed by infinite values outside the domain", () => {
    const r = minimizeBoxNewton((x, g) => {
      if (x[0] <= 0) return Infinity;
      g[0] = -1 / x[0] + 2;
      return -Math.log(x[0]) + 2 * x[0];
    }, [3], [-1], [10]);
    expect(r.x[0]).toBeCloseTo(0.5, 9);
  });
});
