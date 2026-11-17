/// <reference lib="webworker" />
import { ShotSearch } from "../lib/shotTrack/shotStart";
import type { SearchMessage, SearchRequest } from "./protocol";
import { faultOf, reportFaults } from "./workerFault";

/**
 * Looks for the shot in the first look's frames as the screen draws them (see
 * `protocol.ts`). Says `ready` once it has loaded, and what went wrong as a
 * message rather than a throw, so the screen can tell a worker that never
 * loaded from one that failed working, and search on its own thread instead.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: SearchMessage) => scope.postMessage(m);

reportFaults(scope, (f) => post({ kind: "error", ...f }));
const search = new ShotSearch();
scope.onmessage = (event: MessageEvent<SearchRequest>) => {
  try {
    const m = event.data;
    if (m.kind === "frame") {
      search.push({ width: m.width, height: m.height, data: new Uint8ClampedArray(m.data), t: m.t });
      return;
    }
    post({ kind: "found", found: search.finish() });
  } catch (e) {
    post({ kind: "error", ...faultOf(e) });
  }
};
post({ kind: "ready" });
