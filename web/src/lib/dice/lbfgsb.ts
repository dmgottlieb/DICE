/** Bound-constrained minimization by projected L-BFGS with an active set.
 *
 * Variables at a bound whose gradient pushes outward are held there; the
 * quasi-Newton direction is computed on the remaining free variables, and
 * steps are projected back onto the box with an Armijo backtracking search.
 * Bounds are therefore reached exactly, which matters for DICE, where the
 * control rate sits on its upper bound for decades.
 */

export type ObjectiveGrad = (x: Float64Array, g: Float64Array) => number;

export interface MinimizeOptions {
  memory?: number;      // number of correction pairs (default 12)
  maxIter?: number;     // default 5000
  pgtol?: number;       // stop when max |P(x - g) - x| < pgtol (default 1e-10)
  ftol?: number;        // stop when relative decrease < ftol for 5 iterations (default 1e-16)
}

export interface MinimizeResult {
  x: Float64Array;
  f: number;
  iterations: number;
  evaluations: number;
  projGradNorm: number;
  converged: boolean;
  message: string;
}

export function minimizeBox(fg: ObjectiveGrad, x0: ArrayLike<number>, lo: ArrayLike<number>, hi: ArrayLike<number>,
  opts: MinimizeOptions = {}): MinimizeResult {
  const n = x0.length;
  const m = opts.memory ?? 12, maxIter = opts.maxIter ?? 5000;
  const pgtol = opts.pgtol ?? 1e-10, ftol = opts.ftol ?? 1e-16;
  for (let i = 0; i < n; i++) if (!(lo[i] <= hi[i])) throw new Error(`empty box at ${i}`);

  const clamp = (v: number, i: number) => Math.min(hi[i], Math.max(lo[i], v));
  let x = Float64Array.from(x0, clamp);
  let g = new Float64Array(n);
  let f = fg(x, g);
  let evaluations = 1;
  if (!Number.isFinite(f)) throw new Error("objective not finite at the starting point");

  const S: Float64Array[] = [], Y: Float64Array[] = [];
  const mask = new Uint8Array(n);
  const q = new Float64Array(n), d = new Float64Array(n);
  const alpha = new Float64Array(m), rhoK = new Float64Array(m);
  let xn = new Float64Array(n), gn = new Float64Array(n);
  let small = 0, iter = 0, pgn = Infinity, message = "max iterations";

  const projGradNorm = () => {
    let r = 0;
    for (let i = 0; i < n; i++) r = Math.max(r, Math.abs(clamp(x[i] - g[i], i) - x[i]));
    return r;
  };

  for (iter = 0; iter < maxIter; iter++) {
    pgn = projGradNorm();
    if (pgn < pgtol) { message = "projected gradient below tolerance"; break; }

    for (let i = 0; i < n; i++) {
      mask[i] = (x[i] <= lo[i] && g[i] > 0) || (x[i] >= hi[i] && g[i] < 0) ? 0 : 1;
      q[i] = mask[i] ? g[i] : 0;
    }
    // Two-loop recursion on the free subspace.
    const k = S.length;
    let gamma = 1, usable = 0;
    for (let j = k - 1; j >= 0; j--) {
      let sy = 0, sq = 0;
      const s = S[j], y = Y[j];
      for (let i = 0; i < n; i++) if (mask[i]) { sy += s[i] * y[i]; sq += s[i] * q[i]; }
      if (sy <= 1e-300) { rhoK[j] = 0; alpha[j] = 0; continue; }
      rhoK[j] = 1 / sy;
      alpha[j] = rhoK[j] * sq;
      for (let i = 0; i < n; i++) if (mask[i]) q[i] -= alpha[j] * y[i];
      if (usable === 0) {
        let yy = 0;
        for (let i = 0; i < n; i++) if (mask[i]) yy += y[i] * y[i];
        gamma = sy / yy;
      }
      usable++;
    }
    for (let i = 0; i < n; i++) q[i] *= gamma;
    for (let j = 0; j < k; j++) {
      if (rhoK[j] === 0) continue;
      const s = S[j], y = Y[j];
      let yr = 0;
      for (let i = 0; i < n; i++) if (mask[i]) yr += y[i] * q[i];
      const beta = rhoK[j] * yr;
      for (let i = 0; i < n; i++) if (mask[i]) q[i] += s[i] * (alpha[j] - beta);
    }
    let gd = 0, dmax = 0;
    for (let i = 0; i < n; i++) { d[i] = mask[i] ? -q[i] : 0; gd += g[i] * d[i]; dmax = Math.max(dmax, Math.abs(d[i])); }
    if (!(gd < 0)) {
      // Not a descent direction: fall back to steepest descent.
      S.length = 0; Y.length = 0;
      gd = 0; dmax = 0;
      for (let i = 0; i < n; i++) { d[i] = mask[i] ? -g[i] : 0; gd += g[i] * d[i]; dmax = Math.max(dmax, Math.abs(d[i])); }
    }

    // Projected backtracking line search.
    let t = usable > 0 ? 1 : Math.min(1, 0.1 / dmax);
    let fn = Infinity, accepted = false;
    for (let ls = 0; ls < 60; ls++) {
      let decrease = 0;
      for (let i = 0; i < n; i++) { xn[i] = clamp(x[i] + t * d[i], i); decrease += g[i] * (xn[i] - x[i]); }
      fn = fg(xn, gn);
      evaluations++;
      if (Number.isFinite(fn) && fn <= f + 1e-4 * decrease) { accepted = true; break; }
      t *= 0.5;
    }
    if (!accepted) {
      if (S.length > 0) { S.length = 0; Y.length = 0; continue; }
      message = "line search failed";
      break;
    }

    const s = new Float64Array(n), y = new Float64Array(n);
    let sy = 0, ss = 0, yy = 0;
    for (let i = 0; i < n; i++) {
      s[i] = xn[i] - x[i]; y[i] = gn[i] - g[i];
      sy += s[i] * y[i]; ss += s[i] * s[i]; yy += y[i] * y[i];
    }
    if (sy > 1e-12 * Math.sqrt(ss * yy)) {
      S.push(s); Y.push(y);
      if (S.length > m) { S.shift(); Y.shift(); }
    }
    const rel = (f - fn) / Math.max(Math.abs(f), Math.abs(fn), 1);
    small = rel <= ftol ? small + 1 : 0;
    [x, xn] = [xn, x];
    [g, gn] = [gn, g];
    f = fn;
    if (small >= 5) { message = "relative decrease below tolerance"; pgn = projGradNorm(); break; }
  }
  return { x, f, iterations: iter, evaluations, projGradNorm: pgn, converged: message !== "max iterations" && message !== "line search failed", message };
}
