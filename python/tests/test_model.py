"""End-to-end tests of the Pyomo/Ipopt model against the GAMS solutions."""
import numpy as np
import pyomo.environ as pyo
import pytest

from dice2013r import DEFAULT, compute_exogenous, simulate
from dice2013r import model as M

from .conftest import SCENARIO_PARAMS, assert_series_close, load_reference, requires_ipopt

pytestmark = [requires_ipopt, pytest.mark.solver]

# Variables compared with GAMS. In the final period the control rate has no
# future benefit, so the optimum sits on its lower bound; Ipopt (an interior
# point method) stops ~1e-3 short of it, which perturbs MIU-dependent
# quantities in period 60 only. Those are checked separately.
STATES = ["K", "YGROSS", "CCA", "MAT", "MU", "ML", "FORC", "TATM", "TOCEAN", "DAMFRAC",
          "DAMAGES", "YNET", "C", "CPC", "I", "Y", "PERIODU", "RI"]
CONTROL_DEPENDENT = ["MIU", "S", "EIND", "E", "ABATECOST", "CPRICE"]
ALL_BUT_LAST = slice(0, 59)


def close_to_gams(actual, expected, name, periods=slice(None), rtol=2e-6):
    """Relative tolerance per value, plus an absolute floor scaled to the size
    of the series, so series that cross zero (net emissions, cumulative
    emissions with negative-emission phases) are judged on a sensible scale."""
    e = np.asarray(expected, dtype=float)
    scale = np.nanmax(np.abs(e[periods]))
    assert_series_close(actual, expected, name, rtol=rtol, atol=rtol * scale, periods=periods)


def solve(scenario):
    p = SCENARIO_PARAMS[scenario]
    return M.solve_baseline(p) if scenario == "base" else M.solve_optimal(p)


@pytest.fixture(scope="module", params=list(SCENARIO_PARAMS))
def solved(request):
    return request.param, solve(request.param), load_reference(request.param)


@pytest.fixture(scope="module")
def opt():
    return M.solve_optimal()


@pytest.fixture(scope="module")
def base():
    return M.solve_baseline()


# --- Agreement with GAMS ------------------------------------------------------

@pytest.mark.parametrize("name", STATES)
def test_states_match_gams(solved, name):
    _, sol, ref = solved
    close_to_gams(getattr(sol.path, name), ref["series"][name], name)


@pytest.mark.parametrize("name", CONTROL_DEPENDENT)
def test_controls_match_gams(solved, name):
    _, sol, ref = solved
    close_to_gams(getattr(sol.path, name), ref["series"][name], name, periods=ALL_BUT_LAST)


def test_final_period_control_near_zero(solved):
    _, sol, ref = solved
    if 59 in M.fixed_controls(sol.exogenous.params):
        pytest.skip("final-period control is fixed in this scenario")
    lo = sol.exogenous.params.miu_lo
    assert ref["series"]["MIU"][-1] == pytest.approx(lo, abs=1e-8)
    assert lo <= sol.path.MIU[-1] < lo + 2e-3


def test_welfare_matches_gams(solved):
    _, sol, ref = solved
    assert sol.path.UTILITY == pytest.approx(ref["scalars"]["UTILITY"], rel=1e-11)


def test_scc_matches_gams_scenario_driver_definition(solved):
    """The Excel sheets come from the scenario driver, where SCC uses output (yy) as numeraire."""
    _, sol, ref = solved
    close_to_gams(sol.scc_output, ref["series"]["SCC"], "SCC", periods=ALL_BUT_LAST)


def test_scc_definitions_agree_where_savings_optimized(solved):
    _, sol, _ = solved
    n_free = DEFAULT.nperiods - DEFAULT.nfixsav
    np.testing.assert_allclose(sol.scc[:n_free], sol.scc_output[:n_free], rtol=1e-6)


# --- Internal consistency -------------------------------------------------------

def test_solution_consistent_with_simulator(solved):
    _, sol, _ = solved
    sim = simulate(sol.exogenous, sol.path.MIU, sol.path.S)
    for name in STATES + CONTROL_DEPENDENT:
        assert_series_close(getattr(sim, name), getattr(sol.path, name), name, rtol=1e-7, atol=1e-7)
    assert sim.UTILITY == pytest.approx(sol.path.UTILITY, rel=1e-10)


