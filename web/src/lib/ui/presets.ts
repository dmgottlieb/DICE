/** The scenarios of the GAMS scenario driver (DICE2013_MUP_120913.gms), with
 * parameters that reproduce its published solutions. Mirrors
 * python/dice2013r/scenarios.py (a test checks they are identical); see that
 * file for the driver's carried-over settings these encode. */
import { DEFAULT, optimalLongRunSavingsDefault, withParams, type Params } from "../dice/params";

export interface Preset {
  id: string;
  label: string;
  description: string;
  /** Name of the policy run (the first series). */
  policyLabel: string;
  /** Short name for the policy run in headline labels. */
  short: string;
  params: Params;
}

const N = DEFAULT.nperiods;
const extend = (t: number[]) => [...t, ...Array(N - t.length).fill(t[t.length - 1])];

// Include/CopenPartFrac.gms and Include/ExogenECR.gms
export const COPEN_PARTFRACT_TABLE = [
  0.2, 0.390423082, 0.379051794, 0.434731269, 0.42272216, 0.410416777, 0.707776548,
  0.692148237, 0.840306905, 0.834064356, 0.939658852, 0.936731085, 0.933881267,
  0.930944201, 0.928088049, 0.925153812, 0.922301007, 0.919378497, 1.0,
];
export const COPEN_MIU_TABLE = [
  0.02, 0.055874801, 0.110937151, 0.163189757, 0.206247482, 0.241939219, 0.30180914,
  0.364484979, 0.423670192, 0.478283881, 0.534073643, 0.588156847, 0.633622, 0.672457,
  0.705173102, 0.733018573, 0.756457118, 0.776297581, 0.794110815, 0.822197128,
  0.839125811, 0.854453754, 0.868106413, 0.880485825, 0.891631752, 0.901741794, 0.9,
];

const sav = optimalLongRunSavingsDefault;

export const PRESETS: Preset[] = [
  {
    id: "opt", label: "DICE-2013R optimal", policyLabel: "Optimal policy", short: "optimal policy",
    description: "Nordhaus's central case: the policy that maximizes discounted welfare.",
    params: { ...DEFAULT },
  },
  {
    id: "lim2", label: "2 °C limit", policyLabel: "Optimal policy, 2 °C limit", short: "optimal policy",
    description: "The best policy that keeps warming at or below 2 °C above 1900.",
    params: withParams({ tatm_up: 2, fix_miu0: false, miu_lo: 1e-4 }),
  },
  {
    id: "stern", label: "Stern Review discounting", policyLabel: "Optimal policy, Stern discounting", short: "optimal policy",
    description: "Near-zero pure time preference (0.1%) and log-like utility (elasticity 1.01), as in the 2006 Stern Review.",
    params: withParams({ prstp: 0.001, elasmu: 1.01, fix_miu0: false, miu_lo: 1e-4, tatm_up: 15, fixed_savings: sav }),
  },
  {
    id: "sterncalib", label: "Stern, recalibrated", policyLabel: "Optimal policy, recalibrated Stern", short: "optimal policy",
    description: "Stern's 0.1% time preference, with the elasticity of marginal utility raised to 2.1 so that the model matches observed interest rates.",
    params: withParams({
      prstp: 0.001, elasmu: 2.1, fix_miu0: false, miu_lo: 0.01, tatm_up: 15, tatm0: 0.83, fixed_savings: sav,
      miu_path: [0.038976, ...Array(N - 1).fill(null)],
    }),
  },
  {
    id: "copen", label: "Copenhagen pledges", policyLabel: "Copenhagen pledges", short: "Copenhagen pledges",
    description: "Emission cuts fixed to the 2009 Copenhagen Accord pledges, with countries joining over time (20% of emissions in 2010, all by 2100). Not an optimum: only savings are chosen.",
    params: withParams({
      fix_miu0: false, miu_lo: 0, tatm_up: 15,
      partfract_path: extend(COPEN_PARTFRACT_TABLE),
      miu_path: [null, ...extend(COPEN_MIU_TABLE).slice(1)],
    }),
  },
];

export const preset = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
