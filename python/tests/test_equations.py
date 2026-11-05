"""Each model equation, evaluated on the GAMS solution's own values, must
reproduce the GAMS solution. This checks every equation independently of the
others and of any solver.
"""
import math

import numpy as np
import pytest

from dice2013r import compute_exogenous
from dice2013r import equations as eq

from .conftest import SCENARIO_PARAMS, assert_series_close

SCENARIOS = list(SCENARIO_PARAMS)
# Sheet values carry 10 decimals; derived quantities lose a few digits.
RTOL, ATOL = 1e-8, 1e-8


@pytest.fixture(params=SCENARIOS)
def case(request, ref):
    p = SCENARIO_PARAMS[request.param]
    return p, compute_exogenous(p), ref[request.param]["series"]


def test_gross_output(case):
    p, ex, r = case
    assert_series_close(eq.gross_output(ex.al, ex.l, r["K"], p.gama), r["YGROSS"], "YGROSS", RTOL, ATOL)


def test_industrial_emissions(case):
    p, ex, r = case
    assert_series_close(eq.industrial_emissions(ex.sigma, r["YGROSS"], r["MIU"]), r["EIND"], "EIND", 1e-7, 1e-7)


def test_total_emissions(case):
    p, ex, r = case
    assert_series_close(eq.total_emissions(r["EIND"], ex.etree), r["E"], "E", RTOL, ATOL)


def test_cumulative_emissions(case):
    p, ex, r = case
    assert_series_close(eq.cumulative_emissions_next(r["CCA"][:-1], r["EIND"][:-1]), r["CCA"][1:], "CCA", RTOL, 1e-7)


def test_forcing(case):
    p, ex, r = case
    assert_series_close(eq.forcing(r["MAT"], ex.forcoth, p.fco22x, log=np.log), r["FORC"], "FORC", RTOL, ATOL)


def test_damage_fraction(case):
    p, ex, r = case
    assert_series_close(eq.damage_fraction(r["TATM"], p.a1, p.a2, p.a3), r["DAMFRAC"], "DAMFRAC", 1e-8, 1e-10)


def test_damages(case):
    p, ex, r = case
    # DAMFRAC is printed to 1e-10, so YGROSS (up to ~3000) * DAMFRAC carries
    # up to ~1.5e-7 of rounding error.
    assert_series_close(eq.damages(r["YGROSS"], r["DAMFRAC"]), r["DAMAGES"], "DAMAGES", 1e-8, 2e-7)


def test_abatement_cost(case):
    p, ex, r = case
    got = eq.abatement_cost(r["YGROSS"], ex.cost1, r["MIU"], ex.partfract, p.expcost2)
    assert_series_close(got, r["ABATECOST"], "ABATECOST", 1e-7, 1e-9)


def test_carbon_price(case):
    p, ex, r = case
    got = eq.carbon_price(ex.pbacktime, r["MIU"], ex.partfract, p.expcost2)
    assert_series_close(got, r["CPRICE"], "CPRICE", 1e-7, 1e-7)


def test_mat_next(case):
    p, ex, r = case
    cm = ex.carbon
    got = eq.mat_next(r["MAT"][:-1], r["MU"][:-1], r["E"][:-1], cm.b11, cm.b21)
    assert_series_close(got, r["MAT"][1:], "MAT", RTOL, 1e-7)


def test_mu_next(case):
    p, ex, r = case
    cm = ex.carbon
    got = eq.mu_next(r["MAT"][:-1], r["MU"][:-1], r["ML"][:-1], cm.b12, cm.b22, cm.b32)
    assert_series_close(got, r["MU"][1:], "MU", RTOL, 1e-7)


def test_ml_next(case):
    p, ex, r = case
    cm = ex.carbon
    assert_series_close(eq.ml_next(r["MU"][:-1], r["ML"][:-1], cm.b23, cm.b33), r["ML"][1:], "ML", RTOL, 1e-7)


def test_tatm_next(case):
    p, ex, r = case
    got = eq.tatm_next(r["TATM"][:-1], r["TOCEAN"][:-1], r["FORC"][1:], ex.c1, p.c3, p.fco22x, p.t2xco2)
    assert_series_close(got, r["TATM"][1:], "TATM", RTOL, ATOL)


