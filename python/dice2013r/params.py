"""Scalar parameters of DICE-2013R, with defaults from DICE2013R_110513_vanilla.gms."""
from __future__ import annotations

from dataclasses import asdict, dataclass, fields, replace


@dataclass(frozen=True)
class Params:
    # Time
    nperiods: int = 60          # number of 5-year periods (set t /1*60/)
    tstep: float = 5.0          # years per period

    # Preferences
    elasmu: float = 1.45        # elasticity of marginal utility of consumption
    prstp: float = 0.015        # initial rate of social time preference per year

    # Population and technology
    gama: float = 0.300         # capital elasticity in production function
    pop0: float = 6838.0        # initial world population (millions)
    popadj: float = 0.134       # growth rate to calibrate to 2050 pop projection
    popasym: float = 10500.0    # asymptotic population (millions)
    dk: float = 0.100           # depreciation rate on capital (per year)
    q0: float = 63.69           # initial world gross output (trill 2005 USD)
    k0: float = 135.0           # initial capital value (trill 2005 USD)
    a0: float = 3.80            # initial level of total factor productivity
    ga0: float = 0.079          # initial growth rate for TFP per 5 years
    dela: float = 0.006         # decline rate of TFP per year

    # Emissions
    gsigma1: float = -0.01      # initial growth of sigma (per year)
    dsig: float = -0.001        # decline rate of decarbonization (per period)
    eland0: float = 3.3         # carbon emissions from land 2010 (GtCO2 per year)
    deland: float = 0.2         # decline rate of land emissions (per period)
    e0: float = 33.61           # industrial emissions 2010 (GtCO2 per year)
    miu0: float = 0.039         # initial emissions control rate for base case 2010

    # Carbon cycle: initial conditions (GtC)
    mat0: float = 830.4
    mu0: float = 1527.0
    ml0: float = 10010.0
    # Carbon cycle: equilibrium concentrations (GtC)
    mateq: float = 588.0
    mueq: float = 1350.0
    mleq: float = 10000.0
    # Carbon cycle: flow parameters
    b12: float = 0.088
    b23: float = 0.00250

    # Climate
    t2xco2: float = 2.9         # equilibrium temp impact (oC per doubling CO2)
    fex0: float = 0.25          # 2010 forcings of non-CO2 GHG (Wm-2)
    fex1: float = 0.70          # 2100 forcings of non-CO2 GHG (Wm-2)
    tocean0: float = 0.0068     # initial lower stratum temp change (C from 1900)
    tatm0: float = 0.80         # initial atmospheric temp change (C from 1900)
    c10: float = 0.098          # initial climate equation coefficient for upper level
    c1beta: float = 0.01243     # regression slope coefficient (SoA ~ Equil TSC)
    c3: float = 0.088           # transfer coefficient upper to lower stratum
    c4: float = 0.025           # transfer coefficient for lower level
    fco22x: float = 3.8         # forcings of equilibrium CO2 doubling (Wm-2)

    # Damages
    a1: float = 0.0             # damage intercept
    a2: float = 0.00267         # damage quadratic term
    a3: float = 2.00            # damage exponent

    # Abatement cost
    expcost2: float = 2.8       # exponent of control cost function
    pback: float = 344.0        # cost of backstop 2005$ per tCO2 2010
    gback: float = 0.025        # initial cost decline backstop cost per period
    limmiu: float = 1.2         # upper limit on control rate after 2150
    tnopol: int = 45            # period before which no emissions controls base
    cprice0: float = 1.0        # initial base carbon price (2005$ per tCO2)
    gcprice: float = 0.02       # growth rate of base carbon price per year

    # Participation
    periodfullpart: int = 21    # period at which have full participation
    partfract2010: float = 1.0  # fraction of emissions under control in 2010
    partfractfull: float = 1.0  # fraction of emissions under control at full time

    # Fossil fuel availability
    fosslim: float = 6000.0     # maximum cumulative extraction fossil fuels (GtC)

    # Scaling (do not affect the optimum)
    scale1: float = 0.016408662
    scale2: float = -3855.106895

    # Initial cumulative industrial emissions (GtC), CCA.FX(tfirst) in GAMS
    cca0: float = 90.0
    # Period up to which the control rate is capped at 1 rather than limmiu
    # (GAMS: MIU.up(t)$(t.val<30) = 1)
    miu_cap1_before: int = 30
    # Number of final periods with savings fixed at optlrsav
    nfixsav: int = 10

    # Scenario options (not in the vanilla file; used by the GAMS scenario
    # driver DICE2013_MUP_120913.gms and by the web app)
    fix_miu0: bool = True       # optimal run: fix MIU(2010) at miu0
    miu_lo: float = 0.0         # lower bound on the control rate
    tatm_up: float = 40.0       # upper bound on atmospheric temperature (2.0 = "2 degree limit")
    # Terminal savings rate. None = optlrsav computed from the parameters.
    # (The GAMS scenario driver's Stern run keeps the default-parameter value.)
    fixed_savings: float | None = None
    # Imported participation fraction per period (overrides the ramp built from
    # partfract2010/partfractfull/periodfullpart). Used by the Copenhagen scenario.
    partfract_path: tuple[float, ...] | None = None
    # Control rate fixed per period (None entries stay free) in the optimal run.
    # Used by the Copenhagen scenario (pledged reductions) and calibrated Stern.
    miu_path: tuple[float | None, ...] | None = None

    def with_(self, **changes) -> "Params":
        return replace(self, **changes)

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("partfract_path", "miu_path"):
            if d[k] is not None:
                d[k] = list(d[k])
        return d

    @classmethod
    def field_names(cls) -> list[str]:
        return [f.name for f in fields(cls)]


DEFAULT = Params()
