"""Pyomo formulation of DICE-2013R, a line-by-line transcription of the GAMS
model in DICE2013R_110513_vanilla.gms, solved with Ipopt.

Two runs are supported, as in the GAMS file:

* ``solve_optimal``  (GAMS ifopt = 1): maximize welfare with MIU(2010) fixed at miu0.
* ``solve_baseline`` (GAMS ifopt = 0): first solve with no damages to obtain the
  Hotelling rent on fossil fuels, then fix the carbon price for periods
  1..tnopol at max(Hotelling rent, baseline carbon price) and re-solve with
  damages.
"""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path as FsPath

import numpy as np
import pyomo.environ as pyo

from . import equations as eq
from .exogenous import Exogenous, compute
from .params import DEFAULT, Params
from .simulate import Path, simulate

VARIABLES = [
    "MIU", "FORC", "TATM", "TOCEAN", "MAT", "MU", "ML", "E", "EIND", "C", "K", "CPC",
    "I", "S", "RI", "Y", "YGROSS", "YNET", "DAMAGES", "DAMFRAC", "ABATECOST", "MCABATE",
    "CCA", "PERIODU", "CPRICE", "CEMUTOTPER",
]
NONNEGATIVE = {"MIU", "TATM", "MAT", "MU", "ML", "Y", "YGROSS", "C", "K", "I"}


def find_ipopt() -> str | None:
    """Locate an Ipopt executable: $IPOPT, PATH, or the IDAES extensions dir."""
    candidates = [os.environ.get("IPOPT"), shutil.which("ipopt"),
                  str(FsPath.home() / ".idaes" / "bin" / "ipopt")]
    for c in candidates:
        if c and FsPath(c).is_file() and os.access(c, os.X_OK):
            return c
    return None


@dataclass
class Solution:
    path: Path
    scc: np.ndarray                  # social cost of carbon, vanilla definition ($/tCO2)
    scc_output: np.ndarray           # SCC with output as numeraire (scenario driver / Excel)
    photel: np.ndarray | None        # Hotelling carbon price (baseline only)
    exogenous: Exogenous
    status: str
    termination: str


