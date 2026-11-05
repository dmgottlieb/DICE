"""Exogenous paths vs the GAMS solution sheets, plus structural properties."""
import numpy as np
import pytest

from dice2013r import DEFAULT, compute_exogenous
from dice2013r import exogenous as exo

from .conftest import assert_series_close

SERIES = ["l", "al", "ga", "gsig", "sigma", "pbacktime", "cost1", "etree", "rr",
          "forcoth", "partfract"]


@pytest.fixture(scope="module")
def ex():
    return compute_exogenous()


@pytest.mark.parametrize("scenario", ["opt", "base"])
@pytest.mark.parametrize("name", SERIES)
def test_series_match_gams(ex, ref, scenario, name):
    # Sheet values are printed with 10 decimals.
    assert_series_close(getattr(ex, name), ref[scenario]["series"][name], name,
                        rtol=1e-9, atol=1e-10)


def test_stern_discount_factors_match_gams(ref):
    ex = compute_exogenous(DEFAULT.with_(prstp=0.001))
    assert_series_close(ex.rr, ref["stern"]["series"]["rr"], "rr", rtol=1e-9, atol=1e-10)


def test_years_and_periods(ex):
    assert ex.period[0] == 1 and ex.period[-1] == 60
    assert ex.year[0] == 2010 and ex.year[-1] == 2305


def test_carbon_matrix_matches_gams_sheet(ex):
    cm = ex.carbon
    # Values from rows "AtA b11" ... "DtD b33" of sheet GAMSopt.
    expected = dict(b11=0.912, b21=0.0383288889, b12=0.088, b22=0.9591711111,
                    b32=0.0003375, b23=0.0025, b33=0.9996625)
    for k, v in expected.items():
        assert getattr(cm, k) == pytest.approx(v, abs=5e-11), k


def test_carbon_matrix_conserves_mass(ex):
    cm = ex.carbon
    # Each reservoir's outflows (column of the transition matrix) sum to one.
    assert cm.b11 + cm.b12 == pytest.approx(1, abs=1e-15)
    assert cm.b21 + cm.b22 + cm.b23 == pytest.approx(1, abs=1e-15)
    assert cm.b32 + cm.b33 == pytest.approx(1, abs=1e-15)


def test_carbon_equilibrium_is_fixed_point(ex):
    from dice2013r import equations as eq
    p, cm = DEFAULT, ex.carbon
    mat = eq.mat_next(p.mateq, p.mueq, 0.0, cm.b11, cm.b21)
    mu = eq.mu_next(p.mateq, p.mueq, p.mleq, cm.b12, cm.b22, cm.b32)
    ml = eq.ml_next(p.mueq, p.mleq, cm.b23, cm.b33)
    assert (mat, mu, ml) == pytest.approx((p.mateq, p.mueq, p.mleq), rel=1e-14)


def test_scalars(ex):
    assert ex.sig0 == pytest.approx(33.61 / (63.69 * (1 - 0.039)), rel=1e-15)
    assert ex.sig0 == pytest.approx(0.5491283629, abs=5e-11)  # sheet "Initial Sigma"
    assert ex.lam == pytest.approx(3.8 / 2.9)
    assert ex.c1 == pytest.approx(0.098)
    assert ex.optlrsav == pytest.approx((0.1 + 0.004) / (0.1 + 0.004 * 1.45 + 0.015) * 0.3)


def test_c1_depends_on_climate_sensitivity():
    assert compute_exogenous(DEFAULT.with_(t2xco2=3.9)).c1 == pytest.approx(0.098 + 0.01243)


def test_population_converges_to_asymptote(ex):
    assert np.all(np.diff(ex.l) > 0)
    assert ex.l[-1] < DEFAULT.popasym
    assert ex.l[-1] == pytest.approx(DEFAULT.popasym, rel=1e-3)


def test_tfp_growth_declines(ex):
    assert np.all(np.diff(ex.ga) < 0) and np.all(np.diff(ex.al) > 0)


def test_forcing_ramp(ex):
    assert ex.forcoth[0] == 0.25
    assert ex.forcoth[18] == pytest.approx(0.70)       # 2100 (period 19)
    assert np.all(ex.forcoth[18:] == ex.forcoth[18])
    assert np.allclose(np.diff(ex.forcoth[:19]), 0.45 / 18)


def test_baseline_carbon_price(ex):
    assert ex.cpricebase[0] == 1.0
    assert ex.cpricebase[1] == pytest.approx(1.02 ** 5)


def test_control_rate_upper_bound(ex):
    assert np.all(ex.miu_up[:29] == 1.0)    # periods 1..29 (to 2150)
    assert np.all(ex.miu_up[29:] == 1.2)


def test_partial_participation_ramp():
    p = DEFAULT.with_(partfract2010=0.2, partfractfull=0.8, periodfullpart=4)
    pf = exo.participation(p)
    # t=1 -> 2010 value; t=2..4 -> linear ramp (t-1)/4 of the way; t>4 -> full.
    assert pf[:6] == pytest.approx([0.2, 0.35, 0.5, 0.65, 0.8, 0.8])
    assert np.all(pf[4:] == 0.8)


def test_parameter_changes_propagate():
    ex = compute_exogenous(DEFAULT.with_(pback=500.0, gback=0.05, eland0=4.0))
    assert ex.pbacktime[1] == pytest.approx(500 * 0.95)
    assert ex.cost1[0] == pytest.approx(500 * ex.sigma[0] / 2.8 / 1000)
    assert ex.etree[0] == 4.0
