import type { WorkerFault } from "./protocol";

/**
 * How the shot tracer's workers say they failed, and how the screen tells a
 * worker that never loaded from one that threw while working. Safari hands
 * the screen an ErrorEvent with no message for both, so a worker posts
 * `ready` once it has loaded and posts its own errors (`WorkerFault`), and
 * the screen writes what it saw into the details block.
 */

/** What `e` (anything thrown, or a rejection's reason) says. */
export function faultOf(e: unknown): WorkerFault {
  if (e instanceof Error) {
    const message = e.message || e.name;
    const at = firstStackLine(e.stack, message);
    return at ? { message, at } : { message };
  }
  return { message: typeof e === "string" ? e : String(e) };
}

/**
 * The first line of a stack that names a place: V8 starts a stack with the
 * error's own message, Safari and Firefox with the first frame.
 */
export function firstStackLine(stack: string | undefined, message = ""): string | undefined {
  if (!stack) return undefined;
  for (const raw of stack.split("\n")) {
    const line = raw.trim();
    if (!line || (message && line.endsWith(message))) continue;
    return line.replace(/^at /, "");
  }
  return undefined;
}

/** A fault as one line of the details block. */
export function faultNote(f: WorkerFault): string {
  return f.at ? `${f.message}; at ${f.at}` : f.message;
}

/** The parts of a worker's `error` event the screen can read: Safari fills none of them for a script that failed to load. */
export interface LoadError {
  message?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

/** A worker that failed before it said it was ready, from its `error` event and the address it was started from. */
export function loadFailureNote(e: LoadError | null | undefined, url: string): string {
  const file = e?.filename || "none";
  return `did not load: ${e?.message || "no message"} (file ${file}, line ${e?.lineno ?? 0}, column ${e?.colno ?? 0}), from ${url}`;
}

/**
 * Reports a worker's uncaught errors and unhandled rejections as faults, so
 * the screen hears the reason Safari's ErrorEvent leaves out.
 */
export function reportFaults(scope: Pick<EventTarget, "addEventListener">, report: (f: WorkerFault) => void): void {
  scope.addEventListener("error", (e) => {
    const ev = e as ErrorEvent;
    report(faultOf(ev.error ?? ev.message ?? "error"));
  });
  scope.addEventListener("unhandledrejection", (e) => report(faultOf((e as PromiseRejectionEvent).reason)));
}

/**
 * How a worker is made to fail on purpose, for the harness: `load`, a script
 * that is not there; `silent`, one that loads and never answers; `throw`,
 * one that says it is ready and throws on its first message.
 */
export type BreakKind = "load" | "silent" | "throw";

/**
 * `?tracerBreak=search-load,pool-throw` in the address: which of the
 * tracer's workers to break, and how. Nothing in a normal address.
 */
export function breakFlags(query: string): { search?: BreakKind; pool?: BreakKind } {
  const out: { search?: BreakKind; pool?: BreakKind } = {};
  const asked = new URLSearchParams(query).get("tracerBreak");
  for (const part of asked?.split(",") ?? []) {
    const m = /^(search|pool)-(load|silent|throw)$/.exec(part.trim());
    if (m) out[m[1] as "search" | "pool"] = m[2] as BreakKind;
  }
  return out;
}

/** The script of a worker broken on purpose (`BreakKind`), or null for `load`, which is started from an address that is not there. */
export function brokenScript(kind: BreakKind): string | null {
  if (kind === "load") return null;
  if (kind === "silent") return "";
  return 'postMessage({ kind: "ready" }); self.onmessage = () => { throw new Error("broken on purpose (tracerBreak)"); };';
}

/** A worker broken on purpose, and the address it was started from. */
export function startBroken(kind: BreakKind): { worker: Worker; url: string } {
  const script = brokenScript(kind);
  const url = script === null ? new URL("/assets/no-such-worker.js", window.location.href).href : URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
  return { worker: new Worker(url, { type: script === null ? "module" : "classic" }), url };
}
