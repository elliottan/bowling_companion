import { IconButton } from "./ui/IconButton";
import { Check, ChevronLeft, ChevronRight, Lock, Minus, MoveHorizontal, Plus, SlidersHorizontal, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Handedness, LineSpec, PinNumber } from "../types/bowling";
import { HandednessContext, useHandedness } from "../lib/handednessContext";
import { useDriftModel } from "../lib/driftModelContext";
import { useSessionOilPattern } from "../lib/oilPatternContext";
import { getOilPatterns } from "../services/ballRepository";
import { getCatalogPatterns } from "../services/patternCatalog";
import { buildLineCard, type ShareCardData } from "../lib/shareCard";
import { FREE_APP_PATH } from "../lib/pro";
import { shareOrigin } from "../lib/platform";
import { lineShareUrl } from "../lib/lineShare";
import { ShareCardDialog } from "./ShareCardDialog";
import { ShareIosIcon } from "./icons";
import { ProVeil } from "./ui/ProLock";
import type { OilPattern } from "../types/bowling";
import { BREAK_PAST_OIL_FT, headlineRatio, oilBands, oilExitPoint, oilStats, oilZones, patternLabel, peakUnits, type OilStats } from "../lib/oilPattern";
import { useOverlay } from "../lib/useOverlay";
import { registerPushExit } from "../lib/backGesture";
import { deriveLaydown, deriveLaydownFromSlide, deriveSlide } from "../lib/driftModel";
import { spareAimPoint } from "../lib/spareAim";
import { LaneSurface, type OilOverlay } from "./LaneSurface";
import { ChoiceInput } from "./ui/SuggestInput";
import {
  buildLinePath, breakpointFloorTiming, solveLine, projectBreakpoint, xToBoard, yToFeet, PLANE_W, PLANE_L,
  POCKET_BOARD, type Peg, arrowFeet, ARROWS_FEET, LANE_FEET, HOOK_START_FT, HOOK_LENGTH_FT,
} from "../lib/laneGeometry";
import { formatFixed } from "../lib/format";

const BOWLER_DEG = 45;     // bowler's-eye tilt (looking down the lane)
const TOPDOWN_DEG = 0;     // flat / top-down

/** Stage transform for a tilt angle. At 0° it is the identity (the centered
 *  top-down view, inputs on the side); as it tilts toward the bowler view it
 *  scales up and lifts so the whole lane stays visible above the bottom input
 *  bar. Set so the pins land just under the floating controls and the foul
 *  line on the board numbers, on a phone: at 50° and less lift the far end
 *  stopped a good way short of the controls and left the top of the screen
 *  empty. */
