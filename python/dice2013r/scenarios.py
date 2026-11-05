"""The scenarios of the GAMS scenario driver DICE2013_MUP_120913.gms, as
parameter sets that reproduce its published solutions (the GAMS* sheets of
models/excel/DICE2013R.xlsm).

The driver runs its scenarios one after another in a single GAMS session, and
some settings carry over from one run's cleanup into the next. These
parameter sets reproduce that carried-over state, so the results match the
published numbers:

* after the optimal run, MIU.lo = 0.0001 and MIU(2010) is free;
* after the 2 degree run, TATM.up = 15 (never binds);
* the Stern runs recompute optlrsav but never re-fix the terminal savings
  rate, so it stays at the default-parameter value;
* the calibrated Stern run sets MIU.lo = 0.01, fixes MIU(2010) = 0.038976 and
  starts from TATM(2010) = 0.83;
* the Copenhagen run fixes the control rate in every period after 2010 to the
  pledge path in Include/ExogenECR.gms, with participation from
  Include/CopenPartFrac.gms (its include lines are commented out in the
  driver, but the Excel sheet was produced with them).
"""
from __future__ import annotations

from .exogenous import optimal_long_run_savings
from .params import DEFAULT, Params

NPERIODS = DEFAULT.nperiods

# Include/CopenPartFrac.gms: periods 1..19, then the period-19 value.
COPEN_PARTFRACT_TABLE = (
    0.2, 0.390423082, 0.379051794, 0.434731269, 0.42272216, 0.410416777, 0.707776548,
    0.692148237, 0.840306905, 0.834064356, 0.939658852, 0.936731085, 0.933881267,
    0.930944201, 0.928088049, 0.925153812, 0.922301007, 0.919378497, 1.0,
)
# Include/ExogenECR.gms: periods 1..27, then the period-27 value.
COPEN_MIU_TABLE = (
    0.02, 0.055874801, 0.110937151, 0.163189757, 0.206247482, 0.241939219, 0.30180914,
    0.364484979, 0.423670192, 0.478283881, 0.534073643, 0.588156847, 0.633622, 0.672457,
    0.705173102, 0.733018573, 0.756457118, 0.776297581, 0.794110815, 0.822197128,
    0.839125811, 0.854453754, 0.868106413, 0.880485825, 0.891631752, 0.901741794, 0.9,
)


def _extend(table: tuple[float, ...], n: int = NPERIODS) -> tuple[float, ...]:
    return tuple(table) + (table[-1],) * (n - len(table))


DEFAULT_OPTLRSAV = optimal_long_run_savings(DEFAULT)

SCENARIOS: dict[str, Params] = {
    "opt": DEFAULT,
    "lim2": DEFAULT.with_(tatm_up=2.0, fix_miu0=False, miu_lo=1e-4),
    "stern": DEFAULT.with_(prstp=0.001, elasmu=1.01, fix_miu0=False, miu_lo=1e-4,
                           tatm_up=15.0, fixed_savings=DEFAULT_OPTLRSAV),
    "sterncalib": DEFAULT.with_(
        prstp=0.001, elasmu=2.1, fix_miu0=False, miu_lo=0.01, tatm_up=15.0, tatm0=0.83,
        fixed_savings=DEFAULT_OPTLRSAV, miu_path=(0.038976,) + (None,) * (NPERIODS - 1),
    ),
    "copen": DEFAULT.with_(
        fix_miu0=False, miu_lo=0.0, tatm_up=15.0,
        partfract_path=_extend(COPEN_PARTFRACT_TABLE),
        # Period 1 is left free (GAMS: MIU.up("1") = 1.5, MIU.lo("1") = 0).
        miu_path=(None,) + _extend(COPEN_MIU_TABLE)[1:],
    ),
}
