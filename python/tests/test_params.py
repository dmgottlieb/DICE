"""The Params defaults must be exactly the values in the vanilla GAMS file."""
import re

import pytest

from dice2013r import DEFAULT, Params

from .conftest import VANILLA_GMS

# GAMS parameters that are intentionally not Params fields.
NOT_PARAMS = {
    "ifopt": "run selection: solve_optimal vs solve_baseline",
    "c1": "derived from c10, c1beta and t2xco2 (Exogenous.c1)",
    "a10": "initial copy of a1, used only to restore it",
    "a20": "initial copy of a2, used only to restore it after the Hotelling step",
}


def gams_scalar_parameters() -> dict[str, float]:
    text = VANILLA_GMS.read_text()
    block = text[text.index("parameters"):text.index("* Program control variables")]
    values = {}
    for line in block.splitlines():
        m = re.match(r"^\s+([A-Za-z]\w*)\s.*?/\s*([-+0-9.eE]+)\s*/", line)
        if m:
            values[m.group(1).lower()] = float(m.group(2))
    return values


def test_parser_finds_parameters():
    params = gams_scalar_parameters()
    assert len(params) > 50
    assert params["elasmu"] == 1.45 and params["scale2"] == -3855.106895


@pytest.mark.parametrize("name,value", sorted(gams_scalar_parameters().items()))
def test_default_matches_gams(name, value):
    if name in NOT_PARAMS:
        pytest.skip(NOT_PARAMS[name])
    assert name in Params.field_names(), f"GAMS parameter {name} missing from Params"
    assert getattr(DEFAULT, name) == pytest.approx(value, rel=0, abs=0)


def test_derived_gams_parameters_consistent():
    gp = gams_scalar_parameters()
    assert gp["a10"] == DEFAULT.a1 and gp["a20"] == DEFAULT.a2
    assert gp["c1"] == DEFAULT.c10  # c1 = c10 + c1beta*(t2xco2 - 2.9) = c10 at default


def test_initial_conditions_match_gams_fx_statements():
    text = VANILLA_GMS.read_text()
    assert "CCA.FX(tfirst)    = 90;" in text and DEFAULT.cca0 == 90
    assert "S.FX(lag10(t)) = optlrsav;" in text and "card(t)-10" in text and DEFAULT.nfixsav == 10
    assert "MIU.up(t)$(t.val<30) = 1;" in text and DEFAULT.miu_cap1_before == 30
    assert "set        t  Time periods (5 years per period)                    /1*60/" in text
    assert DEFAULT.nperiods == 60


def test_with_returns_modified_copy():
    p = DEFAULT.with_(prstp=0.001)
    assert p.prstp == 0.001 and DEFAULT.prstp == 0.015
    assert p.to_dict()["prstp"] == 0.001