def test_bounds_respected(solved):
    scenario, sol, _ = solved
    p, ex, path = sol.exogenous.params, sol.exogenous, sol.path
    assert np.all(path.MIU <= ex.miu_up + 1e-8) and np.all(path.MIU >= p.miu_lo - 1e-8)
    assert np.all(path.CCA <= p.fosslim + 1e-6)
    assert np.all(path.TATM <= p.tatm_up + 1e-7)
    np.testing.assert_allclose(path.S[-p.nfixsav:], ex.optlrsav, rtol=1e-12)


def test_optimal_fixes_initial_control(opt):
    assert opt.path.MIU[0] == DEFAULT.miu0


def test_two_degree_limit_binds():
    sol = solve("lim2")
    assert sol.path.TATM.max() == pytest.approx(2.0, abs=1e-6)


def test_baseline_carbon_price_follows_rule(base):
    ex = base.exogenous
    np.testing.assert_allclose(base.path.CPRICE[:45], np.maximum(base.photel, ex.cpricebase)[:45], rtol=1e-12)


def test_hotelling_rent_reflects_binding_resource_limit():
    """With no damages, the fossil-fuel limit binds and its rent rises over time."""
    ex = compute_exogenous()
    m = M.build_model(ex)
    miu, s = M.initial_guess(ex)
    M.warm_start(m, simulate(ex, miu * 0.1, s))
    m.a2 = 0.0
    M._solve(m, 1e-10, False)
    cca = np.array([pyo.value(m.CCA[t]) for t in m.T])
    assert cca.max() == pytest.approx(DEFAULT.fosslim, rel=1e-6)
    base = M.solve_baseline()
    assert np.all(np.diff(base.photel[:45]) > 0)


def test_optimum_beats_baseline_welfare(opt, base):
    assert opt.path.UTILITY > base.path.UTILITY
    assert opt.path.TATM.max() < base.path.TATM.max()


# --- The SCC is a true marginal welfare effect (envelope theorem) --------------

def _perturbed_welfare(ex, t, d_emissions=0.0, d_consumption=0.0):
    m = M.build_model(ex)
    m.cc.deactivate(); m.eeq.deactivate()
    m.cc2 = pyo.Constraint(m.T, rule=lambda m, s: m.C[s] == m.Y[s] - m.I[s] + (d_consumption if s == t else 0))
    m.eeq2 = pyo.Constraint(m.T, rule=lambda m, s: m.E[s] == m.EIND[s] + ex.etree[s] + (d_emissions if s == t else 0))
    miu, s = M.initial_guess(ex)
    M.warm_start(m, simulate(ex, miu, s))
    m.MIU[0].fix(ex.params.miu0)
    M._solve(m, 1e-12, False)
    return pyo.value(m.UTILITY)


@pytest.mark.parametrize("t", [5, 30, 55])
def test_scc_equals_finite_difference_envelope(opt, t):
    ex, h = opt.exogenous, 1e-3
    dw_de = (_perturbed_welfare(ex, t, d_emissions=h) - _perturbed_welfare(ex, t, d_emissions=-h)) / (2 * h)
    dw_dc = (_perturbed_welfare(ex, t, d_consumption=h) - _perturbed_welfare(ex, t, d_consumption=-h)) / (2 * h)
    assert opt.scc[t] == pytest.approx(-1000 * dw_de / dw_dc, rel=1e-4)


def test_scc_equals_carbon_price_where_control_interior(opt):
    """First-order condition: marginal abatement cost = SCC when MIU is unconstrained."""
    path, ex = opt.path, opt.exogenous
    interior = (path.MIU > 1e-3) & (path.MIU < ex.miu_up - 1e-3)
    interior[0] = False
    interior[DEFAULT.nperiods - DEFAULT.nfixsav:] = False  # output-numeraire there
    assert interior.sum() > 10
    np.testing.assert_allclose(opt.scc[interior], path.CPRICE[interior], rtol=1e-6)


# --- Comparative statics ---------------------------------------------------------

@pytest.mark.parametrize("change", [
    dict(a2=2 * DEFAULT.a2),   # higher damages
    dict(prstp=0.005),         # less discounting
    dict(t2xco2=4.0),          # more sensitive climate
])
def test_more_concern_means_higher_scc_and_more_control(opt, change):
    sol = M.solve_optimal(DEFAULT.with_(**change))
    assert sol.scc[1] > opt.scc[1]
    assert sol.path.MIU[2] > opt.path.MIU[2]


def test_costlier_backstop_means_less_early_control(opt):
    sol = M.solve_optimal(DEFAULT.with_(pback=600.0))
    assert sol.path.MIU[1] < opt.path.MIU[1]


def test_solve_is_fast():
    import time
    t0 = time.perf_counter()
    M.solve_optimal()
    assert time.perf_counter() - t0 < 10
