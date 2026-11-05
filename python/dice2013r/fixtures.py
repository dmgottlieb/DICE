"""Generate JSON fixtures that the TypeScript implementation is tested against.

Run ``python scripts/make_web_fixtures.py`` after changing the model. The test
``tests/test_web_fixtures.py`` fails if the committed fixtures are stale.
"""
from __future__ import annotations

import json
from pathlib import Path as FsPath

import numpy as np

from .exogenous import compute
from .params import DEFAULT, Params
from .simulate import simulate

ROOT = FsPath(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "web" / "test" / "fixtures"

EXOGENOUS_SERIES = ["period", "year", "l", "ga", "al", "gsig", "sigma", "pbacktime", "cost1",
                    "etree", "rr", "forcoth", "partfract", "cpricebase", "miu_up"]

# Parameter sets spanning what the web app lets people change.
PARAM_CASES: dict[str, Params] = {
    "default": DEFAULT,
    "stern": DEFAULT.with_(prstp=0.001, elasmu=1.01),
    "sensitive_climate": DEFAULT.with_(t2xco2=4.5),
    "high_damages": DEFAULT.with_(a2=0.008, a3=2.5),
    "partial_participation": DEFAULT.with_(partfract2010=0.3, partfractfull=0.9, periodfullpart=12),
    "many_changes": DEFAULT.with_(
        elasmu=2.0, prstp=0.03, gama=0.35, popasym=9000.0, popadj=0.2, dk=0.08, ga0=0.06,
        dela=0.004, gsigma1=-0.02, dsig=-0.002, eland0=2.0, deland=0.1, b12=0.1, b23=0.004,
        t2xco2=2.0, fex1=1.0, c3=0.1, c4=0.03, a1=0.001, a2=0.004, expcost2=2.5, pback=500.0,
        gback=0.01, limmiu=1.0, fixed_savings=0.22,
    ),
}

OPTIMAL_CASES: dict[str, Params] = {
    "default": DEFAULT,
    "stern": DEFAULT.with_(prstp=0.001, elasmu=1.01),
    "sensitive_climate": DEFAULT.with_(t2xco2=4.5),
    "high_damages": DEFAULT.with_(a2=0.008),
    "cheap_backstop": DEFAULT.with_(pback=200.0, gback=0.04),
    "two_degree_cap": DEFAULT.with_(tatm_up=2.0),
}


def _num(x):
    x = float(x)
    return None if np.isnan(x) else x


def _arr(a):
    return [_num(x) for x in np.asarray(a, dtype=float)]


def _path_dict(path) -> dict:
    out = {}
    for k, v in path.as_dict().items():
        out[k] = _num(v) if k == "UTILITY" else _arr(v)
    return out


def control_paths(ex, seed: int):
    """Deterministic, smooth-ish control paths within the bounds."""
    rng = np.random.default_rng(seed)
    n = ex.params.nperiods
    t = np.linspace(0, 1, n)
    miu = np.clip(rng.uniform(0, 0.3) + rng.uniform(0.2, 1.0) * t ** rng.uniform(0.5, 2)
                  + 0.05 * np.sin(rng.uniform(1, 10) * t), 0, ex.miu_up)
    s = np.clip(0.2 + 0.1 * rng.uniform(-1, 1) * np.cos(rng.uniform(1, 6) * t), 0.05, 0.6)
    return miu, s


def simulation_fixtures() -> dict:
    ref = json.loads((ROOT / "reference" / "gams_opt.json").read_text())["series"]
    cases = []
    for i, (name, p) in enumerate(PARAM_CASES.items()):
        ex = compute(p)
        sims = []
        if name == "default":
            sims.append(("gams_opt_controls", np.array(ref["MIU"]), np.array(ref["S"])))
        for j in range(2):
            miu, s = control_paths(ex, seed=100 * i + j)
            sims.append((f"random_{j}", miu, s))
        cases.append({
            "name": name,
            "params": p.to_dict(),
            "exogenous": {
                **{k: _arr(getattr(ex, k)) for k in EXOGENOUS_SERIES},
                "carbon": {k: float(v) for k, v in vars(ex.carbon).items()},
                "sig0": ex.sig0, "lam": ex.lam, "c1": ex.c1, "optlrsav": ex.optlrsav,
            },
            "simulations": [
                {"name": sn, "path": _path_dict(simulate(ex, miu, s))} for sn, miu, s in sims
            ],
        })
    return {"default_params": DEFAULT.to_dict(), "cases": cases}


def optimal_fixtures() -> dict:
    from .model import solve_baseline, solve_optimal

    def sol_dict(sol):
        return {"path": _path_dict(sol.path), "scc": _arr(sol.scc), "scc_output": _arr(sol.scc_output),
                "photel": None if sol.photel is None else _arr(sol.photel)}

    from .scenarios import SCENARIOS

    out = {"optimal": [], "baseline": [], "scenarios": []}
    # The GAMS scenarios: the web presets must use identical parameters.
    for name, p in SCENARIOS.items():
        out["scenarios"].append({"name": name, "params": p.to_dict(), **sol_dict(solve_optimal(p))})
    for name, p in OPTIMAL_CASES.items():
        out["optimal"].append({"name": name, "params": p.to_dict(), **sol_dict(solve_optimal(p))})
    for name in ["default", "sensitive_climate"]:
        p = OPTIMAL_CASES[name]
        out["baseline"].append({"name": name, "params": p.to_dict(), **sol_dict(solve_baseline(p))})
    return out


def write_all() -> None:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    (FIXTURE_DIR / "simulation.json").write_text(json.dumps(simulation_fixtures()) + "\n")
    (FIXTURE_DIR / "optimal.json").write_text(json.dumps(optimal_fixtures()) + "\n")