def test_tocean_next(case):
    p, ex, r = case
    assert_series_close(eq.tocean_next(r["TATM"][:-1], r["TOCEAN"][:-1], p.c4), r["TOCEAN"][1:], "TOCEAN", RTOL, ATOL)


def test_net_output(case):
    p, ex, r = case
    assert_series_close(eq.net_output_of_damages(r["YGROSS"], r["DAMFRAC"]), r["YNET"], "YNET", RTOL, ATOL)


def test_output(case):
    p, ex, r = case
    assert_series_close(eq.output(r["YNET"], r["ABATECOST"]), r["Y"], "Y", RTOL, ATOL)


def test_investment(case):
    p, ex, r = case
    assert_series_close(eq.investment(r["S"], r["Y"]), r["I"], "I", RTOL, ATOL)


def test_consumption(case):
    p, ex, r = case
    assert_series_close(eq.consumption(r["Y"], r["I"]), r["C"], "C", RTOL, ATOL)


def test_consumption_per_capita(case):
    p, ex, r = case
    assert_series_close(eq.consumption_per_capita(r["C"], ex.l), r["CPC"], "CPC", RTOL, ATOL)


def test_capital_accumulation_binds(case):
    p, ex, r = case
    got = eq.capital_next(r["K"][:-1], r["I"][:-1], p.dk)
    assert_series_close(got, r["K"][1:], "K", RTOL, 1e-7)


def test_interest_rate(case):
    p, ex, r = case
    got = eq.interest_rate(r["CPC"][:-1], r["CPC"][1:], p.prstp, p.elasmu)
    assert_series_close(got, r["RI"][:-1], "RI", 1e-7, 1e-9)


def test_period_utility(case):
    p, ex, r = case
    assert_series_close(eq.period_utility(r["C"], ex.l, p.elasmu), r["PERIODU"], "PERIODU", RTOL, ATOL)


def test_welfare(case, request):
    p, ex, r = case
    total = eq.discounted_period_utility(r["PERIODU"], ex.l, ex.rr).sum()
    got = eq.welfare(total, p.scale1, p.scale2)
    scenario = request.node.callspec.params["case"]
    from .conftest import load_reference
    assert got == pytest.approx(load_reference(scenario)["scalars"]["UTILITY"], rel=1e-9)


# --- Hand-computed checks --------------------------------------------------

def test_forcing_at_doubling_equals_fco22x():
    assert eq.forcing(2 * 588.0, 0.0, 3.8) == pytest.approx(3.8)
    assert eq.forcing(588.0, 0.5, 3.8) == pytest.approx(0.5)


def test_damage_at_three_degrees():
    assert eq.damage_fraction(3.0, 0.0, 0.00267, 2.0) == pytest.approx(0.02403)


def test_backstop_price_at_full_control():
    assert eq.carbon_price(344.0, 1.0, 1.0, 2.8) == 344.0
    assert eq.marginal_abatement_cost(344.0, 1.0, 2.8) == 344.0


def test_miu_from_carbon_price_inverts_carbon_price():
    for miu in [0.0, 0.039, 0.5, 1.0, 1.2]:
        price = eq.carbon_price(300.0, miu, 0.8, 2.8)
        assert eq.miu_from_carbon_price(price, 300.0, 0.8, 2.8) == pytest.approx(miu, abs=1e-14)
    # $1/t in 2010 supports the base-run control rate in the GAMS sheet.
    assert eq.miu_from_carbon_price(1.0, 344.0, 1.0, 2.8) == pytest.approx(0.038976323, abs=1e-9)


def test_emissions_unit_conversion():
    assert eq.emissions_to_carbon(3.666) == pytest.approx(5.0)


def test_temperature_equilibrium_at_doubling():
    # With forcing held at fco22x, temperature converges to t2xco2.
    tatm, tocean = 0.8, 0.0068
    for _ in range(5000):
        tatm, tocean = (eq.tatm_next(tatm, tocean, 3.8, 0.098, 0.088, 3.8, 2.9),
                        eq.tocean_next(tatm, tocean, 0.025))
    assert tatm == pytest.approx(2.9, rel=1e-9) and tocean == pytest.approx(2.9, rel=1e-9)


def test_log_utility_limit_is_continuous():
    # (c^(1-a) - 1)/(1-a) -> log(c) as a -> 1
    c = 7.0
    assert eq.period_utility(c, 1000.0, 1.0 + 1e-9) == pytest.approx(math.log(c) - 1, rel=1e-6)