def build_model(ex: Exogenous) -> pyo.ConcreteModel:
    p = ex.params
    n = p.nperiods
    cm = ex.carbon
    m = pyo.ConcreteModel(name="DICE2013R")
    m.T = pyo.RangeSet(0, n - 1)
    m.Tnext = pyo.RangeSet(0, n - 2)  # t such that t+1 exists

    for name in VARIABLES:
        domain = pyo.NonNegativeReals if name in NONNEGATIVE else pyo.Reals
        setattr(m, name, pyo.Var(m.T, domain=domain, initialize=0.0))
    m.UTILITY = pyo.Var(initialize=0.0)

    # The damage quadratic coefficient is mutable: the baseline Hotelling
    # step solves once with a2 = 0.
    m.a2 = pyo.Param(initialize=p.a2, mutable=True)

    def c(rule, index=m.T):
        return pyo.Constraint(index, rule=rule)

    # Emissions and damages
    m.eeq = c(lambda m, t: m.E[t] == eq.total_emissions(m.EIND[t], ex.etree[t]))
    m.eindeq = c(lambda m, t: m.EIND[t] == eq.industrial_emissions(ex.sigma[t], m.YGROSS[t], m.MIU[t]))
    m.ccacca = c(lambda m, t: m.CCA[t + 1] == eq.cumulative_emissions_next(m.CCA[t], m.EIND[t], p.tstep), m.Tnext)
    m.force = c(lambda m, t: m.FORC[t] == eq.forcing(m.MAT[t], ex.forcoth[t], p.fco22x, p.mateq, log=pyo.log))
    m.damfraceq = c(lambda m, t: m.DAMFRAC[t] == p.a1 * m.TATM[t] + m.a2 * m.TATM[t] ** p.a3)
    m.dameq = c(lambda m, t: m.DAMAGES[t] == eq.damages(m.YGROSS[t], m.DAMFRAC[t]))
    m.abateeq = c(lambda m, t: m.ABATECOST[t] == eq.abatement_cost(
        m.YGROSS[t], ex.cost1[t], m.MIU[t], ex.partfract[t], p.expcost2))
    m.mcabateeq = c(lambda m, t: m.MCABATE[t] == eq.marginal_abatement_cost(ex.pbacktime[t], m.MIU[t], p.expcost2))
    m.carbpriceeq = c(lambda m, t: m.CPRICE[t] == eq.carbon_price(ex.pbacktime[t], m.MIU[t], ex.partfract[t], p.expcost2))

    # Climate and carbon cycle
    m.mmat = c(lambda m, t: m.MAT[t + 1] == eq.mat_next(m.MAT[t], m.MU[t], m.E[t], cm.b11, cm.b21, p.tstep), m.Tnext)
    m.mml = c(lambda m, t: m.ML[t + 1] == eq.ml_next(m.MU[t], m.ML[t], cm.b23, cm.b33), m.Tnext)
    m.mmu = c(lambda m, t: m.MU[t + 1] == eq.mu_next(m.MAT[t], m.MU[t], m.ML[t], cm.b12, cm.b22, cm.b32), m.Tnext)
    m.tatmeq = c(lambda m, t: m.TATM[t + 1] == eq.tatm_next(
        m.TATM[t], m.TOCEAN[t], m.FORC[t + 1], ex.c1, p.c3, p.fco22x, p.t2xco2), m.Tnext)
    m.toceaneq = c(lambda m, t: m.TOCEAN[t + 1] == eq.tocean_next(m.TATM[t], m.TOCEAN[t], p.c4), m.Tnext)

    # Economy
    m.ygrosseq = c(lambda m, t: m.YGROSS[t] == eq.gross_output(ex.al[t], ex.l[t], m.K[t], p.gama))
    m.yneteq = c(lambda m, t: m.YNET[t] == eq.net_output_of_damages(m.YGROSS[t], m.DAMFRAC[t]))
    m.yy = c(lambda m, t: m.Y[t] == eq.output(m.YNET[t], m.ABATECOST[t]))
    m.cc = c(lambda m, t: m.C[t] == eq.consumption(m.Y[t], m.I[t]))
    m.cpce = c(lambda m, t: m.CPC[t] == eq.consumption_per_capita(m.C[t], ex.l[t]))
    m.seq = c(lambda m, t: m.I[t] == eq.investment(m.S[t], m.Y[t]))
    m.kk = c(lambda m, t: m.K[t + 1] <= eq.capital_next(m.K[t], m.I[t], p.dk, p.tstep), m.Tnext)
    m.rieq = c(lambda m, t: m.RI[t] == eq.interest_rate(m.CPC[t], m.CPC[t + 1], p.prstp, p.elasmu, p.tstep), m.Tnext)

    # Utility
    m.cemutotpereq = c(lambda m, t: m.CEMUTOTPER[t] == eq.discounted_period_utility(m.PERIODU[t], ex.l[t], ex.rr[t]))
    m.periodueq = c(lambda m, t: m.PERIODU[t] == eq.period_utility(m.C[t], ex.l[t], p.elasmu, log=pyo.log))
    m.util = pyo.Constraint(expr=m.UTILITY == eq.welfare(
        sum(m.CEMUTOTPER[t] for t in m.T), p.scale1, p.scale2, p.tstep))
    m.obj = pyo.Objective(expr=m.UTILITY, sense=pyo.maximize)

    # Bounds (GAMS lines after the equations)
    for t in m.T:
        m.CCA[t].setub(p.fosslim)
        m.MIU[t].setub(float(ex.miu_up[t]))
        m.MIU[t].setlb(p.miu_lo)
        m.K[t].setlb(1); m.MAT[t].setlb(10); m.MU[t].setlb(100); m.ML[t].setlb(1000)
        m.C[t].setlb(2); m.TOCEAN[t].setub(20); m.TOCEAN[t].setlb(-1)
        m.TATM[t].setub(p.tatm_up); m.CPC[t].setlb(0.01)
    # Savings fixed at the long-run optimum in the final periods
    for t in range(n - p.nfixsav, n):
        m.S[t].fix(ex.optlrsav)
    # RI in the last period is undefined in GAMS (level stays at 0)
    m.RI[n - 1].fix(0.0)
    # Initial conditions
    m.CCA[0].fix(p.cca0); m.K[0].fix(p.k0); m.MAT[0].fix(p.mat0); m.MU[0].fix(p.mu0)
    m.ML[0].fix(p.ml0); m.TATM[0].fix(p.tatm0); m.TOCEAN[0].fix(p.tocean0)

    m.dual = pyo.Suffix(direction=pyo.Suffix.IMPORT)
    return m


