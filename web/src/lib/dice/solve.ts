/** Optimal and baseline runs of DICE-2013R in the browser, mirroring
 * python/dice2013r/model.py, with the social cost of carbon. */
import { Evaluator, type Penalty } from "./adjoint";
import { carbonPrice, miuFromCarbonPrice } from "./equations";
import { computeExogenous, type Exogenous } from "./exogenous";
import { minimizeBox, type MinimizeOptions } from "./lbfgsb";
import { minimizeBoxNewton } from "./newton";
import { DEFAULT, type Params } from "./params";
import { simulate, type Path } from "./simulate";

export interface SolveInfo {
  iterations: number;
  evaluations: number;
  outerIterations: number;
  converged: boolean;
  maxViolation: number;    // largest normalized state-constraint violation
  ms: number;
}

export interface Solution {
  params: Params;
  exogenous: Exogenous;
  path: Path;
  /** Social cost of carbon, vanilla definition (consumption numeraire), $/tCO2. */
  scc: Float64Array;
  /** SCC with output as numeraire (GAMS scenario driver / Excel sheets). */
  scc_output: Float64Array;
  /** Hotelling carbon price (baseline only). */
  photel: Float64Array | null;
  info: SolveInfo;
}

export interface Controls { miu: ArrayLike<number>; s: ArrayLike<number> }

export interface SolveOptions {
  /** Projected-gradient tolerance for the final Newton phase. */
  pgtol?: number;
  /** Iteration cap for the L-BFGS warm-up phase (0 = straight to Newton). */
  lbfgsIter?: number;
  /** Starting controls, e.g. the previous solution when a parameter changes slightly. */
  warmStart?: Controls;
  /** Feasibility tolerance for state constraints (normalized). */
  ctol?: number;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function initialGuess(ex: Exogenous): Controls {
  const n = ex.params.nperiods;
  const miu = new Float64Array(n), s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    miu[i] = Math.min(ex.miu_up[i], ex.params.miu0 + ((1 - ex.params.miu0) * i) / (n - 1));
    s[i] = ex.optlrsav;
  }
  return { miu, s };
}

interface Problem {
  ex: Exogenous;
  /** Fixed values (NaN = free). */
  miuFixed: Float64Array;
  sFixed: Float64Array;
  damagesOn: boolean;
}

/** Maximize welfare over the free controls, handling CCA <= fosslim and
 * TATM <= tatm_up by an augmented Lagrangian outer loop. */
