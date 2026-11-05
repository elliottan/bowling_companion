import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { t } from "@lingui/core/macro";
import type { LiveActivityFrame, LiveActivityState } from "../lib/liveActivity";
import { ISLAND_ACCENTS } from "../lib/liveActivitySample";
import type { PaletteId } from "../lib/palette";
import { CREAM, PIN_PATH } from "./ui/ProMark";

/**
 * What the Live Activity looks like, for its page in Settings (ADR-244): the
 * Lock Screen, the Dynamic Island and the Apple Watch's Smart Stack.
 *
 * The phone draws the real thing in SwiftUI (`ios/App/HeadpinLiveActivity`),
 * which a web view cannot show, so these follow those views point for point:
 * the same rows, sizes and colors, read from the same payload. The payload is
 * built by `buildLiveActivityState` from a sample game (`liveActivitySample`), so the marks and
 * running totals are the scorecard's own, as on the phone. Change a layout in
 * `HeadpinGameViews.swift` or `HeadpinLiveActivityBundle.swift` and change it
 * here too.
 *
 * Each picture is decoration: the card around it says the same in words, so
 * each is hidden from screen readers and out of reach of a tap.
 */

/** The colors one surface draws with, as CSS colors (`HeadpinPalette`). */
interface Tone {
  ink: string;
  secondary: string;
  edge: string;
  accent: string;
  accentSoft: string;
  accentFill: string;
  background: string;
}

/** The Lock Screen banner is in the app's own theme and palette, which are the
 *  page's tokens (`HeadpinPalette.lockScreen`). */
const LOCK_SCREEN: Tone = {
  ink: "rgb(var(--color-ink))",
  secondary: "rgb(var(--color-ink-secondary))",
  edge: "rgb(var(--color-edge-strong))",
  accent: "rgb(var(--color-accent))",
  accentSoft: "rgb(var(--color-accent-soft))",
  accentFill: "rgb(var(--color-accent-fill))",
  background: "rgb(var(--color-surface))"
};

function islandTone(palette: PaletteId): Tone {
  const { accent, fill } = ISLAND_ACCENTS[palette];
  return {
    ink: "#fff",
    secondary: "rgb(255 255 255 / 0.62)",
    edge: "rgb(255 255 255 / 0.28)",
    accent: `rgb(${accent})`,
    accentSoft: `rgb(${accent} / 0.2)`,
    accentFill: `rgb(${fill})`,
    background: "#000"
  };
}

/** SwiftUI's rounded design, for the totals. */
const ROUNDED: CSSProperties = { fontFamily: "ui-rounded, system-ui, -apple-system, sans-serif" };

/** The pin's red neck stripes, as on the app icon (`HeadpinPin`). */
const PIN_RED = "#c8102e";

/** A picture of the phone, never a working one. The phone's glass, the island
 *  and the watch are black whatever the app's theme, as the hardware is
 *  (DESIGN-LANGUAGE §3, the exception for a physical object). */