def initial_guess(ex: Exogenous) -> tuple[np.ndarray, np.ndarray]:
    """A feasible starting point: control ramping to its cap, steady savings."""
    n = ex.params.nperiods
    miu = np.minimum(ex.miu_up, np.linspace(ex.params.miu0, 1.0, n))
    s = np.full(n, ex.optlrsav)
    return miu, s


def warm_start(m: pyo.ConcreteModel, path: Path) -> None:
    for name in VARIABLES:
        values = getattr(path, name)
        var = getattr(m, name)
        for t in m.T:
            if not var[t].fixed and np.isfinite(values[t]):
                var[t].set_value(float(values[t]), skip_validation=True)
    m.UTILITY.set_value(path.UTILITY)


def extract(m: pyo.ConcreteModel, ex: Exogenous) -> Path:
    def arr(name):
        return np.array([pyo.value(getattr(m, name)[t]) for t in m.T])
    values = {name: arr(name) for name in VARIABLES}
    values["RI"][-1] = np.nan
    return Path(**values, UTILITY=float(pyo.value(m.UTILITY)))


def social_cost_of_carbon(m: pyo.ConcreteModel, numeraire: str = "consumption") -> np.ndarray:
    """Social cost of carbon in $/tCO2.

    ``numeraire="consumption"`` is the vanilla definition,
    ``scc(t) = -1000 * eeq.m(t) / cc.m(t)``.  ``numeraire="output"`` is the
    definition in the scenario driver DICE2013_MUP_120913.gms (and hence in the
    Excel GAMS* sheets), ``-1000 * eeq.m(t) / yy.m(t)``. The two coincide where
    the savings rate is optimized and differ in the final periods where it is
    fixed.
    """
    denom = {"consumption": m.cc, "output": m.yy}[numeraire]
    return np.array([-1000 * m.dual[m.eeq[t]] / m.dual[denom[t]] for t in m.T])


def _solver(tol: float):
    exe = find_ipopt()
    if exe is None:
        raise RuntimeError("Ipopt not found; set $IPOPT or run `idaes get-extensions`")
    s = pyo.SolverFactory("ipopt", executable=exe)
    s.options["tol"] = tol
    s.options["constr_viol_tol"] = 1e-10   # default 1e-4 lets UTILITY drift above the true value
    s.options["bound_relax_factor"] = 0.0  # keep bounds exact (default relaxes by 1e-8)
    s.options["max_iter"] = 5000
    return s


def _solve(m, tol, tee):
    res = _solver(tol).solve(m, tee=tee)
    status = str(res.solver.status)
    term = str(res.solver.termination_condition)
    if term != "optimal":
        raise RuntimeError(f"Ipopt did not converge: status={status}, termination={term}")
    return status, term


def solve_optimal(p: Params = DEFAULT, tol: float = 1e-10, tee: bool = False) -> Solution:
    ex = compute(p)
    m = build_model(ex)
    miu, s = initial_guess(ex)
    warm_start(m, simulate(ex, miu, s))
    if p.fix_miu0:
        m.MIU[0].fix(p.miu0)
    status, term = _solve(m, tol, tee)
    return _solution(m, ex, None, status, term)


def solve_baseline(p: Params = DEFAULT, tol: float = 1e-10, tee: bool = False) -> Solution:
    ex = compute(p)
    m = build_model(ex)
    miu, s = initial_guess(ex)
    warm_start(m, simulate(ex, miu * 0.1, s))
    # Step 1: no damages -> carbon price reflects only fossil-fuel scarcity.
    m.a2 = 0.0
    _solve(m, tol, tee)
    photel = np.array([pyo.value(m.CPRICE[t]) for t in m.T])
    # Step 2: damages back on, carbon price fixed for the no-policy periods.
    m.a2 = p.a2
    for t in m.T:
        if t + 1 <= p.tnopol:
            m.CPRICE[t].fix(max(photel[t], ex.cpricebase[t]))
    status, term = _solve(m, tol, tee)
    return _solution(m, ex, photel, status, term)


def _solution(m, ex, photel, status, term) -> Solution:
    return Solution(path=extract(m, ex), scc=social_cost_of_carbon(m, "consumption"),
                    scc_output=social_cost_of_carbon(m, "output"), photel=photel,
                    exogenous=ex, status=status, termination=term)