function optimize(prob: Problem, start: Controls, opts: SolveOptions) {
  const { ex, miuFixed, sFixed, damagesOn } = prob;
  const p = ex.params, n = p.nperiods;
  const ev = new Evaluator(ex);
  const freeM: number[] = [], freeS: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(miuFixed[i])) freeM.push(i);
    if (Number.isNaN(sFixed[i])) freeS.push(i);
  }
  const nv = freeM.length + freeS.length;
  const lo = new Float64Array(nv), hi = new Float64Array(nv), x0 = new Float64Array(nv);
  freeM.forEach((i, k) => { lo[k] = p.miu_lo; hi[k] = ex.miu_up[i]; x0[k] = start.miu[i]; });
  freeS.forEach((i, k) => { lo[freeM.length + k] = 0; hi[freeM.length + k] = 1; x0[freeM.length + k] = start.s[i]; });
  const miu = Float64Array.from(miuFixed, (v, i) => (Number.isNaN(v) ? start.miu[i] : v));
  const s = Float64Array.from(sFixed, (v, i) => (Number.isNaN(v) ? start.s[i] : v));
  const unpack = (x: Float64Array) => {
    freeM.forEach((i, k) => (miu[i] = x[k]));
    freeS.forEach((i, k) => (s[i] = x[freeM.length + k]));
  };

  // Make sure the start is feasible for the objective (e.g. positive consumption).
  unpack(Float64Array.from(x0, (v, k) => Math.min(hi[k], Math.max(lo[k], v))));
  if (!Number.isFinite(ev.evaluate(miu, s, undefined, damagesOn).J)) {
    const g = initialGuess(ex);
    freeM.forEach((i, k) => (x0[k] = g.miu[i]));
    freeS.forEach((i, k) => (x0[freeM.length + k] = g.s[i]));
  }

  const pen: Penalty = { rho: 100, lamCCA: new Float64Array(n), lamTATM: new Float64Array(n) };
  const ctol = opts.ctol ?? 1e-9;
  let x: Float64Array = x0, iterations = 0, evaluations = 0, outer = 0, converged = true, viol = 1, prevViol = Infinity, stagnant = 0;
  const fg = (xv: Float64Array, g: Float64Array) => {
    unpack(xv);
    const r = ev.evaluate(miu, s, pen, damagesOn);
    if (!Number.isFinite(r.J)) return Infinity;
    freeM.forEach((i, k) => (g[k] = r.gradMIU[i]));
    freeS.forEach((i, k) => (g[freeM.length + k] = r.gradS[i]));
    return r.J;
  };
  const pgtol = opts.pgtol ?? 1e-11;
  for (outer = 1; outer <= 60; outer++) {
    // Inexact inner solves: tighten as the constraint violation shrinks.
    const innerTol = outer === 1 ? 1e-6 : Math.max(pgtol, Math.min(1e-6, 1e-2 * viol));
    // Cheap L-BFGS phase to get close, then projected Newton to converge tightly.
    const lbIter = outer === 1 ? (opts.lbfgsIter ?? (opts.warmStart ? 0 : 300)) : 0;
    if (lbIter > 0) {
      const r0 = minimizeBox(fg, x, lo, hi, { maxIter: lbIter, ftol: 1e-12, pgtol: 1e-8 });
      x = r0.x; iterations += r0.iterations; evaluations += r0.evaluations;
    }
    const r = minimizeBoxNewton(fg, x, lo, hi, { pgtol: innerTol, maxIter: 50 });
    x = r.x; iterations += r.iterations; evaluations += r.evaluations;
    converged = r.converged;
    unpack(x);
    const e = ev.evaluate(miu, s, pen, damagesOn);
    viol = 0;
    let multiplierChange = 0, lamMax = 1;
    for (let i = 1; i < n; i++) {
      viol = Math.max(viol, e.gCCA[i], e.gTATM[i]);
      const lc = Math.max(0, pen.lamCCA[i] + pen.rho * e.gCCA[i]);
      const lt = Math.max(0, pen.lamTATM[i] + pen.rho * e.gTATM[i]);
      multiplierChange = Math.max(multiplierChange, Math.abs(lc - pen.lamCCA[i]), Math.abs(lt - pen.lamTATM[i]));
      lamMax = Math.max(lamMax, lc, lt);
      pen.lamCCA[i] = lc; pen.lamTATM[i] = lt;
    }
    if (viol <= ctol && multiplierChange <= 1e-5 * lamMax) {
      if (innerTol <= pgtol) break;
      viol = 0; // constraints satisfied but inner solve was loose: one more tight pass
      continue;
    }
    if (viol > 0.25 * prevViol) {
      // Penalty at its cap and violation no longer shrinking: the constraints
      // cannot be met (e.g. a temperature cap below what inertia allows).
      if (pen.rho >= 1e8 && viol > 0.9 * prevViol && ++stagnant >= 3) break;
      pen.rho = Math.min(pen.rho * 10, 1e10);
    } else stagnant = 0;
    prevViol = viol;
  }
  unpack(x);
  // Exact KKT multipliers for the state constraints at the converged controls,
  // then the SCC from the Lagrangian (includes the shadow value of binding
  // temperature or resource constraints, like the GAMS marginals).
  const mult = kktMultipliers(ev, miu, s, freeM, freeS, lo, hi, x, damagesOn, pen);
  const final = ev.evaluate(miu, s, mult, damagesOn);
  const scc = new Float64Array(n), sccOut = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    scc[i] = (-1000 * final.dJdE[i]) / final.dJdC[i];
    sccOut[i] = (-1000 * final.dJdE[i]) / final.dJdY[i];
  }
  return { miu, s, scc, sccOut, iterations, evaluations, outer, converged, viol: Math.max(0, viol) };
}

/** Solve min ||G nu + r||, nu >= 0 over the free controls, for the multipliers
 * of the (nearly) binding state constraints. G's columns are constraint gradients. */
function kktMultipliers(ev: Evaluator, miu: Float64Array, s: Float64Array, freeM: number[], freeS: number[],
  lo: Float64Array, hi: Float64Array, x: Float64Array, damagesOn: boolean, al: Penalty): Penalty {
  const n = ev.n;
  const zero = (): Penalty => ({ rho: 1, lamCCA: new Float64Array(n), lamTATM: new Float64Array(n), linear: true });
  const base = ev.evaluate(miu, s, undefined, damagesOn);
  // Candidate constraints: those with positive AL multiplier estimates or at the boundary.
  const cands: { kind: "CCA" | "TATM"; i: number }[] = [];
  for (let i = 1; i < n; i++) {
    if (al.lamCCA[i] > 0 || base.gCCA[i] > -1e-7) cands.push({ kind: "CCA", i });
    if (al.lamTATM[i] > 0 || base.gTATM[i] > -1e-7) cands.push({ kind: "TATM", i });
  }
  if (cands.length === 0) return zero();
  // Free controls strictly inside their bounds.
  const nf = freeM.length;
  const rows: { m: boolean; i: number }[] = [];
  freeM.forEach((i, k) => { if (x[k] > lo[k] + 1e-9 && x[k] < hi[k] - 1e-9) rows.push({ m: true, i }); });
  freeS.forEach((i, k) => { if (x[nf + k] > lo[nf + k] + 1e-9 && x[nf + k] < hi[nf + k] - 1e-9) rows.push({ m: false, i }); });
  const grad = (e: { gradMIU: Float64Array; gradS: Float64Array }) => rows.map((r) => (r.m ? e.gradMIU[r.i] : e.gradS[r.i]));
  const r0 = grad(base);
  const G: number[][] = cands.map((c) => {
    const pen = zero();
    (c.kind === "CCA" ? pen.lamCCA : pen.lamTATM)[c.i] = 1;
    const gj = grad(ev.evaluate(miu, s, pen, damagesOn));
    return gj.map((v, k) => v - r0[k]);
  });
  // Active-set NNLS (Lawson-Hanson style, small dense).
  const k = cands.length;
  const GtG = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => G[a].reduce((t, v, q) => t + v * G[b][q], 0)));
  const Gtr = G.map((col) => -col.reduce((t, v, q) => t + v * r0[q], 0));
  const scale = Math.max(1e-300, ...GtG.map((row, a) => row[a]));
  let active = new Array(k).fill(true);
  let nu = new Array(k).fill(0);
  for (let pass = 0; pass < 3 * k + 5; pass++) {
    const idx = active.map((on, a) => (on ? a : -1)).filter((a) => a >= 0);
    const sol = solveSym(idx.map((a) => idx.map((b) => GtG[a][b] + (a === b ? 1e-13 * scale : 0))), idx.map((a) => Gtr[a]));
    nu = new Array(k).fill(0);
    idx.forEach((a, q) => (nu[a] = sol[q]));
    const neg = nu.findIndex((v, a) => active[a] && v < 0);
    if (neg < 0) break;
    active = active.map((on, a) => on && nu[a] > 0);
  }
  const pen = zero();
  cands.forEach((c, a) => ((c.kind === "CCA" ? pen.lamCCA : pen.lamTATM)[c.i] = Math.max(0, nu[a])));
  return pen;
}

