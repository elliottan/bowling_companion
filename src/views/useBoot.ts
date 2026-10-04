import { useEffect, useState } from "react";
import { syncPatternCatalog } from "../services/patternCatalog";
import {
  getResumableToday,
  getHandedness,
  hasSavedData,
  pruneEmptySessions,
  type ResumableGame
} from "../services/bowlingRepository";
import type { Handedness } from "../types/bowling";

/**
 * The reads the shell cannot paint without, gathered into one gate.
 *
 * They used to be three mount effects that each set their own flag, so the app
 * painted an empty Dashboard, then a welcome screen over it, then the real
 * data. To a returning bowler that reads as a wipe, and the frame in the middle
 * is the one that arrives after a deploy has upgraded the database under an old
 * shell.
 *
 * It lives in `views/` because it reaches for a repository, which `lib/` is not
 * allowed to do (docs/ARCHITECTURE.md).
 */

/** Long enough that a slow disk still resolves, short enough that a hung read
 *  does not hold the app shut. On the timeout the app opens anyway, with
 *  `handednessKnown` false so nobody is asked whether they are new. */
export const BOOT_TIMEOUT_MS = 4000;

export interface BootState {
  /** The shell may paint. False only for the first frames of a cold start. */
  booted: boolean;
  /** Whether the handedness read actually finished. A timeout leaves it false,
   *  which is what keeps "Start fresh" away from a bowler who has history. */
  handednessKnown: boolean;
  handedness: Handedness | null;
  hasSavedData: boolean;
  resumable: ResumableGame | null;
  /** A boot read that failed. Thrown in render so the boundary can decide
   *  whether it is a stale shell or a crash. */
  error: Error | null;
}

const NOT_BOOTED: BootState = {
  booted: false,
  handednessKnown: false,
  handedness: null,
  hasSavedData: false,
  resumable: null,
  error: null
};

/**
 * @param launchedWithRoute the URL already named a screen, so the resume jump
 *   is not wanted and its read is left out of the gate.
 * @param keepSessionId the session the URL reopens, if any. Every other empty
 *   session is pruned before the reads (ADR-116); that one is spared, because
 *   a reload is not walking away from it.
 */
export function useBoot(launchedWithRoute: boolean, keepSessionId: number | null = null): BootState {
  const [state, setState] = useState<BootState>(NOT_BOOTED);

  useEffect(() => {
    let done = false;

    const timeout = window.setTimeout(() => {
      if (done) return;
      done = true;
      setState({ ...NOT_BOOTED, booted: true });
    }, BOOT_TIMEOUT_MS);

    // A session started and left with nothing in it is gone before anything
    // reads the list, so it never shows as a resumable game or a History row.
    void pruneEmptySessions(keepSessionId)
      .catch(() => 0)
      .then(() =>
        Promise.all([
          getHandedness(),
          hasSavedData(),
          launchedWithRoute ? Promise.resolve(null) : getResumableToday()
        ])
      )
      .then(([handedness, saved, resumable]) => {
        if (done) return;
        done = true;
        setState({
          booted: true,
          handednessKnown: true,
          handedness,
          hasSavedData: saved,
          resumable,
          error: null
        });
      })
      .catch((err: unknown) => {
        if (done) return;
        done = true;
        setState({
          ...NOT_BOOTED,
          booted: true,
          error: err instanceof Error ? err : new Error(String(err))
        });
      })
      .finally(() => window.clearTimeout(timeout));

    // The pattern catalog seeds itself into the bowler's own list (ADR-105), so
    // a catalog pattern is just a pattern everywhere else. Deliberately not
    // awaited and never fatal: boot must not wait on a fetch, and a bowler with
    // no signal still has every pattern they had yesterday.
    void syncPatternCatalog().catch(() => {});

    return () => {
      done = true;
      window.clearTimeout(timeout);
    };
    // Read once: the boot gate runs at launch, and the session the URL named
    // then is the one to spare, wherever navigation goes afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launchedWithRoute]);

  return state;
}
