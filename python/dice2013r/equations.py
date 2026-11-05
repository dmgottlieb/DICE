"""The DICE-2013R model equations, one function per GAMS equation.

Each function uses only arithmetic operators (and an injectable ``log``), so the
same code works on floats, numpy arrays, and Pyomo expressions. The GAMS
equation name is given in each docstring.

Units: output and consumption in trillions of 2005 USD per year, population in
millions, emissions in GtCO2 per year, carbon stocks in GtC, temperatures in
degrees C above 1900, carbon prices in 2005 USD per tCO2.
"""
from __future__ import annotations

import math

# GtCO2 per year  ->  GtC per period, for a 5-year period (GAMS writes 5/3.666).
CO2_PER_C = 3.666


def emissions_to_carbon(e, tstep=5.0):
    return e * tstep / CO2_PER_C


# --- Emissions and damages -------------------------------------------------

def industrial_emissions(sigma, ygross, miu):
    """EINDEQ: EIND = sigma * YGROSS * (1 - MIU)."""
    return sigma * ygross * (1 - miu)


def total_emissions(eind, etree):
    """EEQ: E = EIND + etree."""
    return eind + etree


def cumulative_emissions_next(cca, eind, tstep=5.0):
    """CCACCA: CCA(t+1) = CCA(t) + EIND(t) * 5 / 3.666."""
    return cca + emissions_to_carbon(eind, tstep)


def forcing(mat, forcoth, fco22x, mateq=588.0, log=math.log):
    """FORCE: FORC = fco22x * log2(MAT / 588) + forcoth.

    GAMS hard-codes 588 here, which equals ``mateq``.
    """
    return fco22x * (log(mat / mateq) / math.log(2)) + forcoth


def damage_fraction(tatm, a1, a2, a3):
    """DAMFRACEQ: DAMFRAC = a1 * TATM + a2 * TATM ** a3."""
    return a1 * tatm + a2 * tatm ** a3


def damages(ygross, damfrac):
    """DAMEQ: DAMAGES = YGROSS * DAMFRAC."""
    return ygross * damfrac


def abatement_cost(ygross, cost1, miu, partfract, expcost2):
    """ABATEEQ: ABATECOST = YGROSS * cost1 * MIU**expcost2 * partfract**(1-expcost2)."""
    return ygross * cost1 * miu ** expcost2 * partfract ** (1 - expcost2)


def marginal_abatement_cost(pbacktime, miu, expcost2):
    """MCABATEEQ: MCABATE = pbacktime * MIU ** (expcost2 - 1)."""
    return pbacktime * miu ** (expcost2 - 1)


def carbon_price(pbacktime, miu, partfract, expcost2):
    """CARBPRICEEQ: CPRICE = pbacktime * (MIU / partfract) ** (expcost2 - 1)."""
    return pbacktime * (miu / partfract) ** (expcost2 - 1)


def miu_from_carbon_price(cprice, pbacktime, partfract, expcost2):
    """Inverse of CARBPRICEEQ: the control rate a given carbon price supports."""
    return partfract * (cprice / pbacktime) ** (1 / (expcost2 - 1))


# --- Carbon cycle and climate ---------------------------------------------

def mat_next(mat, mu, e, b11, b21, tstep=5.0):
    """MMAT: MAT(t+1) = MAT*b11 + MU*b21 + E * 5/3.666."""
    return mat * b11 + mu * b21 + emissions_to_carbon(e, tstep)


def mu_next(mat, mu, ml, b12, b22, b32):
    """MMU: MU(t+1) = MAT*b12 + MU*b22 + ML*b32."""
    return mat * b12 + mu * b22 + ml * b32


def ml_next(mu, ml, b23, b33):
    """MML: ML(t+1) = ML*b33 + MU*b23."""
    return ml * b33 + mu * b23


def tatm_next(tatm, tocean, forc_next, c1, c3, fco22x, t2xco2):
    """TATMEQ: TATM(t+1) = TATM + c1*((FORC(t+1) - (fco22x/t2xco2)*TATM) - c3*(TATM - TOCEAN))."""
    return tatm + c1 * ((forc_next - (fco22x / t2xco2) * tatm) - (c3 * (tatm - tocean)))


def tocean_next(tatm, tocean, c4):
    """TOCEANEQ: TOCEAN(t+1) = TOCEAN + c4*(TATM - TOCEAN)."""
    return tocean + c4 * (tatm - tocean)


# --- Economy ----------------------------------------------------------------

def gross_output(al, l, k, gama):
    """YGROSSEQ: YGROSS = al * (L/1000)**(1-gama) * K**gama."""
    return al * (l / 1000) ** (1 - gama) * k ** gama


def net_output_of_damages(ygross, damfrac):
    """YNETEQ: YNET = YGROSS * (1 - DAMFRAC)."""
    return ygross * (1 - damfrac)


def output(ynet, abatecost):
    """YY: Y = YNET - ABATECOST."""
    return ynet - abatecost


def investment(s, y):
    """SEQ: I = S * Y."""
    return s * y


def consumption(y, i):
    """CC: C = Y - I."""
    return y - i


def consumption_per_capita(c, l):
    """CPCE: CPC = 1000 * C / L."""
    return 1000 * c / l


def capital_next(k, i, dk, tstep=5.0):
    """KK: K(t+1) <= (1-dk)**tstep * K + tstep * I  (binds at the optimum)."""
    return (1 - dk) ** tstep * k + tstep * i


def interest_rate(cpc, cpc_next, prstp, elasmu, tstep=5.0):
    """RIEQ: RI(t) = (1+prstp) * (CPC(t+1)/CPC(t))**(elasmu/tstep) - 1."""
    return (1 + prstp) * (cpc_next / cpc) ** (elasmu / tstep) - 1


# --- Utility ----------------------------------------------------------------

def period_utility(c, l, elasmu, log=None):
    """PERIODUEQ: PERIODU = ((C*1000/L)**(1-elasmu) - 1)/(1-elasmu) - 1.

    The GAMS formula is 0/0 at elasmu = 1; there we use its limit, log(C*1000/L) - 1.
    """
    if abs(1 - elasmu) < 1e-12:
        log = log or (lambda x: __import__("numpy").log(x))
        return log(c * 1000 / l) - 1
    return ((c * 1000 / l) ** (1 - elasmu) - 1) / (1 - elasmu) - 1


def discounted_period_utility(periodu, l, rr):
    """CEMUTOTPEREQ: CEMUTOTPER = PERIODU * L * rr."""
    return periodu * l * rr


def welfare(cemutotper_sum, scale1, scale2, tstep=5.0):
    """UTIL: UTILITY = tstep * scale1 * sum(CEMUTOTPER) + scale2."""
    return tstep * scale1 * cemutotper_sum + scale2
