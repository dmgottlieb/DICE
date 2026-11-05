import json
from pathlib import Path

import numpy as np
import pytest

from dice2013r import DEFAULT
from dice2013r.model import find_ipopt
from dice2013r.scenarios import SCENARIOS

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "reference"
VANILLA_GMS = ROOT / "models" / "gams" / "DICE2013R_110513_vanilla.gms"

# Parameter settings that reproduce each GAMS scenario sheet (see
# dice2013r/scenarios.py for the scenario driver's carried-over state).
SCENARIO_PARAMS = {"base": DEFAULT, **SCENARIOS}


def load_reference(scenario: str) -> dict:
    data = json.loads((REFERENCE / f"gams_{scenario}.json").read_text())
    data["series"] = {k: np.array([np.nan if v is None else v for v in vals])
                      for k, vals in data["series"].items()}
    # GAMS leaves the last-period interest rate undefined and prints it as 0.
    data["series"]["RI"][-1] = np.nan
    return data


@pytest.fixture(scope="session")
def ref():
    return {s: load_reference(s) for s in SCENARIO_PARAMS}


def assert_series_close(actual, expected, name, rtol=1e-8, atol=1e-10, periods=slice(None)):
    """Compare two time series, reporting the worst period on failure."""
    a = np.asarray(actual, dtype=float)[periods]
    e = np.asarray(expected, dtype=float)[periods]
    assert a.shape == e.shape, f"{name}: shape {a.shape} != {e.shape}"
    mask = ~(np.isnan(a) & np.isnan(e))
    err = np.abs(a - e)
    tol = atol + rtol * np.abs(e)
    bad = mask & ~(err <= tol)
    if bad.any():
        offset = periods.start or 0 if isinstance(periods, slice) else 0
        i = int(np.argmax(np.where(mask, err - tol, -np.inf)))
        raise AssertionError(
            f"{name}: {bad.sum()} periods out of tolerance; worst at period "
            f"{i + offset + 1}: actual={a[i]!r} expected={e[i]!r} "
            f"(abs err {err[i]:.3e}, tol {tol[i]:.3e})"
        )


requires_ipopt = pytest.mark.skipif(find_ipopt() is None, reason="Ipopt not available")
