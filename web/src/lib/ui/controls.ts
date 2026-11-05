/** The model settings exposed in the UI, mapped onto DICE parameters. */
import { DEFAULT, type Params } from "../dice/params";

export interface Control {
  id: string;
  group: string;
  label: string;
  help: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  /** Read the control's value (in display units) from parameters. */
  get(p: Params): number;
  /** Write a display value into parameters (returns a new object). */
  set(p: Params, v: number): Params;
  format(v: number): string;
}

const pct = (digits: number) => (v: number) => `${v.toFixed(digits)}%`;
const fixed = (digits: number) => (v: number) => v.toFixed(digits);

/** Straightforward one-to-one control on a parameter, with a display scale factor. */
function simple(id: keyof Params, o: Omit<Control, "id" | "get" | "set"> & { scale?: number }): Control {
  const k = o.scale ?? 1;
  return {
    id, ...o,
    get: (p) => (p[id] as number) * k,
    set: (p, v) => ({ ...p, [id]: v / k }),
  };
}

/** Damages are set as the % of output lost at 3 °C, so changing the exponent
 * changes the curvature while keeping that anchor fixed. */
const damageAt3 = (p: Params) => 100 * (p.a1 * 3 + p.a2 * 3 ** p.a3);

export const CONTROLS: Control[] = [
  simple("prstp", {
    group: "Discounting", label: "Pure rate of time preference", unit: "% per year",
    help: "How much less a unit of well-being counts for each year it lies in the future. DICE: 1.5%; the Stern Review: 0.1%.",
    min: 0, max: 5, step: 0.1, scale: 100, format: pct(1),
  }),
  simple("elasmu", {
    group: "Discounting", label: "Elasticity of marginal utility", unit: "",
    help: "How fast the value of extra consumption falls as people get richer. Higher values mean future (richer) generations' gains count for less, and inequality aversion is stronger.",
    min: 0.5, max: 3, step: 0.05, format: fixed(2),
  }),
  simple("t2xco2", {
    group: "Climate", label: "Climate sensitivity", unit: "°C per CO₂ doubling",
    help: "Long-run warming from doubling atmospheric CO₂. DICE-2013R uses 2.9 °C; the IPCC's likely range is roughly 2.5–4 °C.",
    min: 1.5, max: 6, step: 0.1, format: fixed(1),
  }),
  {
    id: "damage3", group: "Damages", label: "Damages at 3 °C of warming", unit: "% of output",
    help: "Share of world output lost at 3 °C. DICE-2013R: 2.4%. Many critics argue this is too low.",
    min: 0, max: 20, step: 0.001,
    get: damageAt3,
    set: (p, v) => ({ ...p, a2: (v / 100 - p.a1 * 3) / 3 ** p.a3 }),
    format: pct(2),
  },
  {
    id: "a3", group: "Damages", label: "Damage curvature (exponent)", unit: "",
    help: "How sharply damages rise with temperature (2 = quadratic). Damages at 3 °C are held fixed, so higher values mean lower damages below 3 °C and higher damages above.",
    min: 1, max: 4, step: 0.1,
    get: (p) => p.a3,
    set: (p, v) => {
      const d3 = damageAt3(p) / 100;
      return { ...p, a3: v, a2: (d3 - p.a1 * 3) / 3 ** v };
    },
    format: fixed(1),
  },
  simple("pback", {
    group: "Abatement cost", label: "Backstop price in 2010", unit: "$ per t CO₂",
    help: "Cost of removing the last ton of emissions (100% control) in 2010. Abatement costs scale with it.",
    min: 50, max: 1000, step: 2, format: (v) => `$${v.toFixed(0)}`,
  }),
  simple("gback", {
    group: "Abatement cost", label: "Backstop cost decline", unit: "% per 5 years",
    help: "How fast the backstop gets cheaper through technical progress. DICE: 2.5% per 5 years.",
    min: 0, max: 10, step: 0.1, scale: 100, format: pct(1),
  }),
  simple("limmiu", {
    group: "Abatement cost", label: "Maximum control rate after 2150", unit: "",
    help: "Emissions control above 1 means net negative industrial emissions. DICE allows up to 1.2 after 2150.",
    min: 1, max: 1.5, step: 0.05, format: fixed(2),
  }),
  simple("popasym", {
    group: "Growth", label: "Long-run population", unit: "billions",
    help: "The level world population approaches. DICE: 10.5 billion.",
    min: 7, max: 16, step: 0.1, scale: 1 / 1000, format: fixed(1),
  }),
  simple("ga0", {
    group: "Growth", label: "Initial productivity growth", unit: "% per 5 years",
    help: "Growth of total factor productivity in 2010, which then slows. DICE: 7.9% per 5 years.",
    min: 2, max: 14, step: 0.1, scale: 100, format: pct(1),
  }),
  simple("gsigma1", {
    group: "Growth", label: "Decarbonization without policy", unit: "% per year",
    help: "How fast the economy's carbon intensity falls on its own in 2010 (negative = falling). DICE: −1% per year.",
    min: -3, max: 0, step: 0.1, scale: 100, format: pct(1),
  }),
  simple("fosslim", {
    group: "Policy & limits", label: "Fossil fuel resources", unit: "GtC",
    help: "Maximum cumulative fossil carbon that can be extracted. DICE: 6,000 GtC (rarely binding).",
    min: 1000, max: 10000, step: 100, format: (v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 }),
  }),
];

export const NO_CAP = 40; // GAMS TATM.up: effectively no limit
export const CAP_CONTROL = {
  id: "tatm_up", label: "Cap on warming", unit: "°C", min: 1.2, max: 4, step: 0.05,
  help: "Imposes a temperature limit on the optimal policy (DICE's “2 °C limit” scenario uses 2 °C). Not applied to the baseline.",
};

export const GROUPS = [...new Set(CONTROLS.map((c) => c.group))];

/** Baseline runs ignore a temperature cap (it is a policy, the baseline is "no new policy"). */
export const baselineParams = (p: Params): Params => ({ ...p, tatm_up: NO_CAP });

export function isDefault(c: Control, p: Params): boolean {
  return Math.abs(c.get(p) - c.get(DEFAULT)) < c.step / 2;
}
