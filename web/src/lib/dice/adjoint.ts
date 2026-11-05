/** Welfare and its exact gradient with respect to the controls, by a hand-coded
 * reverse (adjoint) pass through the simulation in simulate.ts.
 *
 * Objective minimized: J = -UTILITY + penalty(state constraints), where the
 * penalty is the augmented-Lagrangian term for CCA <= fosslim and TATM <= tatm_up.
 * The pass also returns, per period, dJ/dE (one more GtCO2 emitted), dJ/dC (one
 * more unit of consumption) and dJ/dY (one more unit of output), from which the
 * social cost of carbon follows.
 */
import type { Exogenous } from "./exogenous";
import { CO2_PER_C } from "./equations";

/** Augmented-Lagrangian data for inequality constraints g <= 0, with
 * g = CCA/fosslim - 1 and g = TATM/tatm_up - 1 (normalized). */
export interface Penalty {
  rho: number;
  lamCCA: Float64Array;
  lamTATM: Float64Array;
  /** If true, add the plain Lagrangian term sum(lam * g) instead of the
   * augmented-Lagrangian penalty (used to evaluate KKT multipliers). */
  linear?: boolean;
}

export interface Evaluation {
  J: number;              // objective to minimize; Infinity if infeasible
  utility: number;
  gradMIU: Float64Array;  // dJ/dMIU(t)
  gradS: Float64Array;    // dJ/dS(t)
  dJdE: Float64Array;
  dJdC: Float64Array;
  dJdY: Float64Array;
  gCCA: Float64Array;     // constraint values
  gTATM: Float64Array;
}

/** Workspace reused across evaluations to avoid allocation in the optimizer loop. */
export class Evaluator {
  readonly n: number;
  private ws: Record<string, Float64Array>;
  readonly out: Evaluation;

  constructor(readonly ex: Exogenous) {
    const n = (this.n = ex.params.nperiods);
    const names = ["K", "YG", "EIND", "E", "CCA", "MAT", "MU", "ML", "T", "TO", "DF", "Y", "C",
      "Kb", "MATb", "MUb", "MLb", "Tb", "TOb", "CCAb", "Ib", "EINDb"];
    this.ws = Object.fromEntries(names.map((k) => [k, new Float64Array(n)]));
    const mk = () => new Float64Array(n);
    this.out = { J: 0, utility: 0, gradMIU: mk(), gradS: mk(), dJdE: mk(), dJdC: mk(), dJdY: mk(), gCCA: mk(), gTATM: mk() };
  }