function stageTransform(deg: number): string {
  const t = deg / BOWLER_DEG;
  return `translate(0%, ${(-14 * t).toFixed(2)}%) scale(${(1 + 0.28 * t).toFixed(3)}) rotateX(${deg}deg)`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snapBoard = (b: number) => clamp(Math.round(b * 2) / 2, 1, 39);

/** Drag handle key → the peg it owns (drives the recency-priority solver). */
const HANDLE_PEG: Record<string, Peg> = {
  laydown: "laydown", target: "target", breakpoint: "breakpoint", final: "final",
};

type LockablePeg = "laydown" | "target" | "final";
const LOCKABLE: ReadonlySet<string> = new Set(["laydown", "target", "final"]);

/** Effective value of a lockable peg on a line. */
function pegValue(l: LineSpec | undefined, k: LockablePeg): number | undefined {
  if (k === "final") return l?.final_board ?? POCKET_BOARD;
  if (k === "laydown") return l?.laydown ?? l?.stance;
  return l?.target;
}

/** Matches PushScreen's exit, so a pushed lane leaves like any pushed screen. */
const PUSH_EXIT_MS = 280;

interface LaneVisualizerProps {
  line: LineSpec | undefined;
  onClose: () => void;
  /** Optional live editing. When omitted, the view is read-only. */
  onChange?: (line: LineSpec | undefined) => void;
  /** Standing leave to light (spare surface). */
  leave?: PinNumber[];
  /** Spare mode: configurable final depth; hook timing + breakpoint shared with strike (ADR-026). */
  spare?: boolean;
  /** Show a Stance stepper alongside the pegs. Only for callers where stance is
   *  the field of record and laydown is derived from it (the Spares tab, whose
   *  form is gone), never on an Actual line, which is slide-based (ADR-032). */
  showStance?: boolean;
  title?: string;
  /** Veto hook for a locked (completed) game: return false to drop a user edit.
   *  Only user drags/taps are gated, the auto-seed effects below bypass it. */
  onEditAttempt?: () => boolean;
  /** Pegs pinned when the view opens (max 2, one aim peg must stay free).
   *  The Actual line opens with laydown + target pinned so the final board is
   *  the first thing that moves (ADR-032). */
  defaultLocks?: readonly LockablePeg[];
  /** True while another overlay (e.g. the locked-game "Edit this completed
   *  game?" confirm, raised from onEditAttempt) is stacked on top of this
   *  visualizer, suspends its own Escape/focus-trap so only the topmost
   *  layer responds to Escape and Tab. */
  suspended?: boolean;
  /** Offer a bowling-hand switch in the lane options, for a view that belongs to
   *  nobody's shot. Same rule as the pattern picker above it: a shot was thrown
   *  by a hand and the sandbox was not (ADR-108). */
  handSwitchable?: boolean;
  /** Hand the view opens on, overriding the bowler's own. Only a shared link
   *  sets it: the line was drawn by whoever sent it (ADR-110). */
  seedHand?: Handedness;
  /** `catalog_id` of the pattern to open drawn under the line, from a shared
   *  link. Resolved against the bowler's own rows first, then the catalog. */
  seedPatternCatalogId?: string;
  /** Own row id of the pattern to open drawn under the line, from its own
   *  detail sheet ("try this pattern in the line visualizer"). Distinct from
   *  `seedPatternCatalogId`: that one names a pattern by what it IS, for a
   *  link that may cross devices; this one names a row already on this
   *  device, so its own id is enough. */
  seedPatternId?: number;
  /** How the view arrives. "cover" (the default) is a layer over everything,
   *  for a lane opened from a shot or a sheet. "push" is a pushed screen in
   *  the app's own stack, for the sandbox: it slides in from the trailing
   *  edge, leaves the same way, backs out with a chevron, and a screen pushed
   *  over it (the Pro page) backs out to it as over any other (ADR-211). */
  presentation?: "cover" | "push";
  /** Read-only because moving the line is Pro, not because there is nothing
   *  to move (ADR-167). The peg fields stay in their place, each with a small
   *  lock (ADR-209), under one
   *  tap to the Pro page, and each point on the lane carries a lock. The Pro
   *  page opens above the lane (ADR-175), so the lane stays as it is under it.
   *  Ignored while `onChange` is set. */
  editLocked?: boolean;
}

export function LaneVisualizer({ line, onClose, onChange, leave, spare = false, showStance = false, title = "Line", onEditAttempt, defaultLocks, suspended = false, handSwitchable = false, seedHand, seedPatternCatalogId, seedPatternId, editLocked, presentation = "cover" }: LaneVisualizerProps) {
  const appHand = useHandedness();
  const pushed = presentation === "push";
  // A pushed lane renders from the app shell's screen stack, but has to sit
  // above the sheets, so it goes to the body as the Pro page does (ADR-175).
  const portal = (node: ReactNode) => (pushed ? createPortal(node, document.body) : node);
  // A pushed lane leaves the way a PushScreen does: slid back out to the
  // trailing edge, then closed. A covering one just closes.
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const close = useCallback(() => {
    if (!pushed) {
      onClose();
      return;
    }
    if (exitTimer.current !== null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setExiting(true);
    exitTimer.current = window.setTimeout(onClose, PUSH_EXIT_MS);
  }, [pushed, onClose]);
  useEffect(() => () => {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
  }, []);
  // The iPhone app's edge swipe leaves a pushed lane through the same slide.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  // Nothing here is written back to settings: mirroring the lane to see how the
  // other hand plays it is a question being asked, not the bowler changing hands
  // (the layout lab's rule, ADR-108). Resets on close with the component.
  // A shared link seeds it, because the line it carries was drawn by that hand
  // and reading it as your own would be reading a different shot (ADR-110).
  const [handOverride, setHandOverride] = useState<Handedness | null>(seedHand ?? null);
  const hand = handSwitchable ? handOverride ?? appHand : appHand;
  const driftModel = useDriftModel();
  // A session names its pattern, and that is not the visualizer's to override.
  // Without one, the lane can still be tried against a pattern you have saved:
  // the sandbox is exactly where you would want that, and it has no session to
  // inherit from (ADR-101).
  const sessionPattern = useSessionOilPattern();
  const [pickable, setPickable] = useState<OilPattern[]>([]);
  const [pickedId, setPickedId] = useState<number | null>(seedPatternId ?? null);
  // A pattern a link named that this device does not have saved. Drawn from the
  // catalog so the line still arrives on the lane it was played on, and never
  // written to the bowler's list: reading someone's line is not adopting their
  // pattern (ADR-110).
  const [linkPattern, setLinkPattern] = useState<OilPattern | null>(null);
  const oilPattern = sessionPattern ?? pickable.find((p) => p.id === pickedId) ?? linkPattern ?? null;
  const [deg, setDeg] = useState(BOWLER_DEG);
  // The quick-move menu (ADR-109) and the share preview. Both are layers over
  // the lane, so both suspend the visualizer's own Escape while they are up.
  const [movesOpen, setMovesOpen] = useState(false);
  const movesButtonRef = useRef<HTMLButtonElement | null>(null);
  const [card, setCard] = useState<ShareCardData | null>(null);
  const [dragging, setDragging] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const dragY = useRef<number | null>(null);
  const tiltMoved = useRef(0);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // Aim cascade (ADR-027): the peg that gives way when a breakpoint drag passes
  // the timing wall = the LEAST-recently-touched aim peg. Only direct edits
  // update recency (a cascade move doesn't, else pegs would alternate); the
  // choice freezes at grab for the whole gesture. Fresh line: target gives way.
  const lastAimEdit = useRef<"laydown" | "target">("laydown");
  const dragGiveWay = useRef<"target" | "laydown" | null>("target");
  const isTopDown = deg <= 2;

  // Hard peg locks (ADR-028): tap a peg to freeze it. Max 2, one aim peg must
  // stay free or nothing is editable. Reset on close (component unmounts).
  const [locked, setLocked] = useState<ReadonlySet<LockablePeg>>(
    () => new Set((defaultLocks ?? []).slice(0, 2))
  );
  const grabbedKey = useRef<string | null>(null);
  const dragStarted = useRef(false);
  const grabXY = useRef<{ x: number; y: number } | null>(null);

  // Escape/focus-trap/focus-restore for the visualizer itself. Disabled while
  // the nested hook-options sheet is open so a single Escape press (and the
  // trap) only ever apply to the topmost layer, the sheet has its own.
  // A pushed lane is a route, so history already closes it; registering it as
  // a sheet as well gave it a second back entry of its own, which a Pro page
  // opened over it then took over, and back from that page landed on the
  // screen under the lane before the lane came back (ADR-211).
  const overlayRef = useOverlay<HTMLDivElement>(
    close,
    !optionsOpen && !movesOpen && card == null && !suspended,
    !pushed
  );
  // The iPhone app's edge swipe moves a pushed lane with the finger, then
  // leaves through the same slide.
  useEffect(
    () => (pushed ? registerPushExit(() => closeRef.current(), () => overlayRef.current) : undefined),
    [pushed, overlayRef]
  );

  function toggleLock(key: string) {
    if (!LOCKABLE.has(key)) return;
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(key as LockablePeg)) next.delete(key as LockablePeg);
      else if (next.size < 2) next.add(key as LockablePeg);
      return next;
    });
  }

  /** Apply an edit, re-clamp the line so it stays drawable, and emit. */
  function applyEdit(patch: Partial<LineSpec>) {
    if (!onChange) return;
    if (onEditAttempt && !onEditAttempt()) return;
    const solved = solveLine({ ...(line ?? {}), ...patch });
    // Hard lock (ADR-028): an edit whose solved result moves a locked peg stops
    // at the wall, the edit is dropped, nothing twitches.
    for (const k of locked) {
      const a = pegValue(line, k), b = pegValue(solved, k);
      if (a != null && b != null && Math.abs(a - b) > 1e-6) return;
    }
    onChange(solved);
  }

  /** A quick move (ADR-109): the same "X-Y" presets as score entry, X boards at
   *  the foul line and Y at the arrows, in one tap. `toward` is +1 for a move
   *  inside (toward the middle of the lane, board numbers up) and -1 for out.
   *  The final board is left alone on purpose, so the redraw shows what the new
   *  angle does to the finish rather than carrying it along and saying nothing. */
  function quickMove(laydownBy: number, targetBy: number, toward: 1 | -1) {
    const ld = line?.laydown ?? line?.stance;
    const tg = line?.target;
    if (ld == null && tg == null) return;
    applyEdit({
      ...(ld != null ? { laydown: clamp(ld + laydownBy * toward, 1, 59) } : {}),
      ...(tg != null ? { target: clamp(tg + targetBy * toward, 1, 39) } : {}),
    });
  }

  /** Share the line as a link, with the card as its preview: a line is a thing
   *  to open, not a picture to look at (the layout lab's reasoning, ADR-110). */
  function shareLine() {
    setMovesOpen(false);
    setCard(buildLineCard({
      line: line ?? {},
      hand,
      spare,
      leave,
      pattern: oilPattern,
    }));
  }

  const shareUrl =
    typeof window === "undefined"
      ? ""
      : lineShareUrl(
          {
            line: line ?? {},
            hand,
            ...(spare ? { spare: true } : {}),
            ...(spare && leave?.length ? { leave } : {}),
            // Only a catalog pattern travels: someone's own row is a load table
            // that exists on one device (ADR-110).
            ...(oilPattern?.catalog_id ? { patternCatalogId: oilPattern.catalog_id } : {}),
          },
          shareOrigin(),
          // Always the web app: a link from the store app opens there for
          // whoever it is sent to, or in their app (ADR-159).
          FREE_APP_PATH
        );

  // Spare mode: seed laydown = target = final = the leave's ideal aim board
  // (e.g. 3-3-3 for the 10-pin RH) at the leave's real depth. The focal line then
  // reads as the perfectly-straight reference and the ball path curves to the
  // final. Runs once while the line is still empty; user edits then take over.
  useEffect(() => {
    if (!spare || !onChange || !leave?.length) return;
    if (line?.final_board != null) return; // already seeded or configured
    const aim = spareAimPoint(leave, hand);
    if (!aim) return;
    const board = snapBoard(aim.board);
    // A line that already says where the bowler stands keeps its laydown: the
    // aim board is where the ball should finish, not where it lands. Seeding
    // the laydown from it put a 10-pin line that stands on 31 down on board 3,
    // and the scorer then derived the stance back from that laydown, so merely
    // opening the lane view rewrote the stance to 1.
    const ownLaydown =
      line?.laydown ??
      (line?.slide != null
        ? deriveLaydownFromSlide(line.slide, driftModel)
        : line?.stance != null
          ? deriveLaydown(line.stance, driftModel)
          : undefined);
    onChange(
      solveLine(
        {
          ...(line ?? {}),
          laydown: ownLaydown ?? board,
          target: line?.target ?? board,
          final_board: board,
          final_distance: line?.final_distance ?? Math.round(aim.feet * 10) / 10,
        }
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spare, leave]);

  // Strike mode: derive a missing laydown from the line's foul-line board, a
  // planned stance through the drift model (ADR-030), or an observed slide
  // across the release offset alone (ADR-032). Runs once while laydown is unset;
  // a typed/dragged laydown then owns the value.
  useEffect(() => {
    if (spare || !onChange || !line || line.laydown != null) return;
    if (line.slide != null) {
      onChange({ ...line, laydown: deriveLaydownFromSlide(line.slide, driftModel) });
    } else if (line.stance != null) {
      onChange({ ...line, laydown: deriveLaydown(line.stance, driftModel) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spare, line?.stance, line?.slide, line?.laydown]);

  // Drawn for every caller, editable or not: the oil exit rides this path, and a
  // read-only line still has one. Only the drag handles are gated on onChange.
  const path = line ? buildLinePath(line, hand, spare) : null;

  // Only the patterns that can actually be drawn: a pattern that is just a name
  // would offer a choice that changes nothing on the lane.
  useEffect(() => {
    if (sessionPattern) return;
    let live = true;
    getOilPatterns()
      .then(async (all) => {
        if (!live) return;
        const drawable = all.filter((p) => (p.passes?.length ?? 0) > 0);
        setPickable(drawable);
        if (!seedPatternCatalogId) return;
        // A link names the pattern by its catalog id, never by name: the name is
        // the bowler's to change (ADR-105), so the row you call "Thursday 40ft"
        // and the row they call "Stonehenge" are matched by what they are.
        const mine = drawable.find((p) => p.catalog_id === seedPatternCatalogId);
        if (mine?.id != null) {
          setPickedId(mine.id);
          return;
        }
        const catalog = await getCatalogPatterns();
        const from = catalog.find((p) => p.id === seedPatternCatalogId);
        if (live && from) {
          setLinkPattern({ name: from.name, passes: from.passes, catalog_id: from.id });
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [sessionPattern, seedPatternCatalogId]);

  // The pattern, derived from its load table every time the line moves, so the
  // exit point tracks the drag. Cheap: a handful of passes over 39 boards.
  const zones = useMemo(() => oilZones(oilPattern?.passes), [oilPattern]);
  const stats = useMemo(() => oilStats(oilPattern?.passes), [oilPattern]);
  const hasOil = zones.length > 0;
  const oil: OilOverlay | undefined = useMemo(() => {
    if (!hasOil) return undefined;
    return {
      bands: oilBands(zones),
      peak: peakUnits(zones),
      length: stats.length,
      exit: path ? oilExitPoint(stats.length, path.samples) : null,
    };
  }, [hasOil, zones, stats.length, path]);

  // A pattern coming onto the lane puts the breakpoint at least a little past
  // its length, because the ball hooks after it leaves the oil (ADR-212). Only
  // ever a floor, set when the pattern arrives: dragging the break back up the
  // lane afterwards is a broken-down or dry lane, and is the bowler's to draw.
  function floorBreakToPattern(pattern: OilPattern | null | undefined) {
    if (spare || !line) return;
    const length = oilStats(pattern?.passes).length;
    if (!(length > 0)) return;
    const timing = breakpointFloorTiming(line, length + BREAK_PAST_OIL_FT);
    if (timing) applyEdit(timing);
  }
  function pickPattern(id: number | null) {
    setPickedId(id);
    floorBreakToPattern(pickable.find((p) => p.id === id));
  }
  // A line that has never been timed meets its pattern the same way. A gated
  // surface (a recorded game) is left alone: opening a shot never rewrites it.
  const patternKey = oilPattern ? oilPattern.id ?? oilPattern.catalog_id ?? oilPattern.name : null;
  useEffect(() => {
    if (patternKey == null || onEditAttempt) return;
    if (line?.hook_start_distance != null || line?.breakpoint_distance != null) return;
    floorBreakToPattern(oilPattern);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternKey]);

  // Slide tick (ADR-030): purely decorative, a derived slide-foot marker at the
  // foul line, distinct from the (draggable) laydown peg. Shown on spare lines
  // too: they carry a stance now, and the tick is how the drift step reads.
  // An actual line records the slide directly (ADR-032); a planned one derives it.
  const slideBoard =
    line?.slide ?? (line?.stance != null ? deriveSlide(line.stance, driftModel) : undefined);

  // Re-run the ball animation shortly after the line settles, so an edit visibly
  // replays the shot. Debounced so mid-drag churn doesn't restart it every frame.
  const pathD = path?.d;
  useEffect(() => {
    if (!pathD) return;
    const id = setTimeout(() => setReplayKey((k) => k + 1), 350);
    return () => clearTimeout(id);
  }, [pathD]);

  // Drag on empty background → tilt the camera. A tap (no real tilt movement)
  // replays the shot instead, replaces the old replay button.
  function onPointerDown(e: React.PointerEvent) {
    dragY.current = e.clientY;
    tiltMoved.current = 0;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (dragY.current === null) return;
    const dy = e.clientY - dragY.current;
    dragY.current = e.clientY;
    tiltMoved.current += Math.abs(dy);
    setDeg((d) => clamp(d + dy * 0.4, TOPDOWN_DEG, BOWLER_DEG));
  }
  function onPointerUp() {
    if (dragY.current !== null && tiltMoved.current < 4) setReplayKey((k) => k + 1);
    dragY.current = null;
    setDragging(false);
  }

  // Map a screen point → board / distance and write the change. Uses the SVG's own
  // screen matrix, so it accounts for letterboxing (preserveAspectRatio) and stays
  // exact, dragging always happens flat (the handle snaps top-down on grab).
  function dragPoint(key: string, e: React.PointerEvent) {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const spt = svg.createSVGPoint();
    spt.x = e.clientX;
    spt.y = e.clientY;
    const loc = spt.matrixTransform(ctm.inverse());
    const boardRaw = xToBoard(loc.x, hand);
    const board = snapBoard(boardRaw);
    const feet = yToFeet(loc.y);
    switch (HANDLE_PEG[key]) {
      case "laydown": lastAimEdit.current = "laydown"; applyEdit({ laydown: board }); break;
      case "target": lastAimEdit.current = "target"; applyEdit({ target: board }); break;
      case "breakpoint": {
        // Magnetic projection (ADR-026) + aim cascade (ADR-027): past the timing
        // wall the least-recently-touched aim peg gives way (frozen per gesture).
        const a = projectBreakpoint(line ?? {}, hand, boardRaw, feet, dragGiveWay.current);
        applyEdit({
          hook_start_distance: a.hook_start_distance, hook_length: a.hook_length,
          ...(a.target != null ? { target: snapBoard(a.target) } : {}),
          ...(a.laydown != null ? { laydown: snapBoard(a.laydown) } : {}),
        });
        break;
      }
      case "final":
        // Spare finals sit at a real pin depth, so the vertical drag is meaningful;
        // strike finals stay at the pins (depth locked at the default).
        if (spare) applyEdit({ final_board: board, final_distance: clamp(Math.round(feet * 10) / 10, 55, 63) });
        else applyEdit({ final_board: board });
        break;
    }
  }

  function grabHandle(key: string, e: React.PointerEvent) {
    e.stopPropagation();
    grabbedKey.current = key;
    dragStarted.current = false;
    grabXY.current = { x: e.clientX, y: e.clientY };
    dragGiveWay.current = (() => {
      // Cascade give-way skips locked pegs; both locked ⇒ timing-only drag (ADR-028).
      const pref = lastAimEdit.current === "target" ? "laydown" : "target";
      const alt = pref === "laydown" ? "target" : "laydown";
      if (!locked.has(pref)) return pref;
      if (!locked.has(alt)) return alt;
      return null;
    })();
    setDragging(true);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function moveHandle(key: string, e: React.PointerEvent) {
    if (!e.buttons || grabbedKey.current !== key) return;
    e.stopPropagation();
    const g = grabXY.current;
    // 5px deadzone separates a lock-toggling tap from a drag.
    if (!dragStarted.current && g && Math.hypot(e.clientX - g.x, e.clientY - g.y) < 5) return;
    if (!dragStarted.current) {
      dragStarted.current = true;
      // Snap flat on the FIRST real drag move (not on grab, so a lock tap in
      // bowler view doesn't flip the camera). The linear screen→lane mapping
      // needs the flat CTM, so skip this event and map from the next one.
      // Stays top-down after release, line edits rarely land in one try
      // (ADR-025); the "Bowler view" toggle brings the tilt back.
      if (!isTopDown) {
        setDeg(TOPDOWN_DEG);
        return;
      }
    }
    if (LOCKABLE.has(key) && locked.has(key as LockablePeg)) return; // locked pegs don't drag
    dragPoint(key, e);
  }

  function releaseHandle(key: string) {
    if (grabbedKey.current === key && !dragStarted.current) toggleLock(key);
    grabbedKey.current = null;
    setDragging(false);
  }

  const handles: Array<{ key: string; p: { x: number; y: number } }> = [];
  // The points are drawn for a line that can move, and, with a lock on each,
  // for one that could with Pro (ADR-202).
  const proLockedPoints = !onChange && editLocked === true;
  if (path && (onChange || proLockedPoints)) {
    handles.push({ key: "laydown", p: path.points.laydown });
    handles.push({ key: "target", p: path.points.target });
    // Both modes: the derived breakpoint is draggable (ADR-026).
    if (path.points.breakpoint) handles.push({ key: "breakpoint", p: path.points.breakpoint });
    handles.push({ key: "final", p: path.points.final });
  }

  // Snap targets for the final: the pocket (strike) or the leave's ideal aim (spare).
  const spareAim = spare && leave?.length ? spareAimPoint(leave, hand) : undefined;
  const finalOffPocket = (line?.final_board ?? POCKET_BOARD) !== POCKET_BOARD;
  const finalOffAim =
    spareAim != null &&
    (line?.final_board !== snapBoard(spareAim.board) ||
      (line?.final_distance ?? LANE_FEET) !== Math.round(spareAim.feet * 10) / 10);

  // The peg fields show to move the line, and, locked, where moving it is Pro.
  const showPegs = onChange != null || editLocked === true;
  const pegRow = "flex flex-col gap-2";
  // The fields' column sits away from the line: a right-hander's runs down the
  // right of the lane, so theirs is on the left, and the other way round.
  const pegSide: "left" | "right" = hand === "left" ? "right" : "left";
  const laydownField = (
    <StepperField label="Laydown" value={line?.laydown ?? line?.stance} min={1} max={59} lateral
      locked={locked.has("laydown")}
      onUnlock={() => toggleLock("laydown")}
      onCommit={(v) => { lastAimEdit.current = "laydown"; applyEdit({ laydown: v }); }} />
  );
  const targetField = (
    <StepperField label="Target" value={line?.target} min={1} max={39} lateral
      locked={locked.has("target")}
      onUnlock={() => toggleLock("target")}
      onCommit={(v) => { lastAimEdit.current = "target"; applyEdit({ target: v }); }} />
  );
  const finalField = (
    <StepperField label="Final" value={line?.final_board ?? POCKET_BOARD} min={1} max={39} lateral
      locked={locked.has("final")}
      onUnlock={() => toggleLock("final")}
      onCommit={(v) => applyEdit({ final_board: v })} />
  );
  const pegFields = spare ? (
    <>
      {/* Stance has no peg on the lane, it sits behind the foul line. It only
          appears where stance is the field of record (ADR-032), and the caller
          re-derives laydown from it through the drift model. */}
      {showStance && (
        <StepperField label="Stance" value={line?.stance} min={1} max={59} lateral
          onCommit={(v) => applyEdit({ stance: v })} />
      )}
      {laydownField}
      {targetField}
      {finalField}
      <StepperField label="Final ft" value={line?.final_distance ?? 60} min={55} max={63} step={0.5}
        locked={locked.has("final")}
        onUnlock={() => toggleLock("final")}
        onCommit={(v) => applyEdit({ final_distance: v })} />
      {onChange && finalOffAim && spareAim && !locked.has("final") && (
        <button
          type="button"
          onClick={() =>
            applyEdit({
              final_board: snapBoard(spareAim.board),
              final_distance: Math.round(spareAim.feet * 10) / 10,
            })
          }
          className="self-end rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-caption-2 font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/25"
        >
          Re-aim
        </button>
      )}
    </>
  ) : (
    <>
      {laydownField}
      {targetField}
      {finalField}
      {onChange && finalOffPocket && !locked.has("final") && (
        <button
          type="button"
          onClick={() => applyEdit({ final_board: POCKET_BOARD })}
          className="self-end rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2.5 py-1 text-caption-2 font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-400/25"
        >
          Pocket
        </button>
      )}
    </>
  );

  return (
    // Everything below reads the hand from context (the steppers' arrow
    // direction, the pin grid), so the switch has to reach them rather than only
    // the geometry computed here.
    portal(
    <HandednessContext.Provider value={hand}>
    <div
      ref={overlayRef}
      className={
        pushed
          ? // On the body, above the sheets (a pattern's sheet opens it) and
            // under the Pro page's top layer, sliding in from the trailing edge.
            `type-cap-dense fixed inset-0 z-[70] flex flex-col bg-slate-900 ${exiting ? "" : "animate-push-in"}`
          : "type-cap-dense fixed inset-0 z-[70] flex flex-col bg-slate-900"
      }
      style={
        pushed
          ? {
              transform: exiting ? "translateX(100%)" : undefined,
              transition: `transform ${PUSH_EXIT_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`
            }
          : undefined
      }
      role="dialog"
      aria-modal="true"
      aria-label={`${title} visualizer`}
    >
      <div
        className="relative flex-1 touch-none overflow-hidden"
        style={{ perspective: "1100px" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Floating controls, the header is gone so the lane gets full height. They
            sit below the status bar on a phone that draws under it (the store
            apps, an installed PWA). */}
        <div
          className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Round glass, as every screen's bar controls are (DESIGN-LANGUAGE
              §1b), in the lane's own dark glass. */}
          <IconButton variant="lane" label="Share line" onClick={shareLine}>
            <ShareIosIcon size={18} aria-hidden="true" />
          </IconButton>
          {/* A pushed lane backs out with the chevron on the left, as every
              pushed screen does; a covering one closes with the X. */}
          {!pushed && (
            <IconButton variant="lane" label="Close" onClick={close}>
              <X size={20} aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <div
          // One row, like the pair on the right: stacked, the second sat over
          // the pins in top-down.
          className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex items-center gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {pushed && (
            <IconButton variant="lane" label="Back" onClick={close}>
              <ChevronLeft size={22} strokeWidth={2.5} aria-hidden="true" className="-ml-0.5" />
            </IconButton>
          )}
          {/* A word on a glass capsule as tall as the rounds, as the app's
              Edit is (DESIGN-LANGUAGE §1b). */}
          <button
            type="button"
            onClick={() => setDeg((d) => (d <= 2 ? BOWLER_DEG : TOPDOWN_DEG))}
            className="glass-lane inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold transition-transform active:scale-95 active:opacity-80"
          >
            {isTopDown ? "Bowler view" : "Top-down"}
          </button>
          {(onChange || editLocked === true || hasOil || pickable.length > 0 || handSwitchable) && (
            <IconButton variant="lane" label="Lane options" onClick={() => setOptionsOpen(true)}>
              <SlidersHorizontal size={18} aria-hidden="true" />
            </IconButton>
          )}
        </div>

        <div
          data-role="tilt-stage"
          className="absolute inset-0 mx-auto"
          style={{
            // The lane starts below the status bar and the control row. It used
            // to run up under the clock, where the label above the far peg was
            // cut off by the status bar and the pegs sat behind the buttons.
            // Under the 44pt rounds and their 0.75rem inset.
            top: "calc(env(safe-area-inset-top) + 3.5rem)",
            // Identity when flat; tilts + scales into a bowler's-eye view that
            // recedes to a vanishing point at the pins as the angle increases.
            transform: stageTransform(deg),
            transformOrigin: "50% 50%",
            transition: dragging ? "none" : "transform 0.25s ease-out",
          }}
        >
          <div
            ref={surfaceRef}
            className={`relative mx-auto h-full w-full max-w-[360px] transition-transform ${
              // Top-down, the lane steps aside from the fields' column.
              isTopDown && showPegs ? (pegSide === "left" ? "translate-x-8" : "-translate-x-8") : ""
            }`}
          >
            <LaneSurface
              line={line}
              hand={hand}
              leave={leave}
              oil={oil}
              animate
              animateKey={replayKey}
              slideBoard={slideBoard}
              onPinTap={
                onChange
                  ? (hit) =>
                      applyEdit(
                        spare
                          ? { final_board: snapBoard(hit.board), final_distance: clamp(Math.round(hit.feet * 10) / 10, 55, 63) }
                          : { final_board: snapBoard(hit.board) }
                      )
                  : undefined
              }
            />
            {handles.length > 0 && (
              <svg viewBox={`0 0 ${PLANE_W} ${PLANE_L}`} className="pointer-events-none absolute inset-0 h-full w-full">
                {handles.map((h) => {
                  const derived = h.key === "breakpoint";
                  const isLocked = LOCKABLE.has(h.key) && locked.has(h.key as LockablePeg);
                  return (
                    <g key={h.key}>
                      {/* visible grab ring, the derived breakpoint reads as a derived point (hollow diamond) */}
                      {derived ? (
                        <rect
                          x={h.p.x - 5} y={h.p.y - 5} width="10" height="10"
                          transform={`rotate(45 ${h.p.x} ${h.p.y})`}
                          fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.1"
                        />
                      ) : (
                        <circle
                          cx={h.p.x} cy={h.p.y} r="6" fill="none"
                          stroke={isLocked ? "#fbbf24" : "#fff"}
                          strokeOpacity={isLocked ? 1 : 0.6}
                          strokeWidth={isLocked ? 1.8 : 1.1}
                        />
                      )}
                      {isLocked && (
                        <text x={h.p.x + 7} y={h.p.y - 6} fontSize="6" aria-hidden="true">🔒</text>
                      )}
                      {proLockedPoints && <PointLock x={h.p.x} y={h.p.y} />}
                      {/* large invisible hit target (covers dot + nearby label) */}
                      {!proLockedPoints && (
                      <circle
                        data-role="handle"
                        data-key={h.key}
                        data-locked={isLocked ? "true" : "false"}
                        cx={h.p.x}
                        cy={h.p.y}
                        r="13"
                        fill="transparent"
                        className="pointer-events-auto cursor-grab touch-none"
                        onPointerDown={(e) => grabHandle(h.key, e)}
                        onPointerMove={(e) => moveHandle(h.key, e)}
                        onPointerUp={() => releaseHandle(h.key)}
                        onPointerCancel={() => releaseHandle(h.key)}
                      />
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        {/* The peg fields: a side column in both views, on the side away
            from the line (a right-hander's line runs down the right of the
            lane), on the lane's dark glass so they read over the wood. In
            bowler view they used to be a bar along the foot of the screen,
            where the keyboard that opens to type in them covered them
            (ADR-202). The strike line's three, or the spare line's with its
            final depth (no breakpoint), and how to move the line under them.
            Without Pro they stay where they are, each with a small lock
            (ADR-209), and are the way to it
            (ADR-167). */}
        {showPegs && (
          <div
            className={`glass-lane absolute top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2 rounded-2xl p-2 ${
              pegSide === "left" ? "left-2" : "right-2"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {onChange ? (
              <div className={pegRow}>
                {pegFields}
                {/* The quick moves sit at the end of the fields they move, so
                    the control that shifts the line is where its numbers are,
                    not in a corner away from them (ADR-109). */}
                <div className="relative self-center">
                  <button
                    ref={movesButtonRef}
                    type="button"
                    onClick={() => setMovesOpen((open) => !open)}
                    aria-label="Quick moves"
                    aria-expanded={movesOpen}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-95 ${
                      movesOpen ? "bg-amber-400 text-slate-900" : "glass-lane"
                    }`}
                  >
                    <MoveHorizontal size={16} aria-hidden="true" />
                  </button>
                  {movesOpen && (
                    <QuickMoves
                      hand={hand}
                      onMove={quickMove}
                      anchorRef={movesButtonRef}
                      onClose={() => setMovesOpen(false)}
                      // Opens inward from the side column it sits in.
                      placement={
                        pegSide === "left" ? "absolute bottom-0 left-full ml-2" : "absolute bottom-0 right-full mr-2"
                      }
                    />
                  )}
                </div>
              </div>
            ) : (
              // Unblurred, each number still readable, with a small lock on
              // each field rather than one over the column (ADR-209).
              <ProVeil lane clear bare what="Moving the line">
                <ProBadged.Provider value={true}>
                  <div className={pegRow}>{pegFields}</div>
                </ProBadged.Provider>
              </ProVeil>
            )}
            {/* One instruction to a line, in a column this narrow. */}
            <p className="type-cap-dense max-w-[8.5rem] text-center text-caption-2 leading-snug text-white/70">
              {onChange && <span className="block">Drag a point to move it</span>}
              <span className="block">Drag the lane to tilt</span>
            </p>
          </div>
        )}
      </div>

      {/* With no fields to sit under, the hint keeps its own line. */}
      {!showPegs && <p className="px-4 py-2 text-center text-xs text-white/60">Drag the lane to tilt</p>}

      {optionsOpen && (
        <OptionsSheet
          line={line}
          editable={onChange != null}
          // Without Pro the hook sliders show where they sit, under a lock,
          // rather than being left out (ADR-199).
          proLocked={editLocked === true}
          onChange={applyEdit}
          oilName={hasOil ? oilPattern?.name : undefined}
          oilStats={hasOil ? stats : undefined}
          oilRatio={hasOil ? headlineRatio(oilPattern?.passes) : null}
          pickable={sessionPattern ? [] : pickable}
          pickedId={pickedId}
          onPick={pickPattern}
          onClose={() => setOptionsOpen(false)}
          hand={handSwitchable ? hand : null}
          onPickHand={setHandOverride}
        />
      )}

      <ShareCardDialog
        open={card != null}
        card={card}
        onClose={() => setCard(null)}
        link={{ url: shareUrl, title: `${title}: ${line?.laydown ?? line?.stance ?? "?"} to ${line?.target ?? "?"}` }}
      />
    </div>
    </HandednessContext.Provider>
    )
  );
}

// "X-Y" board move: X boards at the foul line, Y at the arrows. The same three
// the score entry line editor offers, and deliberately the same three: a bowler
// who moves 2-1 between shots is making the move they already know by name, and
// two sets of presets in one app would be two vocabularies for one adjustment.
const MOVE_PRESETS = [
  { label: "1-1", laydown: 1, target: 1 },
  { label: "1.5-1", laydown: 1.5, target: 1 },
  { label: "2-1", laydown: 2, target: 1 },
];

/**
 * The quick-move menu (ADR-109).
 *
 * A temporary layer rather than a row parked on the lane: these are three
 * buttons a bowler reaches for in bursts, and the lane is the thing they are
 * watching while they tap. It closes on a tap anywhere else, on Escape, and on
 * the icon that opened it.
 *
 * Each preset is one full-width button whose tapped half decides the direction,
 * exactly as the score entry presets work (ADR-091), with the arrows carrying
 * IN and OUT for the current hand: the arrow says which way the line goes on
 * screen, the word says which way it goes on the lane, and for a left-hander
 * those are opposite sides.
 */
function QuickMoves({
  hand, onMove, onClose, placement, anchorRef,
}: {
  hand: Handedness;
  onMove: (laydownBy: number, targetBy: number, toward: 1 | -1) => void;
  onClose: () => void;
  /** Where the panel opens from the button that opened it. */
  placement: string;
  /** The button that opened it, whose own tap closes it again. */
  anchorRef: RefObject<HTMLButtonElement | null>;
}) {
  const panelRef = useOverlay<HTMLDivElement>(onClose);
  // A tap anywhere but the panel and its button puts it away, the lane
  // included, without eating the drag that tap may begin. Listened for on the
  // document, in the capture phase, ahead of the lane's own handlers. It was a
  // full-screen backdrop, but inside the lane view's transformed frame
  // `fixed` covered only that frame, so a tap beyond it did nothing, and it lay
  // over the button too: a second tap closed the panel on the way down and the
  // button's click opened it again.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [panelRef, anchorRef, onClose]);
  // Board numbers rise toward the middle of the lane from the bowler's own
  // side, so "in" is always up-board. For a right-hander up-board is screen
  // left; for a left-hander the lane is mirrored and it is screen right.
  const leftIsIn = hand === "right";
  return (
    <>
      <div
        ref={panelRef}
        role="group"
        aria-label="Move presets"
        className={`${placement} z-10 w-44 rounded-xl border border-white/20 bg-slate-900/90 p-2 text-white shadow-lg backdrop-blur`}
      >
        <p className="mb-1.5 px-1 text-caption-2 font-bold uppercase tracking-wide text-white/50">
          Move feet · eyes
        </p>
        <div className="flex flex-col gap-1.5">
          {MOVE_PRESETS.map((p) => (
            <div key={p.label} className="flex items-stretch overflow-hidden rounded-lg border border-white/20 bg-white/10">
              <button
                type="button"
                aria-label={`Move ${p.label} ${leftIsIn ? "in" : "out"}`}
                onClick={() => onMove(p.laydown, p.target, leftIsIn ? 1 : -1)}
                className="flex w-11 shrink-0 items-center justify-center gap-0.5 text-caption-2 font-bold uppercase text-white/70 hover:bg-white/10"
              >
                <ChevronLeft size={12} aria-hidden="true" />
                {leftIsIn ? "In" : "Out"}
              </button>
              <span className="flex flex-1 items-center justify-center text-footnote font-semibold tabular-nums">
                {p.label}
              </span>
              <button
                type="button"
                aria-label={`Move ${p.label} ${leftIsIn ? "out" : "in"}`}
                onClick={() => onMove(p.laydown, p.target, leftIsIn ? -1 : 1)}
                className="flex w-11 shrink-0 items-center justify-center gap-0.5 text-caption-2 font-bold uppercase text-white/70 hover:bg-white/10"
              >
                {leftIsIn ? "Out" : "In"}
                <ChevronRight size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** A lock on a point of the line without Pro (ADR-202): the line's points
 *  would drag with Pro, so each says so where it sits. Drawn in the lane's own
 *  units over the point itself, a dark disc with a padlock, so it reads on the
 *  wood and on the oil alike and stays clear of the point's label above it. */
function PointLock({ x, y }: { x: number; y: number }) {
  return (
    <g data-role="point-lock" transform={`translate(${x} ${y})`} aria-hidden="true">
      <circle r="4.2" fill="#0f172a" fillOpacity="0.85" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.4" />
      <path d="M-1.3 -0.4 V-1.3 a1.3 1.3 0 0 1 2.6 0 V-0.4" fill="none" stroke="#fff" strokeWidth="0.55" />
      <rect x="-1.9" y="-0.5" width="3.8" height="2.7" rx="0.5" fill="#fff" />
    </g>
  );
}

/** Bottom sheet with the hook-shape sliders (shared by strike + spare, ADR-026)
 *  and the oil pattern (ADR-101). The oil is drawn whenever a pattern is
 *  chosen: it had its own switch, a second way to say what clearing the
 *  pattern already says (ADR-199). */
function OptionsSheet({
  line, editable, proLocked, onChange, oilName, oilStats: oil, oilRatio,
  pickable, pickedId, onPick, hand, onPickHand, onClose,
}: {
  line: LineSpec | undefined;
  editable: boolean;
  /** Pro would open the sliders: they show, under a lock, and move nothing. */
  proLocked: boolean;
  onChange: (patch: Partial<LineSpec>) => void;
  oilName: string | undefined;
  oilStats: OilStats | undefined;
  oilRatio: number | null;
  /** Patterns to choose from. Empty when a session already names one. */
  pickable: OilPattern[];
  pickedId: number | null;
  onPick: (id: number | null) => void;
  /** Hand the lane is drawn for, or null where it is not the view's to switch. */
  hand: Handedness | null;
  onPickHand: (hand: Handedness) => void;
  onClose: () => void;
}) {
  // Live bounds mirroring the solver's clamps (laneGeometry hookGeomRaw): the
  // whole track is always draggable, no dead zones to explain.
  const fF = line?.final_distance ?? LANE_FEET;
  const tgtFt = line?.target != null ? arrowFeet(line.target) : ARROWS_FEET;
  const dS = line?.hook_start_distance ?? HOOK_START_FT;
  const startMin = Math.ceil(tgtFt + 1);
  const startMax = Math.floor(fF - 2);
  const lenMax = Math.max(4, Math.floor(fF - 0.5 - dS));
  const sheetRef = useOverlay<HTMLDivElement>(onClose);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        ref={sheetRef}
        // Floats inset with deep corners, as every sheet does (ADR-186).
        className="mx-2 mb-2 rounded-[38px] bg-slate-800 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25" />
        <div className="mb-3 flex items-center">
          <h3 className="flex-1 text-sm font-bold">Lane options</h3>
          {/* Everything here applies as it moves, so leaving is a tick, as on
              every other sheet that keeps what is on screen (DESIGN-LANGUAGE
              §1a). */}
          <IconButton variant="confirm" label="Done" onClick={onClose}>
            <Check size={20} aria-hidden="true" />
          </IconButton>
        </div>
        {hand && (
          <div className="mb-4 border-b border-white/10 pb-3">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/60">
              Bowling hand
            </span>
            {/* Left on the left, so the letters sit where the hands do. */}
            {/* The tab bar's capsule and pill in the lane's dark glass (ADR-189). */}
            <div role="group" aria-label="Bowling hand" className="flex gap-1 rounded-full border border-white/15 bg-white/[0.06] p-1">
              {(["left", "right"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={h === "left" ? "Left" : "Right"}
                  aria-pressed={hand === h}
                  onClick={() => onPickHand(h)}
                  className={`h-9 flex-1 rounded-full text-sm text-white ${
                    hand === h
                      ? "bg-white/[0.16] font-semibold shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_0_1px_rgb(255_255_255/0.12)]"
                      : "font-medium active:opacity-60"
                  }`}
                >
                  {h === "left" ? "L" : "R"}
                </button>
              ))}
            </div>
          </div>
        )}

        {pickable.length > 0 && (
          <div className="mb-4 border-b border-white/10 pb-3">
            <label
              htmlFor="visualizer-pattern"
              className="mb-1 block text-xs font-bold uppercase tracking-wide text-white/60"
            >
              Oil pattern
            </label>
            {/* By name, which a pattern's own is unique to: the field types
                names, and the id is looked up from the one chosen. */}
            <ChoiceInput
              id="visualizer-pattern"
              value={pickable.find((p) => p.id === pickedId)?.name ?? ""}
              onChange={(name) => onPick(pickable.find((p) => p.name === name)?.id ?? null)}
              options={pickable.map((p) => ({ value: p.name, label: patternLabel(p) }))}
              placeholder="No pattern"
              clearLabel="Clear oil pattern"
              tone="dark"
              className="h-11 w-full rounded-lg border border-white/20 bg-slate-900 px-3 text-sm text-white placeholder:text-white/40"
            />
          </div>
        )}

        {oil && (
          <div className="mb-4 border-b border-white/10 pb-3">
            <p className="text-xs tabular-nums text-white/60">
              {oilName} · {Math.round(oil.length)} ft · {formatFixed(oil.volumeMl, 2)} mL
              {oilRatio != null ? ` · ${formatFixed(oilRatio, 1)}:1` : ""}
            </p>
          </div>
        )}
        {(editable || proLocked) && (
          <>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-white/60">Hook shape</h4>
            {/* Unblurred, with a lock on each slider's thumb rather than one
                over the pair (ADR-209). */}
            <ProVeil lane clear bare what="Changing the hook shape">
              <Slider
                label="Hook start" suffix="ft" min={startMin} max={startMax} step={1}
                value={clamp(dS, startMin, startMax)}
                locked={proLocked}
                // Inert under the veil, and moving nothing past it (ADR-190).
                onChange={(v) => editable && onChange({ hook_start_distance: v })}
              />
              <Slider
                label="Hook length" suffix="ft" min={4} max={lenMax} step={1}
                value={clamp(line?.hook_length ?? HOOK_LENGTH_FT, 4, lenMax)}
                locked={proLocked}
                onChange={(v) => editable && onChange({ hook_length: v })}
              />
            </ProVeil>
          </>
        )}
      </div>
    </div>
  );
}

/** Set around fields that are out of reach without Pro, so each draws its own
 *  small lock rather than the column wearing one (ADR-209). */
const ProBadged = createContext(false);

function Slider({
  label, suffix, min, max, step, value, onChange, locked = false,
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  /** Out of reach without Pro: the thumb is drawn as a lock, where it sits. */
  locked?: boolean;
}) {
  return (
    <label className="mb-3 block py-1">
      <div className="mb-1 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-white/70">
        <span>{label}</span>
        <span className="tabular-nums text-white/90">{Math.round(value)} {suffix}</span>
      </div>
      {locked ? (
        // The platform thumb cannot be hidden, and its size differs between
        // browsers, so a locked slider draws its own track with a 20px thumb
        // left invisible, and the lock sits exactly where that thumb is.
        <div className="relative">
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="block h-8 w-full appearance-none bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:opacity-0 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/25 [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-white/25 [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:opacity-0"
          />
          <span
            data-slider-lock=""
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-900 bg-accent-fill text-accent-on-fill shadow"
            style={{ left: `calc(${Math.min(1, Math.max(0, (value - min) / (max - min || 1)))} * (100% - 20px) - 2px)` }}
          >
            <Lock size={11} aria-hidden="true" />
          </span>
        </div>
      ) : (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 w-full cursor-pointer accent-accent-fill"
        />
      )}
      <div className="flex justify-between text-caption-2 tabular-nums text-white/40">
        <span>{min} {suffix}</span>
        <span>{max} {suffix}</span>
      </div>
    </label>
  );
}

/** Numeric field with steppers. Typing commits on blur/Enter (a raw
 *  clamp-per-keystroke made the field untypeable), the steppers commit immediately.
 *  `lateral` board fields use screen-direction ◀/▶ (hand-mirrored, matching the
 *  score-entry adjusters); depth fields keep −/+. */
function StepperField({
  label, value, min, max, step = 0.5, lateral = false, locked = false, onUnlock, onCommit,
}: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  lateral?: boolean;
  /** Peg is pinned: the controls are inert and a lock glyph shows. */
  locked?: boolean;
  /** Tap anywhere on a locked field to release it, the number is the handle. */
  onUnlock?: () => void;
  onCommit: (v: number) => void;
}) {
  const hand = useHandedness();
  const proBadged = useContext(ProBadged);
  const dir = hand === "right" ? 1 : -1; // ◀ raises the board for a right-hander
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value != null ? String(value) : "");
  const commit = () => {
    if (draft !== null && draft !== "") onCommit(clamp(Number(draft), min, max));
    setDraft(null);
  };
  const nudge = (d: number) => onCommit(clamp((value ?? min) + d, min, max));
  const leftDelta = lateral ? step * dir : -step;
  return (
    // Capped as a dense readout over the lane, and as wide as its type, so a
    // large text size neither cuts "17.5" to "17." nor buries the lane.
    <div
      className={`type-cap-dense flex w-[calc(4.75rem*var(--type-scale))] flex-col gap-0.5 text-center text-caption-2 font-semibold uppercase tracking-wide text-white/70 ${locked ? "opacity-60" : ""}`}
      // A locked field is its own unlock button: tapping the number (or either
      // arrow) releases the peg rather than doing nothing.
      onPointerDown={locked ? () => onUnlock?.() : undefined}
    >
      <span className="flex items-center justify-center gap-1">
        {locked && <Lock size={9} aria-hidden="true" />}
        {label}
      </span>
      <div className="relative">
      {/* Out of reach without Pro: a small lock on the box, the number still
          read in full under it (ADR-209). */}
      {proBadged && (
        <span
          data-field-lock=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-slate-900 bg-accent-fill text-accent-on-fill"
        >
          <Lock size={8} aria-hidden="true" />
        </span>
      )}
      <div
        className={`flex h-9 items-stretch overflow-hidden rounded-md border bg-white/10 ${
          locked ? "border-dashed border-white/40" : "border-white/20"
        }`}
      >
        <button
          type="button"
          aria-label={locked ? `Unlock ${label}` : lateral ? `${label} left` : `${label} down`}
          onClick={() => (locked ? onUnlock?.() : nudge(leftDelta))}
          className="flex w-5 shrink-0 items-center justify-center text-white/70 hover:bg-white/10"
        >
          {lateral ? <ChevronLeft size={11} aria-hidden="true" /> : <Minus size={11} aria-hidden="true" />}
        </button>
        <input
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={shown}
          readOnly={locked}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => { if (locked) { onUnlock?.(); return; } e.target.select(); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur(); } }}
          className="min-w-0 flex-1 bg-transparent text-center text-footnote font-medium tabular-nums text-white outline-none"
        />
        <button
          type="button"
          aria-label={locked ? `Unlock ${label}` : lateral ? `${label} right` : `${label} up`}
          onClick={() => (locked ? onUnlock?.() : nudge(-leftDelta))}
          className="flex w-5 shrink-0 items-center justify-center text-white/70 hover:bg-white/10"
        >
          {lateral ? <ChevronRight size={11} aria-hidden="true" /> : <Plus size={11} aria-hidden="true" />}
        </button>
      </div>
      </div>
    </div>
  );
}