function Picture({ className = "", style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // React 18 has no `inert` prop.
  useEffect(() => ref.current?.setAttribute("inert", ""), []);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      // Drawn at the phone's own sizes, which do not follow the app's text size.
      className={`type-cap-fixed pointer-events-none select-none ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces shared by the three layouts
// ---------------------------------------------------------------------------

function PinGlyph({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="24 5 52 146" className={className} style={style} aria-hidden="true">
      <path d={PIN_PATH} fill={CREAM} />
      <rect x="41" y="44" width="18" height="5" rx="2.5" fill={PIN_RED} />
      <rect x="41" y="53" width="18" height="5" rx="2.5" fill={PIN_RED} />
    </svg>
  );
}

/** The app's mark: the cream pin on the accent (`HeadpinMark`). */
function Mark({ size, fill }: { size: number; fill: string }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.24, background: fill }}
    >
      <PinGlyph style={{ width: size * 0.5, height: size * 0.66 }} />
    </span>
  );
}

/** Font classes for the marks' point sizes (`markSize`). */
const MARK_CLASS: Record<number, string> = { 11: "text-caption-2", 12: "text-caption", 13: "text-footnote" };

/** One frame: its marks over its running total (`FrameCellView`). */
function FrameCell({
  number,
  frame: cell,
  current,
  tone,
  showsNumber = false,
  markSize
}: {
  number: number;
  frame: LiveActivityFrame;
  current: boolean;
  tone: Tone;
  showsNumber?: boolean;
  markSize: 11 | 12 | 13;
}) {
  const row = markSize + 6;
  return (
    <div
      className="min-w-0 flex-1 overflow-hidden tabular-nums"
      style={{
        borderRadius: 5,
        border: `${current ? 1.5 : 0.5}px solid ${current ? tone.accent : tone.edge}`,
        background: current ? tone.accentSoft : "transparent"
      }}
    >
      {showsNumber && (
        <div className="text-center text-caption-2 font-medium" style={{ color: tone.secondary, lineHeight: "13px" }}>
          {number}
        </div>
      )}
      <div className={`flex ${MARK_CLASS[markSize]} font-semibold`} style={{ height: row, color: tone.ink }}>
        {cell.marks.map((mark, i) => (
          <span
            key={i}
            className="flex min-w-0 flex-1 items-center justify-center"
            style={i > 0 ? { borderLeft: `0.5px solid ${tone.edge}` } : undefined}
          >
            {mark}
          </span>
        ))}
      </div>
      <div style={{ height: 0.5, background: tone.edge }} />
      <div
        className={`flex items-center justify-center ${MARK_CLASS[markSize]} font-bold`}
        style={{ height: row, color: tone.ink }}
      >
        {cell.score}
      </div>
    </div>
  );
}

/** The last few frames up to the one being bowled (`RecentFramesView`). */
function RecentFrames({ state, tone, count, markSize }: { state: LiveActivityState; tone: Tone; count: number; markSize: 12 | 13 }) {
  const upTo = Math.min(state.frames.length, state.done ? 10 : Math.max(1, state.frame));
  const from = Math.max(0, upTo - count);
  return (
    <div className="flex gap-1">
      {state.frames.slice(from, upTo).map((cell, i) => {
        const number = from + i + 1;
        return (
          <FrameCell
            key={number}
            number={number}
            frame={cell}
            current={!state.done && number === state.frame}
            tone={tone}
            showsNumber
            markSize={markSize}
          />
        );
      })}
    </div>
  );
}

function frameLine(state: LiveActivityState): string {
  const frameNumber = state.frame;
  return state.done
    ? t({ message: "Final score", comment: "On the Live Activity: the game is over and this is its score" })
    : t({ message: `Frame ${frameNumber}`, comment: "On the Live Activity: the frame being bowled, 1 to 10" });
}

function maxLine(max: number): string {
  return t({ message: `Max ${max}`, comment: "On the Live Activity: the highest score the game can still finish on" });
}

function gameLine(state: LiveActivityState): string {
  return t`Game ${{ gameNumber: state.game }}`;
}

/** A phone's wallpaper, behind the Lock Screen and the island. */
const WALLPAPER: CSSProperties = {
  background: "linear-gradient(165deg, #42557a 0%, #222c42 55%, #10141f 100%)"
};

// ---------------------------------------------------------------------------
// The Lock Screen
// ---------------------------------------------------------------------------

/** The banner itself (`LockScreenGameView`). */
function LockScreenBanner({ state }: { state: LiveActivityState }) {
  const tone = LOCK_SCREEN;
  return (
    <div className="space-y-2 px-3.5 py-3 shadow-lg" style={{ background: tone.background, borderRadius: 22 }}>
      <div className="flex items-center gap-2">
        <Mark size={28} fill={tone.accentFill} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-subhead font-semibold" style={{ color: tone.ink }}>
            {state.label}
          </div>
          {state.location && (
            <div className="truncate text-caption" style={{ color: tone.secondary }}>
              {state.location}
            </div>
          )}
        </div>
        <div className="shrink-0 text-footnote font-semibold" style={{ color: tone.accent }}>
          {gameLine(state)}
        </div>
      </div>
      <div className="flex items-baseline gap-2.5">
        <div className="flex-1 text-large-title font-bold leading-none tabular-nums" style={{ ...ROUNDED, color: tone.ink }}>
          {state.total}
        </div>
        <div className="text-right">
          <div className="text-footnote font-semibold" style={{ color: tone.ink }}>
            {frameLine(state)}
          </div>
          {state.max !== null && (
            <div className="text-caption tabular-nums" style={{ color: tone.secondary }}>
              {maxLine(state.max)}
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-0.5">
        {state.frames.map((cell, i) => (
          <FrameCell
            key={i}
            number={i + 1}
            frame={cell}
            current={!state.done && i + 1 === state.frame}
            tone={tone}
            markSize={11}
          />
        ))}
      </div>
    </div>
  );
}

/** The banner on a locked phone, under the clock. */
export function LockScreenPreview({ state }: { state: LiveActivityState }) {
  return (
    <Picture className="overflow-hidden rounded-[28px] px-3 pb-4 pt-5" style={WALLPAPER}>
      {/* The clock, drawn so it keeps the Lock Screen's size beside the banner. */}
      <svg viewBox="0 0 200 64" className="mx-auto mb-3 block h-16 w-[200px]" aria-hidden="true">
        <text x="100" y="56" textAnchor="middle" fill="#fff" fontSize="64" fontWeight="300" style={ROUNDED}>
          9:41
        </text>
      </svg>
      <LockScreenBanner state={state} />
    </Picture>
  );
}

// ---------------------------------------------------------------------------
// The Dynamic Island
// ---------------------------------------------------------------------------

/** The island while another app is open: the pin and the total either side of
 *  the camera (compact leading and trailing). */
function CompactIsland({ state, tone }: { state: LiveActivityState; tone: Tone }) {
  return (
    <div className="mx-auto flex h-[37px] w-[230px] items-center justify-between rounded-full bg-black pl-3.5 pr-4">
      <PinGlyph style={{ width: 10, height: 20 }} />
      <span className="text-subhead font-bold tabular-nums" style={{ ...ROUNDED, color: tone.ink }}>
        {state.total}
      </span>
    </div>
  );
}

/** Held open: the game, the frame and max, the total, and the last four frames. */
function ExpandedIsland({ state, tone }: { state: LiveActivityState; tone: Tone }) {
  return (
    <div className="space-y-2.5 bg-black px-5 pb-4 pt-3.5" style={{ borderRadius: 44 }}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5">
          <Mark size={24} fill={tone.accentFill} />
          <span className="text-footnote font-semibold" style={{ color: tone.ink }}>
            {gameLine(state)}
          </span>
        </div>
        <div className="text-center leading-tight">
          <div className="text-footnote font-semibold" style={{ color: tone.accent }}>
            {frameLine(state)}
          </div>
          {state.max !== null && (
            <div className="text-caption-2 tabular-nums" style={{ color: tone.secondary }}>
              {maxLine(state.max)}
            </div>
          )}
        </div>
        <div className="flex-1 text-right text-title-1 font-bold leading-none tabular-nums" style={{ ...ROUNDED, color: tone.ink }}>
          {state.total}
        </div>
      </div>
      <RecentFrames state={state} tone={tone} count={4} markSize={13} />
    </div>
  );
}

/** Both forms of the island, at the top of a phone's screen. */
export function IslandPreview({ state }: { state: LiveActivityState }) {
  const tone = islandTone(state.palette);
  return (
    <Picture className="space-y-3 overflow-hidden rounded-[28px] px-2.5 pb-3 pt-2.5" style={WALLPAPER}>
      <CompactIsland state={state} tone={tone} />
      <ExpandedIsland state={state} tone={tone} />
    </Picture>
  );
}

// ---------------------------------------------------------------------------
// The Apple Watch
// ---------------------------------------------------------------------------

/** The Smart Stack's card (`WatchGameView`): always dark, in the island's colors. */
function WatchCard({ state, tone }: { state: LiveActivityState; tone: Tone }) {
  return (
    <div className="space-y-1 px-2.5 py-2" style={{ background: "rgb(255 255 255 / 0.1)", borderRadius: 18 }}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="truncate text-footnote font-semibold" style={{ color: tone.accent }}>
          {gameLine(state)}
        </span>
        <span className="truncate text-footnote font-medium" style={{ color: tone.secondary }}>
          {frameLine(state)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-title-1 font-bold leading-none tabular-nums" style={{ ...ROUNDED, color: tone.ink }}>
          {state.total}
        </span>
        {state.max !== null && (
          <span className="text-caption tabular-nums" style={{ color: tone.secondary }}>
            {maxLine(state.max)}
          </span>
        )}
      </div>
      <RecentFrames state={state} tone={tone} count={3} markSize={12} />
    </div>
  );
}

/** The card in the Smart Stack, on a watch. */
export function WatchPreview({ state }: { state: LiveActivityState }) {
  const tone = islandTone(state.palette);
  return (
    <Picture className="flex justify-center py-1">
      <div className="relative">
        {/* The case, and the crown on its side. */}
        <div
          className="w-[208px] p-2"
          style={{ background: "linear-gradient(160deg, #4a4f57, #1d2025)", borderRadius: 52 }}
        >
          <div className="bg-black px-3 pb-4 pt-3" style={{ borderRadius: 44 }}>
            <div className="mb-2 pr-1 text-right text-subhead font-semibold tabular-nums text-white">10:09</div>
            <WatchCard state={state} tone={tone} />
          </div>
        </div>
        <div
          className="absolute -right-1.5 top-[54px] h-11 w-2.5 rounded-r-md"
          style={{ background: "linear-gradient(90deg, #3a3e45, #6b7079)" }}
        />
      </div>
    </Picture>
  );
}