  evaluate(miu: ArrayLike<number>, s: ArrayLike<number>, penalty?: Penalty, damagesOn = true): Evaluation {
    const { ex, n, out } = this;
    const p = ex.params;
    const { K, YG, EIND, E, CCA, MAT, MU, ML, T, TO, DF, Y, C, Kb, MATb, MUb, MLb, Tb, TOb, CCAb, Ib, EINDb } = this.ws;
    const cm = ex.carbon;
    const ct = p.tstep / CO2_PER_C;
    const dkf = (1 - p.dk) ** p.tstep;
    const a2 = damagesOn ? p.a2 : 0;
    const th = p.expcost2, al = p.elasmu, gm = p.gama;
    const wscale = p.tstep * p.scale1;
    const lnmateq = Math.log(p.mateq);
    const c1 = ex.c1, lam = p.fco22x / p.t2xco2;
    const fcoef = p.fco22x / Math.LN2;

    // ---- forward ----
    K[0] = p.k0; MAT[0] = p.mat0; MU[0] = p.mu0; ML[0] = p.ml0; T[0] = p.tatm0; TO[0] = p.tocean0; CCA[0] = p.cca0;
    let total = 0;
    let feasible = true;
    for (let i = 0; i < n; i++) {
      YG[i] = ex.al[i] * (ex.l[i] / 1000) ** (1 - gm) * K[i] ** gm;
      EIND[i] = ex.sigma[i] * YG[i] * (1 - miu[i]);
      E[i] = EIND[i] + ex.etree[i];
      DF[i] = p.a1 * T[i] + a2 * T[i] ** p.a3;
      const ab = YG[i] * ex.cost1[i] * miu[i] ** th * ex.partfract[i] ** (1 - th);
      Y[i] = YG[i] * (1 - DF[i]) - ab;
      C[i] = Y[i] - s[i] * Y[i];
      if (!(C[i] > 0) || !(K[i] > 0)) feasible = false;
      const cpc = (1000 * C[i]) / ex.l[i];
      const u = (cpc ** (1 - al) - 1) / (1 - al) - 1;
      total += u * ex.l[i] * ex.rr[i];
      if (i + 1 < n) {
        K[i + 1] = dkf * K[i] + p.tstep * s[i] * Y[i];
        CCA[i + 1] = CCA[i] + EIND[i] * ct;
        MAT[i + 1] = MAT[i] * cm.b11 + MU[i] * cm.b21 + E[i] * ct;
        MU[i + 1] = MAT[i] * cm.b12 + MU[i] * cm.b22 + ML[i] * cm.b32;
        ML[i + 1] = ML[i] * cm.b33 + MU[i] * cm.b23;
        if (!(MAT[i + 1] > 0)) { feasible = false; break; }
        const f = fcoef * (Math.log(MAT[i + 1]) - lnmateq) + ex.forcoth[i + 1];
        T[i + 1] = T[i] + c1 * (f - lam * T[i] - p.c3 * (T[i] - TO[i]));
        TO[i + 1] = TO[i] + p.c4 * (T[i] - TO[i]);
      }
    }
    const utility = wscale * total + p.scale2;
    if (!feasible || !Number.isFinite(utility)) {
      out.J = Infinity; out.utility = NaN;
      return out;
    }

    // ---- constraints and penalty ----
    let pen = 0;
    Kb.fill(0); MATb.fill(0); MUb.fill(0); MLb.fill(0); Tb.fill(0); TOb.fill(0); CCAb.fill(0); Ib.fill(0); EINDb.fill(0);
    for (let i = 0; i < n; i++) {
      out.gCCA[i] = CCA[i] / p.fosslim - 1;
      out.gTATM[i] = T[i] / p.tatm_up - 1;
      if (penalty && penalty.linear && i > 0) {
        pen += penalty.lamCCA[i] * out.gCCA[i] + penalty.lamTATM[i] * out.gTATM[i];
        CCAb[i] += penalty.lamCCA[i] / p.fosslim;
        Tb[i] += penalty.lamTATM[i] / p.tatm_up;
      } else if (penalty && i > 0) {
        const { rho } = penalty;
        const mc = Math.max(0, penalty.lamCCA[i] + rho * out.gCCA[i]);
        const mt = Math.max(0, penalty.lamTATM[i] + rho * out.gTATM[i]);
        pen += (mc * mc - penalty.lamCCA[i] ** 2 + mt * mt - penalty.lamTATM[i] ** 2) / (2 * rho);
        CCAb[i] += mc / p.fosslim;
        Tb[i] += mt / p.tatm_up;
      }
    }
    out.J = -utility + pen;
    out.utility = utility;

    // ---- reverse ----
    for (let i = n - 1; i >= 0; i--) {
      // Within period i. Ib[i], EINDb[i] hold contributions from the transition i -> i+1.
      const w = wscale * ex.l[i] * ex.rr[i];
      const cpc = (1000 * C[i]) / ex.l[i];
      const cb = -w * cpc ** -al * (1000 / ex.l[i]); // dJ/dC (direct)
      out.dJdC[i] = cb;
      // C = Y - I, I = S*Y
      const ibTot = Ib[i] - cb;
      const yb = cb + ibTot * s[i];
      out.dJdY[i] = yb;
      out.gradS[i] = ibTot * Y[i];
      // Y = YG*(1-DF) - AB
      const mu_ = miu[i], pf1 = ex.partfract[i] ** (1 - th);
      let ygb = yb * (1 - DF[i]) - yb * ex.cost1[i] * mu_ ** th * pf1;
      const dfb = -yb * YG[i];
      let mub = -yb * YG[i] * ex.cost1[i] * th * mu_ ** (th - 1) * pf1;
      Tb[i] += dfb * (p.a1 + (a2 === 0 ? 0 : a2 * p.a3 * T[i] ** (p.a3 - 1)));
      // EIND = sigma*YG*(1-MIU)
      ygb += EINDb[i] * ex.sigma[i] * (1 - mu_);
      mub += -EINDb[i] * ex.sigma[i] * YG[i];
      out.gradMIU[i] = mub;
      // YG = al*L*K^gama
      Kb[i] += (ygb * gm * YG[i]) / K[i];
      // E = EIND + etree; dJ/dE(i) comes only through MAT(i+1)
      out.dJdE[i] = i + 1 < n ? MATb[i + 1] * ct : 0;

      if (i === 0) break;
      // MAT(i) enters FORC(i) -> T(i)
      MATb[i] += (Tb[i] * c1 * fcoef) / MAT[i];
      // Transition i-1 -> i
      const j = i - 1;
      Kb[j] += Kb[i] * dkf;
      Ib[j] += Kb[i] * p.tstep;
      Tb[j] += Tb[i] * (1 - c1 * lam - c1 * p.c3) + TOb[i] * p.c4;
      TOb[j] += Tb[i] * c1 * p.c3 + TOb[i] * (1 - p.c4);
      MATb[j] += MATb[i] * cm.b11 + MUb[i] * cm.b12;
      MUb[j] += MATb[i] * cm.b21 + MUb[i] * cm.b22 + MLb[i] * cm.b23;
      MLb[j] += MUb[i] * cm.b32 + MLb[i] * cm.b33;
      EINDb[j] += MATb[i] * ct + CCAb[i] * ct; // via E(j) -> MAT(i) and CCA(i)
      CCAb[j] += CCAb[i];
    }
    return out;
  }
}
