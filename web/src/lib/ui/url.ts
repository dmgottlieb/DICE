/** URL state, so a set of choices can be shared as a link: the scenario
 * preset (if not the default) plus the numeric parameters that differ from it.
 * Unknown or malformed entries are ignored. */
import { DEFAULT, type Params } from "../dice/params";
import { PRESETS, preset } from "./presets";

const NUMERIC_KEYS = (Object.keys(DEFAULT) as (keyof Params)[]).filter((k) => typeof DEFAULT[k] === "number");

export function encodeParams(p: Params, presetId = "opt"): string {
  const base = preset(presetId);
  const q = new URLSearchParams();
  if (base.id !== "opt") q.set("scenario", base.id);
  for (const k of NUMERIC_KEYS) {
    const v = p[k] as number;
    if (v !== base.params[k]) q.set(k, String(+v.toPrecision(10)));
  }
  return q.toString();
}

export function decodeParams(search: string): { params: Params; presetId: string } {
  const q = new URLSearchParams(search);
  const id = q.get("scenario");
  const base = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  const p: Params = { ...base.params };
  for (const k of NUMERIC_KEYS) {
    const raw = q.get(k);
    if (raw === null || raw.trim() === "") continue;
    const v = Number(raw);
    if (Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = v;
  }
  return { params: p, presetId: base.id };
}
