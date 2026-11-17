import type { PoolMessage, PoolRequest } from "./protocol";
import { servePool } from "./poolServe";

/** What the pool needs of a worker: a real `Worker`, or an `InlineWorker`. */
export interface WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

/**
 * A pool worker on the screen's own thread, for when a real one cannot be
 * started: the same `servePool`, with every message copied or moved
 * as `postMessage` would (`structuredClone` with the same transfer list), and
 * each delivered in a task of its own, so the screen draws between jobs and
 * the readings are the worker's to the bit.
 */
export class InlineWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  private closed = false;
  private readonly take = servePool((m: PoolMessage, transfer: Transferable[] = []) => {
    const copy = structuredClone(m, { transfer });
    setTimeout(() => {
      if (!this.closed) this.onmessage?.({ data: copy } as MessageEvent);
    }, 0);
  });

  postMessage(m: unknown, transfer: Transferable[] = []): void {
    const copy = structuredClone(m, { transfer }) as PoolRequest;
    setTimeout(() => {
      if (!this.closed) this.take(copy);
    }, 0);
  }

  terminate(): void {
    this.closed = true;
  }
}