/** Solve a small symmetric positive (semi)definite system by Gaussian elimination with pivoting. */
function solveSym(A: number[][], b: number[]): number[] {
  const k = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (M[c][c] === 0) continue;
    for (let r = c + 1; r < k; r++) {
      const f = M[r][c] / M[c][c];
      for (let q = c; q <= k; q++) M[r][q] -= f * M[c][q];
    }
  }
  const x = new Array(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let v = M[r][k];
    for (let q = r + 1; q < k; q++) v -= M[r][q] * x[q];
    x[r] = M[r][r] === 0 ? 0 : v / M[r][r];
  }
  return x;
}

function fixedArrays(ex: Exogenous) {
  const p = ex.params, n = p.nperiods;
  const miuFixed = new Float64Array(n).fill(NaN), sFixed = new Float64Array(n).fill(NaN);
  for (let i = n - p.nfixsav; i < n; i++) sFixed[i] = ex.optlrsav;
  return { miuFixed, sFixed };
}

/** GAMS ifopt = 1: maximize welfare, MIU(2010) fixed at miu0. */
export function solveOptimal(p: Params = DEFAULT, opts: SolveOptions = {}): Solution {
  const t0 = now();
  const ex = computeExogenous(p);
  const { miuFixed, sFixed } = fixedArrays(ex);
  if (p.fix_miu0) miuFixed[0] = p.miu0;
  const r = optimize({ ex, miuFixed, sFixed, damagesOn: true }, opts.warmStart ?? initialGuess(ex), opts);
  return {
    params: p, exogenous: ex, path: simulate(ex, r.miu, r.s), scc: r.scc, scc_output: r.sccOut, photel: null,
    info: { iterations: r.iterations, evaluations: r.evaluations, outerIterations: r.outer, converged: r.converged, maxViolation: r.viol, ms: now() - t0 },
  };
}

/** GAMS ifopt = 0: Hotelling rent from a no-damage solve, then the carbon price
 * fixed at max(Hotelling rent, baseline price) for periods 1..tnopol. */
export function solveBaseline(p: Params = DEFAULT, opts: SolveOptions = {}): Solution {
  const t0 = now();
  const ex = computeExogenous(p);
  const n = p.nperiods;
  const start = opts.warmStart ?? initialGuess(ex);
  const step1 = fixedArrays(ex);
  const hot = optimize({ ex, ...step1, damagesOn: false }, start, opts);
  const photel = Float64Array.from(hot.miu, (m, i) => carbonPrice(ex.pbacktime[i], m, ex.partfract[i], p.expcost2));

  const step2 = fixedArrays(ex);
  for (let i = 0; i < n && i + 1 <= p.tnopol; i++) {
    const price = Math.max(photel[i], ex.cpricebase[i]);
    const m = miuFromCarbonPrice(price, ex.pbacktime[i], ex.partfract[i], p.expcost2);
    step2.miuFixed[i] = Math.min(ex.miu_up[i], Math.max(p.miu_lo, m));
  }
  const r = optimize({ ex, ...step2, damagesOn: true }, { miu: hot.miu, s: hot.s }, opts);
  return {
    params: p, exogenous: ex, path: simulate(ex, r.miu, r.s), scc: r.scc, scc_output: r.sccOut, photel,
    info: {
      iterations: hot.iterations + r.iterations, evaluations: hot.evaluations + r.evaluations,
      outerIterations: hot.outer + r.outer, converged: hot.converged && r.converged, maxViolation: r.viol, ms: now() - t0,
    },
  };
}
