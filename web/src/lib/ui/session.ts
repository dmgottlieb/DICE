/** Solver session used by the Web Worker: solves the optimal and baseline runs
 * for a parameter set, warm-starting from the previous solutions. Pure and
 * synchronous, so it can be tested directly. */
import { DEFAULT, type Params } from "../dice/params";
import { solveBaseline, solveOptimal, type Solution } from "../dice/solve";
import { baselineParams } from "./controls";

export interface Results {
  optimal: Solution;
  /** null when the baseline has no solution (e.g. damages exceed output). */
  baseline: Solution | null;
  baselineError: string | null;
  reference: Solution;   // DICE defaults, optimal
  ms: number;
}

export class SolverSession {
  private lastOpt: Solution | null = null;
  private lastBase: Solution | null = null;
  readonly reference: Solution;

  constructor() {
    this.reference = solveOptimal(DEFAULT);
  }

  solve(p: Params): Results {
    const t0 = performance.now();
    const optimal = this.solveWithFallback((ws) => solveOptimal(p, ws), this.lastOpt);
    this.lastOpt = optimal;
    let baseline: Solution | null = null, baselineError: string | null = null;
    try {
      baseline = this.solveWithFallback((ws) => solveBaseline(baselineParams(p), ws), this.lastBase);
      this.lastBase = baseline;
    } catch (e) {
      baselineError = e instanceof Error ? e.message : String(e);
    }
    return { optimal, baseline, baselineError, reference: this.reference, ms: performance.now() - t0 };
  }

  /** Warm start from the previous solution; if that fails to converge, solve cold. */
  private solveWithFallback(run: (o: { warmStart?: { miu: Float64Array; s: Float64Array } }) => Solution, prev: Solution | null): Solution {
    if (prev) {
      try {
        const sol = run({ warmStart: { miu: prev.path.MIU, s: prev.path.S } });
        if (sol.info.converged && Number.isFinite(sol.path.UTILITY)) return sol;
      } catch { /* fall through to a cold start */ }
    }
    return run({});
  }
}
