/** Encode the parameters that differ from the defaults in the URL query, so a
 * set of choices can be shared as a link. Unknown or malformed entries are ignored. */
import { DEFAULT, type Params } from "../dice/params";

const NUMERIC_KEYS = (Object.keys(DEFAULT) as (keyof Params)[]).filter((k) => typeof DEFAULT[k] === "number");

export function encodeParams(p: Params): string {
  const q = new URLSearchParams();
  for (const k of NUMERIC_KEYS) {
    const v = p[k] as number;
    if (v !== DEFAULT[k]) q.set(k, String(+v.toPrecision(10)));
  }
  return q.toString();
}

export function decodeParams(search: string): Params {
  const q = new URLSearchParams(search);
  const p: Params = { ...DEFAULT };
  for (const k of NUMERIC_KEYS) {
    const raw = q.get(k);
    if (raw === null || raw.trim() === "") continue;
    const v = Number(raw);
    if (Number.isFinite(v)) (p as unknown as Record<string, number>)[k] = v;
  }
  return p;
}
