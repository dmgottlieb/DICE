"""Exogenous (pre-solve) paths and derived scalars, mirroring the parameter
definitions section of DICE2013R_110513_vanilla.gms.

Arrays are 0-indexed: index i corresponds to GAMS period t = i + 1
(year 2005 + 5 * t).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .params import DEFAULT, Params


@dataclass(frozen=True)
class CarbonMatrix:
    b11: float
    b12: float
    b21: float
    b22: float
    b23: float
    b32: float
    b33: float


@dataclass(frozen=True)
class Exogenous:
    params: Params
    period: np.ndarray       # GAMS t.val, 1..N
    year: np.ndarray         # 2005 + tstep * t
    l: np.ndarray            # population (millions)
    ga: np.ndarray           # TFP growth rate per period
    al: np.ndarray           # total factor productivity
    gsig: np.ndarray         # growth rate of sigma (per year)
    sigma: np.ndarray        # CO2-output ratio (tCO2 per $1000 / GtCO2 per $trillion)
    pbacktime: np.ndarray    # backstop price ($/tCO2)
    cost1: np.ndarray        # abatement cost coefficient
    etree: np.ndarray        # land-use emissions (GtCO2/yr)
    rr: np.ndarray           # utility discount factor
    forcoth: np.ndarray      # non-CO2 forcing (W/m2)
    partfract: np.ndarray    # participation fraction
    cpricebase: np.ndarray   # baseline carbon price ($/tCO2)
    miu_up: np.ndarray       # upper bound on control rate
    carbon: CarbonMatrix
    sig0: float
    lam: float               # climate feedback parameter fco22x / t2xco2
    c1: float                # speed-of-adjustment, corrected for t2xco2
    optlrsav: float          # long-run optimal savings rate (terminal periods)


def carbon_matrix(p: Params) -> CarbonMatrix:
    """Transition coefficients chosen so the equilibrium stocks are a fixed point."""
    b11 = 1 - p.b12
    b21 = p.b12 * p.mateq / p.mueq
    b22 = 1 - b21 - p.b23
    b32 = p.b23 * p.mueq / p.mleq
    b33 = 1 - b32
    return CarbonMatrix(b11=b11, b12=p.b12, b21=b21, b22=b22, b23=p.b23, b32=b32, b33=b33)


def population(p: Params) -> np.ndarray:
    l = np.empty(p.nperiods)
    l[0] = p.pop0
    for i in range(p.nperiods - 1):
        l[i + 1] = l[i] * (p.popasym / l[i]) ** p.popadj
    return l


def tfp(p: Params) -> tuple[np.ndarray, np.ndarray]:
    t = np.arange(1, p.nperiods + 1)
    ga = p.ga0 * np.exp(-p.dela * p.tstep * (t - 1))
    al = np.empty(p.nperiods)
    al[0] = p.a0
    for i in range(p.nperiods - 1):
        al[i + 1] = al[i] / (1 - ga[i])
    return ga, al


def initial_sigma(p: Params) -> float:
    return p.e0 / (p.q0 * (1 - p.miu0))


def carbon_intensity(p: Params) -> tuple[np.ndarray, np.ndarray]:
    gsig = np.empty(p.nperiods)
    sigma = np.empty(p.nperiods)
    gsig[0] = p.gsigma1
    sigma[0] = initial_sigma(p)
    for i in range(p.nperiods - 1):
        gsig[i + 1] = gsig[i] * (1 + p.dsig) ** p.tstep
        sigma[i + 1] = sigma[i] * np.exp(gsig[i] * p.tstep)
    return gsig, sigma


def other_forcing(p: Params) -> np.ndarray:
    t = np.arange(1, p.nperiods + 1)
    ramp = (1 / 18) * (p.fex1 - p.fex0) * (t - 1)
    return p.fex0 + np.where(t < 19, ramp, p.fex1 - p.fex0)


def participation(p: Params) -> np.ndarray:
    t = np.arange(1, p.nperiods + 1)
    pf = np.where(
        t > p.periodfullpart,
        p.partfractfull,
        p.partfract2010 + (p.partfractfull - p.partfract2010) * (t - 1) / p.periodfullpart,
    ).astype(float)
    pf[0] = p.partfract2010
    return pf


def optimal_long_run_savings(p: Params) -> float:
    return (p.dk + 0.004) / (p.dk + 0.004 * p.elasmu + p.prstp) * p.gama


def compute(p: Params = DEFAULT) -> Exogenous:
    t = np.arange(1, p.nperiods + 1)
    l = population(p)
    ga, al = tfp(p)
    gsig, sigma = carbon_intensity(p)
    pbacktime = p.pback * (1 - p.gback) ** (t - 1)
    cost1 = pbacktime * sigma / p.expcost2 / 1000
    etree = p.eland0 * (1 - p.deland) ** (t - 1)
    rr = 1 / (1 + p.prstp) ** (p.tstep * (t - 1))
    partfract = participation(p)
    cpricebase = p.cprice0 * (1 + p.gcprice) ** (p.tstep * (t - 1))
    miu_up = np.where(t < p.miu_cap1_before, 1.0, p.limmiu * partfract)
    return Exogenous(
        params=p,
        period=t,
        year=2005 + p.tstep * t,
        l=l,
        ga=ga,
        al=al,
        gsig=gsig,
        sigma=sigma,
        pbacktime=pbacktime,
        cost1=cost1,
        etree=etree,
        rr=rr,
        forcoth=other_forcing(p),
        partfract=partfract,
        cpricebase=cpricebase,
        miu_up=miu_up,
        carbon=carbon_matrix(p),
        sig0=initial_sigma(p),
        lam=p.fco22x / p.t2xco2,
        c1=p.c10 + p.c1beta * (p.t2xco2 - 2.9),
        optlrsav=optimal_long_run_savings(p) if p.fixed_savings is None else p.fixed_savings,
    )
