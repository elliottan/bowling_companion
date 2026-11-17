import type { CoarseFrame, ShotFound } from "../lib/shotTrack/shotStart";
import type { WorkerLike } from "./inlineWorker";
import type { SearchMessage, SearchRequest } from "./protocol";
import { faultNote, faultOf, loadFailureNote, type LoadError } from "./workerFault";

/** What the screen needs of `ShotSearch`, to run it on its own thread. */
export interface SearchLike {
  push(frame: CoarseFrame): void;
  finish(): ShotFound | null;
}

/** Where the shot is, and, when the worker failed, why the search ran on the screen's own thread instead. */
export interface SearchAnswer {
  found: ShotFound | null;
  fallback: string | null;
}

/** How long the search worker has to say it is ready, milliseconds. */
export const SEARCH_READY_MS = 5000;

/** Frames searched on the screen's thread between two of its turns to draw. */
const FRAMES_PER_TURN = 8;

const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The first look's search (`ShotSearch`), in a worker when one can be
 * started, and on the screen's own thread when it cannot. The small frames
 * go to the worker as they come and are kept here too (about 65 kB each, a
 * hundred or so) until it answers, so a worker that never loads, never says
 * it is ready, or throws loses nothing: the same frames are searched here, by
 * the same code, and the details say why.
 */
export class SearchClient {
  private readonly kept: CoarseFrame[] = [];
  private worker: WorkerLike | null = null;
  private ready = false;
  private finishing = false;
  private sent = 0;
  /** Why the worker is not used, short (for the "ran on the main thread because" line). */
  private failed: string | null = null;
  private answered: { kind: "found"; found: ShotFound | null } | { kind: "failed" } | { kind: "late" } | null = null;
  private wake: (() => void) | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private lateTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    start: () => WorkerLike,
    private readonly opts: {
      /** Where the worker is started from, for the details. */
      url: string;
      makeSearch: () => SearchLike;
      /** A line for the details block's "search worker" entry. */
      note: (text: string) => void;
      readyMs?: number;
      /** How long a ready worker has to answer once it has every frame. */
      answerMs: number;
    }
  ) {
    try {
      const worker = start();
      this.worker = worker;
      worker.onmessage = (e: MessageEvent<SearchMessage>) => this.message(e.data);
      worker.onerror = (e) => {
        if (this.ready) this.fail(`threw while working: ${(e as LoadError)?.message || "no message"}`, "threw");
        else this.fail(loadFailureNote(e as LoadError, opts.url), "did not load");
      };
      this.readyTimer = setTimeout(() => {
        if (!this.ready) this.fail(`never said it was ready in ${(opts.readyMs ?? SEARCH_READY_MS) / 1000} s, from ${opts.url}`, "never got ready");
      }, opts.readyMs ?? SEARCH_READY_MS);
    } catch (e) {
      this.fail(`could not be started: ${faultNote(faultOf(e))}`, "could not be started");
    }
  }

  /** A small frame of the first look, in time order. */
  push(frame: CoarseFrame): void {
    this.kept.push(frame);
    if (this.failed || !this.worker) return;
    // A copy goes: the frame stays here until the worker answers.
    const data = frame.data.slice().buffer as ArrayBuffer;
    this.worker.postMessage({ kind: "frame", width: frame.width, height: frame.height, data, t: frame.t } satisfies SearchRequest, [data]);
    this.sent++;
  }

  /**
   * Where the shot is: the worker's answer, or the search run here when the
   * worker failed. Throws when a worker that was working never answers
   * (`answerMs`): it is busy, not broken, and searching here as well would
   * hold the screen as long.
   */
  async finish(): Promise<SearchAnswer> {
    this.opts.note(`${this.sent} frames sent`);
    this.finishing = true;
    if (!this.failed) {
      this.worker!.postMessage({ kind: "done" } satisfies SearchRequest);
      if (this.ready) this.startLate();
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        if (this.answered) resolve();
      });
    }
    const a = this.answered;
    if (a?.kind === "found") {
      this.kept.length = 0;
      return { found: a.found, fallback: null };
    }
    if (a?.kind === "late") throw new Error(`the search did not answer in ${this.opts.answerMs / 1000} s`);
    const why = this.failed ?? "failed";
    this.opts.note(`the search ran on the main thread because the worker ${why}`);
    const search = this.opts.makeSearch();
    for (let i = 0; i < this.kept.length; i++) {
      search.push(this.kept[i]);
      if (i % FRAMES_PER_TURN === FRAMES_PER_TURN - 1) await nextTurn();
    }
    this.kept.length = 0;
    try {
      return { found: search.finish(), fallback: why };
    } catch (e) {
      this.opts.note(`the search failed on the main thread too: ${faultNote(faultOf(e))}`);
      return { found: null, fallback: why };
    }
  }

  /** Stops the worker and lets go of the frames. */
  stop(): void {
    clearTimeout(this.readyTimer);
    clearTimeout(this.lateTimer);
    this.worker?.terminate();
    this.worker = null;
    this.kept.length = 0;
  }

  private message(m: SearchMessage) {
    if (this.failed || this.answered) return;
    if (!this.ready) {
      // Any message says it loaded.
      this.ready = true;
      clearTimeout(this.readyTimer);
      if (this.finishing) this.startLate();
    }
    if (m.kind === "found") this.settle({ kind: "found", found: m.found });
    else if (m.kind === "error") this.fail(`threw while working: ${faultNote(m)}`, "threw");
  }

  private startLate() {
    clearTimeout(this.lateTimer);
    this.lateTimer = setTimeout(() => this.settle({ kind: "late" }), this.opts.answerMs);
  }

  /** The worker is given up on: noted, stopped, and the search runs here. */
  private fail(note: string, why: string) {
    if (this.failed || this.answered) return;
    this.failed = why;
    this.opts.note(note);
    clearTimeout(this.readyTimer);
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.settle({ kind: "failed" });
  }

  private settle(a: NonNullable<SearchClient["answered"]>) {
    if (this.answered) return;
    this.answered = a;
    clearTimeout(this.lateTimer);
    this.wake?.();
  }
}
