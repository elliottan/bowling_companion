/// <reference lib="webworker" />
import { ShotSearch } from "../lib/shotTrack/shotStart";
import type { SearchMessage, SearchRequest } from "./protocol";

/** Looks for the shot in the first look's frames as the screen draws them (see `protocol.ts`). */
const post = (m: SearchMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

const search = new ShotSearch();
self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const m = event.data;
  if (m.kind === "frame") {
    search.push({ width: m.width, height: m.height, data: new Uint8ClampedArray(m.data), t: m.t });
    return;
  }
  try {
    post({ found: search.finish() });
  } catch {
    post({ found: null });
  }
};
