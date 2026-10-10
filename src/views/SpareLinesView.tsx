import { ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { BallPickerSheet } from "../components/BallPickerSheet";
import { ErrorBanner } from "../components/ErrorBanner";
import { MiniPins } from "../components/MiniPins";
import { SpareDetailsSheet } from "../components/SpareDetailsSheet";
import { IconButton } from "../components/ui/IconButton";
import { PushScreen } from "../components/PushScreen";
import { useDriftModel } from "../lib/driftModelContext";
import { useHandedness } from "../lib/handednessContext";
import { deriveLaydown, deriveSlide, type DriftModel } from "../lib/driftModel";
import { ensureDefaultSpareLines, getBalls, getSpareLinesAll, setSpareBall } from "../services/ballRepository";
import { getSessionHistory, getSetting, setSetting } from "../services/bowlingRepository";
import { calculateCommonLeaves, type LeaveStats } from "../lib/stats";
import {
  askKey,
  describeMove,
  leaveKey,
  lineRows,
  matchesFilters,
  matchesPins,
  mostLeftWithoutLine,
  parseSnoozes,
  snooze,
  snoozedKeys,
  spareLinesShown,
  suggestLineCopies,
  suggestionKey,
  type LineRow,
  type LineRowTile,
  type LineSuggestion,
} from "../lib/spareLines";
import { TAP_TARGET_44 } from "../components/ui/Chip";
import { SpareFilterBar } from "../components/SpareFilterBar";
import { useSpareFilters } from "../lib/useSpareFilters";
import { formatLeave } from "../lib/pins";
import { GROUP_HEADING } from "../components/ui/typography";
import type { LineSpec, PinNumber, SpareLine } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { EmptyState } from "../components/ui/EmptyState";
import { Button } from "../components/ui/Button";
import { SpareLineIcon } from "../components/icons";

/** Slide → laydown, derived from the stance (ADR-030). Read-only, so it sits
 *  under the entered boards in a lighter weight. */
function DerivedChain({ line, model, inline = false }: { line: LineSpec; model: DriftModel; inline?: boolean }) {
  const slide = line.stance != null ? deriveSlide(line.stance, model) : undefined;
  const laydown = line.laydown ?? (line.stance != null ? deriveLaydown(line.stance, model) : undefined);
  if (slide == null && laydown == null) return null;
  return (
    <div className={`${inline ? "" : "mt-0.5 "}text-[11px] font-semibold uppercase tracking-tight text-ink-secondary tabular-nums`}>
      {slide != null && `Slide ${slide}`}
      {slide != null && laydown != null && <span aria-hidden="true" className="text-ink-tertiary"> → </span>}
      {laydown != null && `Laydown ${laydown}`}
    </div>
  );
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_LINES: SpareLine[] = [];
const NO_LEAVES: LeaveStats[] = [];

/** What the details sheet is showing: a leave, or a new one being added. */
type Opened = {
  pins: PinNumber[];
  edit: boolean;
  /** A line offered to start from, still editable. */
  prefill?: Pick<SpareLine, "line" | "strike_offset">;
};

/** Suggestions turned down for good, kept from before they were snoozed. */
const DISMISSED_KEY = "spareLineSuggestionsDismissed";
/** Hints turned down for now, and until when (`lib/spareLines`). */
const SNOOZE_KEY = "spareLineHintSnoozes";

function parseDismissed(raw: string | undefined): Set<string> {
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

/** One hint at the top: a leave, what to do about it, Add, and a way to wave it
 *  off. Both asks use it, so they behave and look the same. */
function Hint({
  pins,
  children,
  onAdd,
  onDismiss,
  dismissLabel
}: {
  pins: PinNumber[];
  children: React.ReactNode;
  onAdd: () => void;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3 shadow-sm">
      <MiniPins standing={pins} size="sm" />
      <p className="min-w-0 flex-1 text-xs text-ink-secondary">{children}</p>
      <button
        type="button"
        onClick={onAdd}
        className={`relative shrink-0 text-xs font-semibold text-accent active:opacity-60 ${TAP_TARGET_44}`}
      >
        Add
      </button>
      <IconButton compact label={dismissLabel} onClick={onDismiss}>
        <X size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

/** The tile for one leave on a line's row: its deck, its name, how often it was
 *  left, and how often it was made. */
function LeaveTile({ tile, onOpen }: { tile: LineRowTile; onOpen: (sl: SpareLine) => void }) {
  const { spareLine: sl } = tile;
  return (
    <li className="shrink-0 snap-start">
      <button
        type="button"
        onClick={() => onOpen(sl)}
        aria-label={`Open spare line for pins ${sl.pins.join(", ")}`}
        className="flex w-24 select-none flex-col items-center gap-1.5 rounded-lg border border-edge bg-surface p-2.5 text-center shadow-sm active:opacity-70"
      >
        <MiniPins standing={sl.pins} size="md" />
        <span className="text-[11px] font-semibold tabular-nums text-ink">{formatLeave(sl.pins)}</span>
        <span className="text-[11px] tabular-nums text-ink-secondary">
          {tile.attempts}×{tile.conversionPct != null ? ` · ${tile.conversionPct}%` : ""}
        </span>
      </button>
    </li>
  );
}

export function SpareLinesView({ onBack }: { onBack: () => void }) {
  // Seeding is a write, and a live query observes inside a readonly
  // transaction, so it cannot live in one. Fire it once; the query below picks
  // the rows up on its own when they land.
  useEffect(() => {
    void ensureDefaultSpareLines();
  }, []);

  // Live: saving and deleting land through Dexie, so the list follows them
  // without a refresh call at each site.
  const live = useLiveQuery(() => getSpareLinesAll());
  // Every leave across every session: the record on each tile, and what the
  // hints rank by.
  const leaves = useLiveQuery(async () => calculateCommonLeaves(await getSessionHistory())) ?? NO_LEAVES;
  const balls = useLiveQuery(() => getBalls()) ?? [];
  // Pocket leaves are shot on the strike line and are never listed (ADR-123).
  // A row saved for one stays stored, out of sight.
  const shown = useMemo(() => spareLinesShown(live ?? NO_LINES), [live]);
  const isLoading = live === undefined;
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<Opened | null>(null);
  const [pickingBall, setPickingBall] = useState(false);

  // Shared with the All leaves sheet on Stats, and kept for the app run
  // (ADR-128).
  const spareFilters = useSpareFilters();
  const { filters, pins: pinsPicked, exact: exactPins } = spareFilters;
  const [pinFilterOpen, setPinFilterOpen] = useState(false);

  const hintState = useLiveQuery(async () => ({
    dismissed: await getSetting(DISMISSED_KEY),
    snoozes: await getSetting(SNOOZE_KEY)
  }));
  const dismissed = parseDismissed(hintState?.dismissed);
  const snoozes = parseSnoozes(hintState?.snoozes);
  const snoozed = snoozedKeys(snoozes, new Date());

  // At most one of each ask on screen: a line to copy, then a leave to write.
  const skip = new Set([...dismissed, ...snoozed]);
  const suggestion: LineSuggestion | undefined =
    isLoading || !hintState ? undefined : suggestLineCopies(leaves, shown, skip)[0];
  const mostLeft = isLoading || !hintState ? undefined : mostLeftWithoutLine(leaves, shown, snoozed);
  const ask =
    mostLeft && (!suggestion || leaveKey(mostLeft.pins) !== leaveKey(suggestion.pins))
      ? mostLeft
      : undefined;

  const spareBall = balls.find((b) => b.is_spare_ball);

  /** Turn a hint down for a while, so it is not asked again straight away. */
  async function snoozeHint(key: string) {
    await setSetting(SNOOZE_KEY, JSON.stringify(snooze(snoozes, key, new Date())));
  }

  async function chooseSpareBall(id: number | undefined) {
    setError("");
    try {
      await setSpareBall(id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set the spare ball.");
    }
  }

  const rows = useMemo(() => {
    const kept = shown.filter(
      (sl) => matchesFilters(sl, filters) && matchesPins(sl.pins, pinsPicked, exactPins)
    );
    return lineRows(kept, leaves);
  }, [shown, filters, pinsPicked, exactPins, leaves]);

  return (
    // A pushed screen, not a tab, since Stats took the tab slot (ADR-057). The
    // add action moves with it: a push has a nav bar, and that bar carries the
    // one trailing action instead of a Fab (DESIGN-LANGUAGE §7b).
    <PushScreen
      title="Spare lines"
      onBack={onBack}
      active={opened === null && !pickingBall && !pinFilterOpen}
      trailing={
        <IconButton
          label="Add spare line"
          variant="round"
          onClick={() => setOpened({ pins: [], edit: true })}
        >
          <Plus size={20} aria-hidden="true" />
        </IconButton>
      }
    >
    <section className="mx-auto w-full max-w-3xl space-y-4 px-3 pb-8 pt-3 sm:px-6">
      {error && (
        <ErrorBanner>{error}</ErrorBanner>
      )}

      {opened && (
        <SpareDetailsSheet
          pins={opened.pins}
          leaves={leaves}
          edit={opened.edit}
          prefill={opened.prefill}
          onClose={() => setOpened(null)}
        />
      )}

      {/* The one ball the scorer picks for a spare shot. It lives here, with
          the lines it throws, and not on each ball in the arsenal. */}
      <button
        type="button"
        onClick={() => setPickingBall(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-edge bg-surface p-3 text-left shadow-sm active:bg-surface-muted"
      >
        <div className="h-10 w-10 shrink-0">
          {spareBall?.catalog_snapshot ? (
            <CatalogBallImage
              src={spareBall.catalog_snapshot.imageThumb}
              alt={spareBall.name}
              brand={spareBall.catalog_snapshot.brand as Manufacturer}
              size="thumb"
            />
          ) : (
            <div className="h-full w-full rounded-full bg-edge" aria-hidden="true" />
          )}
        </div>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-accent">Spare ball</span>
          <span className="block truncate text-sm font-semibold text-ink">
            {spareBall ? spareBall.name : "Choose one"}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-ink-tertiary" aria-hidden="true" />
      </button>

      {pickingBall && (
        <BallPickerSheet
          balls={balls}
          ballId={spareBall?.id}
          onSelect={(id) => void chooseSpareBall(id)}
          onClose={() => setPickingBall(false)}
        />
      )}

      {/* A leave with no line that is the same shot as one with a line. Add
          opens that leave with the line filled in, to change before saving. */}
      {suggestion && (
        <Hint
          pins={suggestion.pins}
          onAdd={() =>
            setOpened({
              pins: suggestion.pins,
              edit: true,
              prefill: { line: suggestion.from.line, strike_offset: suggestion.from.strike_offset }
            })
          }
          onDismiss={() => void snoozeHint(suggestionKey(suggestion))}
          dismissLabel="Not the same shot"
        >
          <span className="font-semibold text-ink">{formatLeave(suggestion.pins)}</span> is likely the
          same shot as <span className="font-semibold text-ink">{formatLeave(suggestion.from.pins)}</span>.
          Use its line?
        </Hint>
      )}

      {/* The one leave worth writing down next: the one left most often that
          has no line. It moves on to the next as soon as this one has one, or
          is turned down. */}
      {ask && (
        <Hint
          pins={ask.pins}
          onAdd={() => setOpened({ pins: ask.pins, edit: true })}
          onDismiss={() => void snoozeHint(askKey(ask.pins))}
          dismissLabel="Not now"
        >
          You leave <span className="font-semibold text-ink">{formatLeave(ask.pins)}</span> most often (
          {ask.attempts} {ask.attempts === 1 ? "time" : "times"}) and have no line for it.
        </Hint>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={SpareLineIcon}
          title="No spare lines yet"
          description="Save where you stand and where you aim for a leave, and it is there the next time you face it."
        >
          <Button variant="primary" onClick={() => setOpened({ pins: [], edit: true })}>
            <Plus size={18} aria-hidden="true" />
            Add spare line
          </Button>
        </EmptyState>
      ) : (
        <>
        <SpareFilterBar
          state={spareFilters}
          label="Filter spare lines"
          pinsOpen={pinFilterOpen}
          onPinsOpenChange={setPinFilterOpen}
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={SpareLineIcon}
            title="Nothing matches"
            description="None of your saved leaves fit these filters."
          >
            <Button
              variant="ghost"
              onClick={spareFilters.clear}
            >
              Clear filters
            </Button>
          </EmptyState>
        ) : (
          // One row to a line, so the line is what you read first and every
          // leave you answer with it sits beside it. Most-left leaves lead.
          rows.map((row) => (
            <section key={row.key} aria-label={rowLabel(row)}>
              <div className="mb-1 px-1">
                {row.line ? (
                  <RowHeading line={row.line} kind={row.kind} />
                ) : (
                  <h2 className={GROUP_HEADING}>No line yet</h2>
                )}
              </div>
              <ul className="-mx-3 flex snap-x scroll-pl-3 gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:scroll-pl-0 sm:px-0">
                {row.tiles.map((tile) => (
                  <LeaveTile
                    key={tile.spareLine.id}
                    tile={tile}
                    onOpen={(line) => setOpened({ pins: line.pins, edit: false })}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
        </>
      )}
    </section>
    </PushScreen>
  );
}

/** The grey names on a row's heading, under the white values. */
const LABEL = "text-[10px] font-semibold uppercase tracking-tight text-ink-secondary";

/** A row's spoken name: the boards it stands on and aims at, or its move. */
function rowLabel(row: LineRow): string {
  if (!row.line) return "No line yet";
  const boards = row.line.line;
  if (row.kind === "line" && boards) {
    return `Stance ${boards.stance ?? "none"}, target ${boards.target ?? "none"}`;
  }
  return "Strike ball";
}

/** What a row is about: the spare ball line, the boards to stand and aim on with
 *  where the ball goes down worked out from them, or the strike ball move. A
 *  leave that has both is on one row of each. */
function RowHeading({ line, kind }: { line: SpareLine; kind: LineRow["kind"] }) {
  const driftModel = useDriftModel();
  const handedness = useHandedness();
  const boards = line.line;
  if (kind === "move") {
    // One line, read like the spare ball line: grey names, white values.
    const offset = line.strike_offset;
    return (
      <h2 className="text-sm font-bold tabular-nums text-ink">
        <span className={LABEL}>Strike ball</span>
        {([["Stance", offset?.stance], ["Target", offset?.target]] as const).map(([k, v]) =>
          v ? (
            <span key={k}>
              <span className={`${LABEL} ml-2`}>{k} </span>
              {describeMove(v, handedness)}
            </span>
          ) : null
        )}
      </h2>
    );
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 className="text-sm font-bold tabular-nums text-ink">
        <span className={LABEL}>Stance </span>
        {boards?.stance ?? "-"}
        <span className={`${LABEL} ml-2`}>Target </span>
        {boards?.target ?? "-"}
      </h2>
      {boards && <DerivedChain line={boards} model={driftModel} inline />}
    </div>
  );
}
