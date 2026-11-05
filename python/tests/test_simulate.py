"""Forward simulation from the GAMS controls must reproduce every GAMS variable."""
import numpy as np
import pytest

from dice2013r import compute_exogenous, simulate

from .conftest import SCENARIO_PARAMS, assert_series_close, load_reference

COMPARE = ["K", "YGROSS", "EIND", "E", "CCA", "MAT", "MU", "ML", "FORC", "TATM", "TOCEAN",
           "DAMFRAC", "DAMAGES", "YNET", "ABATECOST", "CPRICE", "Y", "I", "C", "CPC", "RI",
           "PERIODU"]


@pytest.fixture(params=list(SCENARIO_PARAMS), scope="module")
def run(request):
    scenario = request.param
    ref = load_reference(scenario)
    ex = compute_exogenous(SCENARIO_PARAMS[scenario])
    path = simulate(ex, ref["series"]["MIU"], ref["series"]["S"])
    return ex, path, ref


@pytest.mark.parametrize("name", COMPARE)
def test_reproduces_gams(run, name):
    ex, path, ref = run
    assert_series_close(getattr(path, name), ref["series"][name], name, rtol=1e-7, atol=1e-7)


def test_utility_reproduces_gams(run):
    ex, path, ref = run
    assert path.UTILITY == pytest.approx(ref["scalars"]["UTILITY"], rel=1e-9)


def test_accounting_identities(run):
    ex, path, _ = run
    np.testing.assert_allclose(path.YNET, path.YGROSS - path.DAMAGES, rtol=1e-13)
    np.testing.assert_allclose(path.Y, path.YNET - path.ABATECOST, rtol=1e-13)
    np.testing.assert_allclose(path.Y, path.C + path.I, rtol=1e-13)
    np.testing.assert_allclose(path.I, path.S * path.Y, rtol=1e-13)
    np.testing.assert_allclose(path.E, path.EIND + ex.etree, rtol=1e-13)


def test_carbon_mass_balance(run):
    """Total carbon in the three reservoirs grows exactly by emissions."""
    ex, path, _ = run
    total = path.MAT + path.MU + path.ML
    added = path.E[:-1] * 5 / 3.666
    np.testing.assert_allclose(np.diff(total), added, rtol=1e-9, atol=1e-9)


def test_initial_conditions(run):
    ex, path, _ = run
    p = ex.params
    assert (path.K[0], path.MAT[0], path.MU[0], path.ML[0], path.TATM[0], path.TOCEAN[0], path.CCA[0]) == (
        p.k0, p.mat0, p.mu0, p.ml0, p.tatm0, p.tocean0, p.cca0)


def test_last_interest_rate_undefined(run):
    assert np.isnan(run[1].RI[-1]) and not np.isnan(run[1].RI[:-1]).any()


def test_shape_validation():
    ex = compute_exogenous()
    with pytest.raises(ValueError):
        simulate(ex, np.zeros(59), np.zeros(60))


def test_more_abatement_means_cooler_and_less_output_now():
    ex = compute_exogenous()
    s = np.full(60, 0.25)
    lo = simulate(ex, np.full(60, 0.1), s)
    hi = simulate(ex, np.full(60, 0.9), s)
    assert hi.TATM[-1] < lo.TATM[-1]
    assert hi.Y[0] < lo.Y[0]
    assert np.all(hi.EIND < lo.EIND)
