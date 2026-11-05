"""Forward simulation of DICE-2013R for given control paths.

Given the control rate MIU(t) and savings rate S(t) for every period, every
other model variable follows recursively from the equations. This is the
"reduced-space" view of the model that the browser implementation optimizes.
"""
from __future__ import annotations

from dataclasses import dataclass, fields

import numpy as np

from . import equations as eq
from .exogenous import Exogenous


@dataclass
class Path:
    """All endogenous variables over time (0-indexed periods)."""

    MIU: np.ndarray
    S: np.ndarray
    K: np.ndarray
    YGROSS: np.ndarray
    EIND: np.ndarray
    E: np.ndarray
    CCA: np.ndarray
    MAT: np.ndarray
    MU: np.ndarray
    ML: np.ndarray
    FORC: np.ndarray
    TATM: np.ndarray
    TOCEAN: np.ndarray
    DAMFRAC: np.ndarray
    DAMAGES: np.ndarray
    YNET: np.ndarray
    ABATECOST: np.ndarray
    MCABATE: np.ndarray
    CPRICE: np.ndarray
    Y: np.ndarray
    I: np.ndarray
    C: np.ndarray
    CPC: np.ndarray
    RI: np.ndarray           # last period is undefined (NaN)
    PERIODU: np.ndarray
    CEMUTOTPER: np.ndarray
    UTILITY: float

    def as_dict(self) -> dict:
        return {f.name: getattr(self, f.name) for f in fields(self)}


def simulate(ex: Exogenous, miu, s) -> Path:
    p = ex.params
    n = p.nperiods
    miu = np.asarray(miu, dtype=float)
    s = np.asarray(s, dtype=float)
    if miu.shape != (n,) or s.shape != (n,):
        raise ValueError(f"miu and s must have shape ({n},)")
    cm = ex.carbon

    K = np.empty(n); MAT = np.empty(n); MU = np.empty(n); ML = np.empty(n)
    TATM = np.empty(n); TOCEAN = np.empty(n); CCA = np.empty(n)
    FORC = np.empty(n)
    K[0], MAT[0], MU[0], ML[0] = p.k0, p.mat0, p.mu0, p.ml0
    TATM[0], TOCEAN[0], CCA[0] = p.tatm0, p.tocean0, p.cca0
    FORC[0] = eq.forcing(MAT[0], ex.forcoth[0], p.fco22x, p.mateq)

    YGROSS = np.empty(n); EIND = np.empty(n); E = np.empty(n)
    Y = np.empty(n); I = np.empty(n)
    for i in range(n):
        YGROSS[i] = eq.gross_output(ex.al[i], ex.l[i], K[i], p.gama)
        EIND[i] = eq.industrial_emissions(ex.sigma[i], YGROSS[i], miu[i])
        E[i] = eq.total_emissions(EIND[i], ex.etree[i])
        damfrac = eq.damage_fraction(TATM[i], p.a1, p.a2, p.a3)
        ynet = eq.net_output_of_damages(YGROSS[i], damfrac)
        abate = eq.abatement_cost(YGROSS[i], ex.cost1[i], miu[i], ex.partfract[i], p.expcost2)
        Y[i] = eq.output(ynet, abate)
        I[i] = eq.investment(s[i], Y[i])
        if i + 1 < n:
            K[i + 1] = eq.capital_next(K[i], I[i], p.dk, p.tstep)
            CCA[i + 1] = eq.cumulative_emissions_next(CCA[i], EIND[i], p.tstep)
            MAT[i + 1] = eq.mat_next(MAT[i], MU[i], E[i], cm.b11, cm.b21, p.tstep)
            MU[i + 1] = eq.mu_next(MAT[i], MU[i], ML[i], cm.b12, cm.b22, cm.b32)
            ML[i + 1] = eq.ml_next(MU[i], ML[i], cm.b23, cm.b33)
            FORC[i + 1] = eq.forcing(MAT[i + 1], ex.forcoth[i + 1], p.fco22x, p.mateq)
            TATM[i + 1] = eq.tatm_next(TATM[i], TOCEAN[i], FORC[i + 1], ex.c1, p.c3, p.fco22x, p.t2xco2)
            TOCEAN[i + 1] = eq.tocean_next(TATM[i], TOCEAN[i], p.c4)

    DAMFRAC = eq.damage_fraction(TATM, p.a1, p.a2, p.a3)
    DAMAGES = eq.damages(YGROSS, DAMFRAC)
    YNET = eq.net_output_of_damages(YGROSS, DAMFRAC)
    ABATECOST = eq.abatement_cost(YGROSS, ex.cost1, miu, ex.partfract, p.expcost2)
    MCABATE = eq.marginal_abatement_cost(ex.pbacktime, miu, p.expcost2)
    CPRICE = eq.carbon_price(ex.pbacktime, miu, ex.partfract, p.expcost2)
    C = eq.consumption(Y, I)
    CPC = eq.consumption_per_capita(C, ex.l)
    RI = np.full(n, np.nan)
    RI[:-1] = eq.interest_rate(CPC[:-1], CPC[1:], p.prstp, p.elasmu, p.tstep)
    PERIODU = eq.period_utility(C, ex.l, p.elasmu)
    CEMUTOTPER = eq.discounted_period_utility(PERIODU, ex.l, ex.rr)
    UTILITY = eq.welfare(CEMUTOTPER.sum(), p.scale1, p.scale2, p.tstep)

    return Path(
        MIU=miu, S=s, K=K, YGROSS=YGROSS, EIND=EIND, E=E, CCA=CCA, MAT=MAT, MU=MU, ML=ML,
        FORC=FORC, TATM=TATM, TOCEAN=TOCEAN, DAMFRAC=DAMFRAC, DAMAGES=DAMAGES, YNET=YNET,
        ABATECOST=ABATECOST, MCABATE=MCABATE, CPRICE=CPRICE, Y=Y, I=I, C=C, CPC=CPC, RI=RI,
        PERIODU=PERIODU, CEMUTOTPER=CEMUTOTPER, UTILITY=float(UTILITY),
    )
