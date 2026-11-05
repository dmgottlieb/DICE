"""The committed web fixtures must match what the Python code produces now."""
import json

import numpy as np
import pytest

from dice2013r.fixtures import FIXTURE_DIR, optimal_fixtures, simulation_fixtures

from .conftest import requires_ipopt


def _compare(a, b, rtol, path="$"):
    if isinstance(a, dict):
        assert a.keys() == b.keys(), f"{path}: keys differ"
        for k in a:
            _compare(a[k], b[k], rtol, f"{path}.{k}")
    elif isinstance(a, list) and a and isinstance(a[0], (dict, list)):
        assert len(a) == len(b), f"{path}: length differs"
        for i, (x, y) in enumerate(zip(a, b)):
            _compare(x, y, rtol, f"{path}[{i}]")
    elif isinstance(a, list) and a and all(isinstance(x, (int, float)) or x is None for x in a):
        x = np.array([np.nan if v is None else v for v in a], float)
        y = np.array([np.nan if v is None else v for v in b], float)
        np.testing.assert_allclose(x, y, rtol=rtol, atol=rtol * np.nanmax(np.abs(y), initial=1e-300),
                                   equal_nan=True, err_msg=path)
    elif isinstance(a, float) and isinstance(b, float):
        assert a == pytest.approx(b, rel=rtol), path
    else:
        assert a == b, path


def test_simulation_fixtures_up_to_date():
    committed = json.loads((FIXTURE_DIR / "simulation.json").read_text())
    _compare(simulation_fixtures(), committed, rtol=1e-12)


@requires_ipopt
def test_optimal_fixtures_up_to_date():
    committed = json.loads((FIXTURE_DIR / "optimal.json").read_text())
    _compare(optimal_fixtures(), committed, rtol=1e-6)
