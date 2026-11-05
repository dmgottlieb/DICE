/// <reference lib="webworker" />
/** Web Worker: owns the solver session so the page stays responsive. */
import type { Params } from "./dice/params";
import { SolverSession, type Results } from "./ui/session";

export type Request = { type: "solve"; id: number; params: Params };
export type Response =
  | { type: "result"; id: number; results: Results }
  | { type: "error"; id: number; message: string };

let session: SolverSession | null = null;

self.onmessage = (e: MessageEvent<Request>) => {
  const msg = e.data;
  if (msg.type !== "solve") return;
  const post = (r: Response) => (self as unknown as Worker).postMessage(r);
  try {
    session ??= new SolverSession();
    post({ type: "result", id: msg.id, results: session.solve(msg.params) });
  } catch (err) {
    post({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
  }
};
