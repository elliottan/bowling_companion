/// <reference lib="webworker" />
import type { PoolMessage, PoolRequest } from "./protocol";
import { servePool } from "./poolServe";
import { reportFaults } from "./workerFault";

/**
 * One worker of the tracer's pool (`pool.ts`), doing what `servePool` says.
 * It says `ready` once it has loaded, and its own errors as messages, so the
 * screen can tell a worker that never loaded from one that failed working.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: PoolMessage, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

reportFaults(scope, (f) => post({ kind: "error", ...f }));
const take = servePool(post);
scope.onmessage = (event: MessageEvent<PoolRequest>) => take(event.data);
post({ kind: "ready" });
