import { describe, expect, it } from "vitest";
import { minimizeBox } from "../src/lib/dice/lbfgsb";

describe("minimizeBox", () => {
  it("solves an unconstrained quadratic", () => {
    const c = [1, -2, 3, 0.5];
    const r = minimizeBox((x, g) => {
      let f = 0;
      for (let i = 0; i < 4; i++) { const w = i + 1; f += 0.5 * w * (x[i] - c[i]) ** 2; g[i] = w * (x[i] - c[i]); }
      return f;
    }, [0, 0, 0, 0], [-10, -10, -10, -10], [10, 10, 10, 10]);
    expect(r.converged).toBe(true);
    r.x.forEach((v, i) => expect(v).toBeCloseTo(c[i], 9));
  });

  it("puts variables exactly on active bounds", () => {
    const c = [2, -2, 0.5];
    const r = minimizeBox((x, g) => {
      let f = 0;
      for (let i = 0; i < 3; i++) { f += (x[i] - c[i]) ** 2; g[i] = 2 * (x[i] - c[i]); }
      return f;
    }, [0, 0, 0], [-1, -1, -1], [1, 1, 1]);
    expect(Array.from(r.x)).toEqual([1, -1, expect.closeTo(0.5, 10)]);
  });

  it("minimizes the Rosenbrock function in 20 dimensions", () => {
    const n = 20;
    const r = minimizeBox((x, g) => {
      let f = 0; g.fill(0);
      for (let i = 0; i < n - 1; i++) {
        const a = x[i + 1] - x[i] ** 2, b = 1 - x[i];
        f += 100 * a * a + b * b;
        g[i] += -400 * x[i] * a - 2 * b;
        g[i + 1] += 200 * a;
      }
      return f;
    }, new Float64Array(n).fill(-1), new Float64Array(n).fill(-5), new Float64Array(n).fill(5), { maxIter: 20000 });
    expect(r.converged).toBe(true);
    r.x.forEach((v) => expect(v).toBeCloseTo(1, 6));
  });

  it("solves a bound-constrained Rosenbrock with the minimizer outside the box", () => {
    const r = minimizeBox((x, g) => {
      const a = x[1] - x[0] ** 2, b = 1 - x[0];
      g[0] = -400 * x[0] * a - 2 * b; g[1] = 200 * a;
      return 100 * a * a + b * b;
    }, [0, 0], [-2, -2], [0.5, 2]);
    // With x0 <= 0.5 the constrained optimum is x0 = 0.5, x1 = 0.25.
    expect(r.x[0]).toBe(0.5);
    expect(r.x[1]).toBeCloseTo(0.25, 8);
  });

  it("backs off from infeasible (infinite) regions", () => {
    // f = -log(x) + x: minimum at x = 1, undefined for x <= 0.
    const r = minimizeBox((x, g) => {
      if (x[0] <= 0) return Infinity;
      g[0] = -1 / x[0] + 1;
      return -Math.log(x[0]) + x[0];
    }, [5], [-10], [10]);
    expect(r.x[0]).toBeCloseTo(1, 8);
  });

  it("rejects an empty box", () => {
    expect(() => minimizeBox(() => 0, [0], [1], [0])).toThrow();
  });
});
