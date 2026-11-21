/**
 * Waits that end. The shot tracer's loading stages wait on things a browser
 * may never answer: `VideoDecoder.isConfigSupported`, a file read, a decoded
 * frame's `copyTo`, a video element's `play()`. One that never settles held
 * the screen on its waiting step for ever, with no details (an iPhone, Safari
 * 18.7, an 8-bit HEVC portrait clip, 0.116.0). Every such wait goes through
 * `within` (one await) or a `Watchdog` (a whole stage that must keep moving),
 * and ends in a `Stalled` error that says what stalled, for the details line.
 */

/** A wait that went on too long; its message says what was waited for and how long. */
export class Stalled extends Error {
  constructor(
    /** What was waited for, short ("isConfigSupported", "reading the file"). */
    readonly what: string,
    readonly ms: number
  ) {
    super(`${what} stalled: no answer in ${secondsText(ms)} s`);
    this.name = "Stalled";
  }
}

/** Milliseconds as seconds for a details line: whole where whole, else one decimal. */
function secondsText(ms: number): string {
  const s = ms / 1000;
  return Number.isInteger(s) ? String(s) : s.toFixed(1);
}

/**
 * `p`, or a `Stalled` rejection naming `what` when it has not settled in `ms`
 * milliseconds. `p` itself is not stopped (a promise cannot be): a late
 * answer is dropped, and a late rejection is swallowed.
 */
export function within<T>(p: Promise<T> | T, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let over = false;
    const timer = setTimeout(() => {
      over = true;
      reject(new Stalled(what, ms));
    }, ms);
    Promise.resolve(p).then(
      (v) => {
        if (over) return;
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        if (over) return;
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * A stage that must keep moving: `guard` settles as its promise does, or
 * rejects with a `Stalled` naming the stage and the last thing it did once
 * nothing has `poke`d it for `ms` milliseconds.
 */
export class Watchdog {
  private last = "nothing yet";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private bite: (() => void) | null = null;

  constructor(
    private readonly ms: number,
    private readonly what: string
  ) {}

  /** The stage moved on; `doing` says how, for the details if it stalls after. */
  poke(doing?: string): void {
    if (doing) this.last = doing;
    if (!this.bite) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(this.bite, this.ms);
  }

  guard<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let over = false;
      const end = () => {
        over = true;
        this.bite = null;
        clearTimeout(this.timer);
      };
      this.bite = () => {
        if (over) return;
        end();
        reject(new Stalled(`${this.what} (last: ${this.last})`, this.ms));
      };
      this.timer = setTimeout(this.bite, this.ms);
      p.then(
        (v) => {
          if (over) return;
          end();
          resolve(v);
        },
        (e: unknown) => {
          if (over) return;
          end();
          reject(e);
        }
      );
    });
  }
}
