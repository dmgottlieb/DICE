"""The scenario definitions must match the GAMS include files and driver."""
import re

import numpy as np
import pytest

from dice2013r import DEFAULT, compute_exogenous
from dice2013r.model import fixed_controls
from dice2013r.scenarios import COPEN_MIU_TABLE, COPEN_PARTFRACT_TABLE, SCENARIOS

from .conftest import ROOT, load_reference

INCLUDE = ROOT / "models" / "gams" / "Include"


def gams_table(name: str) -> list[float]:
    """Parse the `$ondelim ... $offdelim` table of a GAMS include file."""
    text = (INCLUDE / name).read_text()
    body = text[text.index("$ondelim"):text.index("$offdelim")]
    rows = re.findall(r"^(\d+),([-0-9.eE]+)\s*$", body, flags=re.M)
    assert [int(t) for t, _ in rows] == list(range(1, len(rows) + 1))
    return [float(v) for _, v in rows]


def test_copenhagen_participation_matches_gams_include():
    assert list(COPEN_PARTFRACT_TABLE) == gams_table("CopenPartFrac.gms")


def test_copenhagen_control_rates_match_gams_include():
    assert list(COPEN_MIU_TABLE) == gams_table("ExogenECR.gms")


def test_copenhagen_paths_extend_last_value_and_match_sheet():
    p = SCENARIOS["copen"]
    assert len(p.partfract_path) == 60 and len(p.miu_path) == 60
    assert p.partfract_path[30] == COPEN_PARTFRACT_TABLE[-1]
    assert p.miu_path[0] is None and p.miu_path[59] == COPEN_MIU_TABLE[-1]
    ref = load_reference("copen")["series"]
    np.testing.assert_allclose(compute_exogenous(p).partfract, ref["partfract"], rtol=1e-9)
    np.testing.assert_allclose([v for v in p.miu_path[1:]], ref["MIU"][1:], rtol=1e-8)


def test_driver_settings_quoted_in_scenarios():
    """The values used for the carried-over driver state appear in the GAMS files."""
    calib = (INCLUDE / "def_sternCalib.gms").read_text()
    assert "ELASMU=2.1;" in calib and "miu.lo(t)=.01;" in calib
    assert 'miu.fx("1")= 0.038976;' in calib and 'tatm.fx("1")=0.83;' in calib
    p = SCENARIOS["sterncalib"]
    assert (p.elasmu, p.miu_lo, p.tatm0, p.miu_path[0]) == (2.1, 0.01, 0.83, 0.038976)
    assert "MIU.lo(t) = .0001" in (INCLUDE / "def_opt_cleanup.gms").read_text()
    assert "TATM.up(t)  = 15;" in (INCLUDE / "def_limt2deg_cleanup.gms").read_text()


def test_fixed_controls():
    assert fixed_controls(DEFAULT) == {0: DEFAULT.miu0}
    assert fixed_controls(SCENARIOS["sterncalib"]) == {0: 0.038976}
    assert len(fixed_controls(SCENARIOS["copen"])) == 59
    with pytest.raises(ValueError):
        fixed_controls(DEFAULT.with_(miu_path=(0.5,)))


def test_partfract_path_validated():
    with pytest.raises(ValueError):
        compute_exogenous(DEFAULT.with_(partfract_path=(1.0, 1.0)))


def test_to_dict_lists_paths():
    d = SCENARIOS["copen"].to_dict()
    assert isinstance(d["partfract_path"], list) and isinstance(d["miu_path"], list)
