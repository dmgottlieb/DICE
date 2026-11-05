# dice2013r: Python reference implementation of DICE-2013R

A line-by-line transcription of `models/gams/DICE2013R_110513_vanilla.gms`
into Python, solved with [Pyomo](https://www.pyomo.org/) and
[Ipopt](https://coin-or.github.io/Ipopt/). It is the reference that the
browser implementation (`web/`) is tested against.

## Install and run

```bash
cd python
pip install -e '.[test]'
idaes get-extensions      # one way to get an Ipopt binary (pip install idaes-pse first),
                          # or put `ipopt` on PATH, or set $IPOPT
pytest                    # ~440 tests, ~5 s
```

```python
from dice2013r import DEFAULT
from dice2013r.model import solve_optimal, solve_baseline

opt = solve_optimal()                              # GAMS ifopt = 1
base = solve_baseline()                            # GAMS ifopt = 0
stern = solve_optimal(DEFAULT.with_(prstp=0.001, elasmu=1.01))
print(opt.path.TATM, opt.scc)
```

## Layout

| Module | Contents |
|---|---|
| `params.py` | `Params`: every scalar parameter, defaults from the GAMS file |
| `exogenous.py` | Exogenous paths (population, TFP, sigma, backstop price, ...) and derived scalars |
| `equations.py` | One function per GAMS equation; works on floats, numpy arrays and Pyomo expressions |
| `simulate.py` | Forward simulation of all variables given control paths MIU(t), S(t) |
| `model.py` | Pyomo model, optimal and baseline (Hotelling) runs, social cost of carbon |

## Reference data and tests

`reference/extract_gams_reference.py` extracts the GAMS solutions embedded in
the Excel workbook (sheets `GAMSopt`, `GAMSbase`, `GAMSlim2`, `GAMSstern`, ...)
into `reference/gams_*.json`. The tests check, against those numbers:

- **Parameters**: every default equals the value in the `.gms` file (parsed from it).
- **Exogenous paths**: all 60 periods, to the 10 decimals the sheet stores.
- **Each equation separately**: evaluated on the GAMS solution's own values, it
  must reproduce the GAMS solution, for four scenarios.
- **Simulation**: given the GAMS controls, every variable reproduces GAMS to about 1e-9,
  and accounting identities and carbon mass balance hold.
- **Optimization**: optimal, baseline, 2°C-limit and Stern runs match GAMS to about 1e-7
  relative (welfare to 1e-11); bounds hold; the SCC matches a finite-difference
  envelope-theorem check; comparative statics have the expected signs.

## Differences from GAMS, and GAMS quirks found along the way

1. **Two SCC definitions.** The vanilla file defines
   `scc = -1000*eeq.m/cc.m` (consumption as numeraire). The scenario driver
   `DICE2013_MUP_120913.gms`, which produced the Excel sheets, uses
   `-1000*eeq.m/yy.m` (output as numeraire). They agree except in the final 10
   periods, where the savings rate is fixed. `Solution.scc` is the vanilla
   definition (verified by finite differences) and `Solution.scc_output` the
   driver's (matches the sheets).
2. **Final-period control rate.** In period 60 the control rate has no future
   benefit, so the optimum is at its lower bound. Ipopt, an interior-point
   method, stops about 1e-3 above it. Only period-60 quantities that depend on MIU
   are affected.
3. **Scenario driver state carries over.** After its optimal run, the driver
   leaves `MIU.lo = 0.0001` and MIU(2010) free, and its Stern run recomputes
   `optlrsav` without re-fixing the terminal savings rate. The parameters
   `miu_lo`, `fix_miu0` and `fixed_savings` reproduce this
   (see `tests/conftest.py::SCENARIO_PARAMS`).
4. **Baseline.** As in vanilla, the carbon price is *fixed* for periods
   1..45 at max(Hotelling rent, $1 growing 2%/yr); the driver uses an upper
   bound instead, which binds. In this calibration the fossil-fuel limit binds
   when damages are off, but the resulting Hotelling rent stays below the
   baseline carbon price throughout.
