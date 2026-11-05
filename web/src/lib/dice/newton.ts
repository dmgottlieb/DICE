/** Projected Newton method for bound-constrained minimization (Bertsekas, 1982).
 *
 * The Hessian is formed by finite differences of the exact gradient (cheap
 * here: the problem has ~110 variables and a gradient costs microseconds),
 * restricted to the free variables, regularized if not positive definite, and
 * factored by Cholesky. Variables within eps of a bound with the gradient
 * pointing outward are treated as active and moved by a projected gradient
 * step. Converges quadratically near the solution.
 */
import type { ObjectiveGrad } from "./lbfgsb";

export interface NewtonOptions {
  maxIter?: number;     // default 200
  pgtol?: number;       // stop when max |P(x - g) - x| < pgtol (default 1e-11)
  fdStep?: number;      // relative finite-difference step for the Hessian (default 1e-7)
}

export interface NewtonResult {
  x: Float64Array;
  f: number;
  iterations: number;
  evaluations: number;
  projGradNorm: number;
  converged: boolean;
  message: string;
}

/** In-place Cholesky of the leading k x k block of A (row-major, stride k). Returns false if not PD. */
function cholesky(A: Float64Array, k: number): boolean {
  for (let j = 0; j < k; j++) {
    let d = A[j * k + j];
    for (let p = 0; p < j; p++) d -= A[j * k + p] ** 2;
    if (!(d > 0)) return false;
    const ljj = Math.sqrt(d);
    A[j * k + j] = ljj;
    for (let i = j + 1; i < k; i++) {
      let v = A[i * k + j];
      for (let p = 0; p < j; p++) v -= A[i * k + p] * A[j * k + p];
      A[i * k + j] = v / ljj;
    }
  }
  return true;
}

function choleskySolve(L: Float64Array, k: number, b: Float64Array): void {
  for (let i = 0; i < k; i++) {
    let v = b[i];
    for (let p = 0; p < i; p++) v -= L[i * k + p] * b[p];
    b[i] = v / L[i * k + i];
  }
  for (let i = k - 1; i >= 0; i--) {
    let v = b[i];
    for (let p = i + 1; p < k; p++) v -= L[p * k + i] * b[p];
    b[i] = v / L[i * k + i];
  }
}

export function minimizeBoxNewton(fg: ObjectiveGrad, x0: ArrayLike<number>, lo: ArrayLike<number>, hi: ArrayLike<number>,
  opts: NewtonOptions = {}): NewtonResult {
  const n = x0.length;
  const maxIter = opts.maxIter ?? 200, pgtol = opts.pgtol ?? 1e-11, rel = opts.fdStep ?? 1e-7;
  const clamp = (v: number, i: number) => Math.min(hi[i], Math.max(lo[i], v));
  const x = Float64Array.from(x0, clamp);
  const g = new Float64Array(n), gp = new Float64Array(n), xt = new Float64Array(n), gt = new Float64Array(n);
  const H = new Float64Array(n * n), A = new Float64Array(n * n);
  const d = new Float64Array(n), rhs = new Float64Array(n);
  const free: number[] = [];
  const active = new Uint8Array(n);
  let f = fg(x, g), evaluations = 1;
  if (!Number.isFinite(f)) throw new Error("objective not finite at the starting point");
  let iter = 0, pgn = Infinity, message = "max iterations", stalls = 0;

  for (iter = 0; iter < maxIter; iter++) {
    pgn = 0;
    for (let i = 0; i < n; i++) pgn = Math.max(pgn, Math.abs(clamp(x[i] - g[i], i) - x[i]));
    if (pgn < pgtol) { message = "projected gradient below tolerance"; break; }
    const eps = Math.min(1e-3, pgn);

    free.length = 0;
    for (let i = 0; i < n; i++) {
      active[i] = (x[i] <= lo[i] + eps && g[i] > 0) || (x[i] >= hi[i] - eps && g[i] < 0) ? 1 : 0;
      if (!active[i]) free.push(i);
    }
    const k = free.length;

    // Finite-difference Hessian columns for free variables.
    let hdiagMax = 0;
    for (let c = 0; c < k; c++) {
      const j = free[c];
      let h = rel * Math.max(1, Math.abs(x[j]));
      if (x[j] + h > hi[j]) h = -h;
      xt.set(x); xt[j] = x[j] + h;
      const ft = fg(xt, gp); evaluations++;
      if (!Number.isFinite(ft)) { h = -h; xt[j] = x[j] + h; fg(xt, gp); evaluations++; }
      for (let r = 0; r < k; r++) H[r * k + c] = (gp[free[r]] - g[free[r]]) / h;
    }
    for (let r = 0; r < k; r++) for (let c = r + 1; c < k; c++) {
      const v = 0.5 * (H[r * k + c] + H[c * k + r]);
      H[r * k + c] = v; H[c * k + r] = v;
    }
    for (let r = 0; r < k; r++) hdiagMax = Math.max(hdiagMax, Math.abs(H[r * k + r]));

    // Regularize until positive definite, then solve H d = -g on the free set.
    let tau = 0, ok = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      A.set(H.subarray(0, k * k));
      for (let r = 0; r < k; r++) A[r * k + r] += tau;
      if (cholesky(A, k)) { ok = true; break; }
      tau = tau === 0 ? Math.max(1e-10 * hdiagMax, 1e-14) : tau * 10;
    }
    d.fill(0);
    if (ok && k > 0) {
      for (let r = 0; r < k; r++) rhs[r] = -g[free[r]];
      choleskySolve(A, k, rhs);
      for (let r = 0; r < k; r++) d[free[r]] = rhs[r];
    } else {
      for (const i of free) d[i] = -g[i];
    }
    // Active variables: diagonally scaled gradient step toward the bound.
    for (let i = 0; i < n; i++) if (active[i]) d[i] = -g[i] / Math.max(Math.abs(hdiagMax), 1e-12) * (hdiagMax > 0 ? 1 : 0) || -g[i];

    // Armijo search along the projection arc.
    let alpha = 1, accepted = false, ft = Infinity;
    for (let ls = 0; ls < 50; ls++) {
      let model = 0;
      for (let i = 0; i < n; i++) {
        xt[i] = clamp(x[i] + alpha * d[i], i);
        model += g[i] * (xt[i] - x[i]);
      }
      ft = fg(xt, gt); evaluations++;
      if (Number.isFinite(ft) && ft <= f + 1e-4 * Math.min(model, 0)) { accepted = true; break; }
      alpha *= 0.5;
    }
    if (!accepted) { message = "line search failed"; break; }
    const df = f - ft;
    x.set(xt); g.set(gt); f = ft;
    // Stop when the objective no longer improves measurably (round-off level).
    stalls = df <= 1e-15 * Math.max(1, Math.abs(f)) ? stalls + 1 : 0;
    if (stalls >= 3) { message = "no further progress"; break; }
  }
  return { x, f, iterations: iter, evaluations, projGradNorm: pgn,
    converged: message === "projected gradient below tolerance" || message === "no further progress", message };
}
