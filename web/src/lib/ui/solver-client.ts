/** Main-thread side of the worker: at most one solve in flight, and only the
 * latest requested parameters are solved next (intermediate slider positions
 * are skipped). */
import type { Params } from "../dice/params";
import type { Request, Response } from "../worker";
import type { Results } from "./session";

export interface WorkerLike {
  postMessage(msg: Request): void;
  onmessage: ((e: MessageEvent<Response>) => void) | null;
}

export class SolverClient {
  private nextId = 1;
  private inFlight: number | null = null;
  private pending: Params | null = null;
  private sent = new Map<number, Params>();

  constructor(
    private worker: WorkerLike,
    private onResult: (r: Results, p: Params) => void,
    private onError: (message: string, p: Params) => void,
    private onBusy: (busy: boolean) => void = () => {},
  ) {
    worker.onmessage = (e) => {
      const msg = e.data;
      const params = this.sent.get(msg.id)!;
      this.sent.delete(msg.id);
      this.inFlight = null;
      if (msg.type === "result") this.onResult(msg.results, params);
      else this.onError(msg.message, params);
      this.flush();
    };
  }

  request(p: Params) {
    this.pending = p;
    this.flush();
  }

  private flush() {
    if (this.inFlight !== null) return;
    if (!this.pending) { this.onBusy(false); return; }
    const id = this.nextId++;
    this.sent.set(id, this.pending);
    this.worker.postMessage({ type: "solve", id, params: this.pending });
    this.inFlight = id;
    this.pending = null;
    this.onBusy(true);
  }
}
