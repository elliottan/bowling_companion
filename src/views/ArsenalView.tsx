import { t } from "@lingui/core/macro";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Compass, GripVertical, Plus, RotateCcw } from "lucide-react";
import { BowlingBallIcon } from "../components/icons";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BallFormDialog } from "../components/BallFormDialog";
import { CatalogBallImage } from "../components/CatalogBallImage";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ErrorBanner } from "../components/ErrorBanner";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { IconButton } from "../components/ui/IconButton";
import { Measure } from "../components/ui/Measure";
import { LIST_DIVIDER_BASE, ListGroup } from "../components/ui/ListGroup";
import { GROUP_HEADING } from "../components/ui/typography";
import { activeBalls } from "../lib/arsenal";
import { deleteBall, getBalls, reorderBalls, setBallRetired } from "../services/ballRepository";
import {
  getGripStyle,
  getHandedness,
  getLayoutSystem,
  getPap
} from "../services/bowlingRepository";
import { DEFAULT_PAP, formatLayoutSpec, layoutSystemFor } from "../lib/ballLayout";
import { layoutSeedFromBall, type LayoutSeed } from "../lib/layoutShare";
import { useHandedness } from "../lib/handednessContext";
import type { LockedProAccess } from "../lib/pro";
import { useProAccess } from "../lib/useProAccess";
import { useProEntry } from "../components/ui/useProAction";
import type { Ball, LayoutSystem } from "../types/bowling";
import type { Manufacturer } from "../types/catalog";
import { formatFixed } from "../lib/format";

interface SortableBallRowProps {
  ball: Ball;
  onEdit: (ball: Ball) => void;
  /** Which notation a ball with none of its own is written in. */
  system: LayoutSystem;
  /** Open the layout lab on this ball's drilling. Absent while the bowler's own
   *  numbers are still loading, which is the one moment there is nothing
   *  coherent to open. */
  onViewLayout?: (ball: Ball) => void;
}

/** One arsenal entry. The whole row opens the editor, the old row had an edit
 *  and a delete target crammed beside a drag handle, three ways to mis-tap. */
function SortableBallRow({ ball, onEdit, system, onViewLayout }: SortableBallRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ball.id! });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  const snap = ball.catalog_snapshot;
  const specs = snap
    ? [
        snap.coverstockCategory,
        snap.coreName,
        snap.rg !== null ? t({ message: `RG ${{ rg: formatFixed(snap.rg, 2) }}`, comment: "Bowling term: RG is the radius of gyration, a ball spec, followed by its value" }) : null,
        snap.diff !== null ? t({ message: `Diff ${{ diff: formatFixed(snap.diff, 3) }}`, comment: "Bowling term: the differential, a ball spec (short for differential RG), followed by its value" }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    // One row of the bag's grouped list (ADR-191): the divider starts at the
    // name, past the handle and the photo, and the row the finger holds lifts
    // off the list as a card of its own.
    <li
      ref={setNodeRef}
      style={style}
      className={`${LIST_DIVIDER_BASE} before:left-24 first:[&>div]:rounded-t-[26px] last:[&>div]:rounded-b-[26px]`}
    >
      <div
        className={`flex items-center gap-1 bg-surface pr-2 ${
          isDragging ? "rounded-[26px] opacity-95 shadow-md ring-1 ring-accent-fill" : ""
        }`}
      >
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t`Drag to reorder ${{ name: ball.name }}`}
          className="inline-flex h-14 w-8 shrink-0 touch-none items-center justify-center text-ink-tertiary"
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onEdit(ball)}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 text-left"
        >
          <div className="h-12 w-12 shrink-0">
            {snap ? (
              <CatalogBallImage
                src={snap.imageThumb}
                alt={ball.name}
                brand={snap.brand as Manufacturer}
                size="thumb"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface-muted text-ink-tertiary">
                <BowlingBallIcon size={22} aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-ink">{ball.name}</span>
              {/* The weight beside the name: two copies of one ball in
                  different weights are told apart here first. */}
              {ball.weight != null && (
                <span className="text-xs font-semibold tabular-nums text-ink-secondary">{t`${{ weight: ball.weight }} lb`}</span>
              )}
              {ball.is_spare_ball && (
                <span className="rounded-full bg-success-50 px-2 py-0.5 text-caption-2 font-semibold text-success-700">
                  {t({ message: "Spare", comment: "Bowling term: a badge on a ball used for picking up spares" })}
                </span>
              )}
            </div>
            {specs && <p className="text-xs text-ink-secondary">{specs}</p>}
            {/* The drilling, written in the notation this ball is read in. A
                ball entered before the arsenal could hold numbers still shows
                the text that was typed on it. */}
            {ball.layout_spec ? (
              <p className="truncate text-xs tabular-nums text-ink-secondary">
                <Measure>{formatLayoutSpec(ball.layout_spec, layoutSystemFor(ball.layout_spec, system))}</Measure>
              </p>
            ) : (
              ball.layout && <p className="truncate text-xs text-ink-secondary">{ball.layout}</p>
            )}
            {ball.notes && <p className="truncate text-xs text-ink-secondary">{ball.notes}</p>}
          </div>
        </button>

        {/* The way to see the layout drawn on a ball, on the ball that has one.
            It is a separate target rather than part of the row because the row
            already means "edit this ball", and the two are different questions:
            what are the numbers, and what do they do. */}
        {ball.layout_spec && onViewLayout && (
          <IconButton
            label={t`View the layout on ${{ name: ball.name }}`}
            title={t`View layout`}
            onClick={() => onViewLayout(ball)}
          >
            {/* The layout lab's own glyph from Home, since that is where it goes. */}
            <Compass size={18} aria-hidden="true" />
          </IconButton>
        )}
      </div>
    </li>
  );
}

/** A ball out of the bag (ADR-133). No drag handle, since it has no place in
 *  the order, and a way back beside the row, as an archived pattern has. */
function RetiredBallRow({
  ball,
  onEdit,
  onRestore
}: {
  ball: Ball;
  onEdit: () => void;
  onRestore: () => void;
}) {
  const snap = ball.catalog_snapshot;
  return (
    <li className={`flex items-center pr-2 ${LIST_DIVIDER_BASE} before:left-[4.25rem]`}>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t`Edit ${{ name: ball.name }}`}
        className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left active:bg-surface-muted"
      >
        <div className="h-10 w-10 shrink-0">
          {snap ? (
            <CatalogBallImage src={snap.imageThumb} alt="" brand={snap.brand as Manufacturer} size="thumb" />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-surface-muted text-ink-tertiary">
              <BowlingBallIcon size={20} aria-hidden="true" />
            </div>
          )}
        </div>
        <span className="min-w-0 flex-1 truncate text-body text-ink">{ball.name}</span>
      </button>
      <IconButton label={t`Bring back ${{ name: ball.name }}`} onClick={onRestore}>
        <RotateCcw size={16} aria-hidden="true" />
      </IconButton>
    </li>
  );
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_BALLS: Ball[] = [];

interface ArsenalViewProps {
  /** Dismiss the pushed screen and return to whatever launched it. */
  onBack: () => void;
  /** Push the layout lab, showing this ball's drilling against the bowler's own
   *  axis. Optional, so the screen still renders in a test that only cares
   *  about the list. */
  onViewLayout?: (seed: LayoutSeed) => void;
}

export function ArsenalView({ onBack, onViewLayout }: ArsenalViewProps) {
  // Live: Dexie re-runs this whenever the table changes, so saving, deleting
  // and reordering do not each have to remember to refresh the list.
  const live = useLiveQuery(() => getBalls());
  // Reordering shows the new order while the write lands, or the row would
  // snap back for a frame before the live query caught up.
  const [reordered, setReordered] = useState<Ball[] | null>(null);
  const all = live ?? NO_BALLS;
  // Only the bag is ordered and dragged; retired balls sit apart below it.
  const inBag = useMemo(() => activeBalls(all), [all]);
  const retired = useMemo(() => all.filter((b) => b.retired), [all]);
  const balls = reordered ?? inBag;
  const isLoading = live === undefined;
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState("");

  // The bowler's own numbers, so a layout opened from here is read against the
  // axis it was drilled for rather than against a default.
  const appHand = useHandedness();
  const pap = useLiveQuery(getPap, [], undefined);
  const storedHand = useLiveQuery(getHandedness, [], undefined);
  const grip = useLiveQuery(getGripStyle, [], undefined);
  const system = useLiveQuery(getLayoutSystem, [], undefined) ?? "dual";

  // Writing a layout on a ball is free; seeing it drawn is Pro (ADR-193). The
  // button stays where it is either way, and without Pro a tap says so.
  const access = useProAccess();
  const [askPro, setAskPro] = useState(false);

  const viewLayout = (ball: Ball) => {
    if (access.locked) {
      setAskPro(true);
      return;
    }
    const seed = layoutSeedFromBall(
      ball,
      { pap: pap ?? DEFAULT_PAP, hand: storedHand ?? appHand, grip: grip ?? "1h" },
      system
    );
    if (seed) onViewLayout?.(seed);
  };

  // null = closed; { ball: null } = adding; { ball } = editing.
  const [form, setForm] = useState<{ ball: Ball | null } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Ball | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = balls.findIndex((b) => b.id === active.id);
    const newIndex = balls.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(balls, oldIndex, newIndex);
    setReordered(next);
    setError("");
    try {
      await reorderBalls(next.map((b) => b.id!));
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Failed to save new order.`);
    } finally {
      // Either the write landed and the live query already agrees, or it
      // failed and the stored order is the truth.
      setReordered(null);
    }
  }

  async function handleRetire(ball: Ball, retire: boolean) {
    setForm(null);
    setError("");
    try {
      await setBallRetired(ball.id!, retire);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Failed to update ball.`);
    }
  }

  async function handleDelete(ball: Ball) {
    setPendingDelete(null);
    setForm(null);
    setError("");
    try {
      await deleteBall(ball.id!);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Failed to delete ball.`);
    }
  }

  return (
    <>
      <PushScreen
        title={t`Arsenal`}
        onBack={onBack}
        active={form === null && pendingDelete === null}
        trailing={
          <IconButton onClick={() => setForm({ ball: null })} label={t`Add ball`} variant="round">
            <Plus size={24} aria-hidden="true" />
          </IconButton>
        }
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
          {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}

          {isLoading ? (
            <p className="text-sm text-ink-secondary">{t`Loading…`}</p>
          ) : balls.length === 0 && retired.length === 0 ? (
            <EmptyState
              icon={BowlingBallIcon}
              title={t`No balls yet`}
              description={t`Add a ball, then pick it for each shot as you score.`}
            >
              <Button variant="primary" size="lg" onClick={() => setForm({ ball: null })}>
                <Plus size={18} aria-hidden="true" />
                {t`Add a ball`}
              </Button>
            </EmptyState>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void handleDragEnd(e)}
              >
                <SortableContext items={balls.map((b) => b.id!)} strategy={verticalListSortingStrategy}>
                  <ul className="rounded-[26px] bg-surface">
                    {balls.map((ball) => (
                      <SortableBallRow
                        key={ball.id}
                        ball={ball}
                        system={system}
                        onEdit={(b) => setForm({ ball: b })}
                        onViewLayout={onViewLayout ? viewLayout : undefined}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              {balls.length === 0 && (
                <p className="px-1 text-sm text-ink-secondary">
                  {t`Every ball you have is retired. Add one, or bring one back.`}
                </p>
              )}

              {retired.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRetired((v) => !v)}
                    aria-expanded={showRetired}
                    className={`mt-5 px-1 ${GROUP_HEADING}`}
                  >
                    {showRetired ? t`Hide retired (${{ count: retired.length }})` : t`Show retired (${{ count: retired.length }})`}
                  </button>
                  {showRetired && (
                    <div className="mt-1.5">
                      <ListGroup>
                        {retired.map((ball) => (
                          <RetiredBallRow
                            key={ball.id}
                            ball={ball}
                            onEdit={() => setForm({ ball })}
                            onRestore={() => void handleRetire(ball, false)}
                          />
                        ))}
                      </ListGroup>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </PushScreen>

      {form && (
        <BallFormDialog
          key={form.ball?.id ?? "new"}
          ball={form.ball}
          onClose={() => setForm(null)}
          onSaved={() => setForm(null)}
          onDelete={form.ball ? () => setPendingDelete(form.ball) : undefined}
          onRetire={form.ball ? (retire) => void handleRetire(form.ball!, retire) : undefined}
          // The row's compass, on the ball's own sheet too. A sheet sits above
          // every pushed screen, so the lab would open under it: the sheet goes
          // first, and back comes to the arsenal. Without Pro it stays, under
          // the prompt that says Pro draws the layout.
          onViewLayout={
            form.ball?.layout_spec && onViewLayout
              ? () => {
                  const ball = form.ball!;
                  if (!access.locked) setForm(null);
                  viewLayout(ball);
                }
              : undefined
          }
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? t`Delete ${{ name: pendingDelete.name }}?` : t`Delete ball?`}
        message={t`Shots already recorded with this ball keep their scores, but lose the ball name. To keep it in your history, retire it instead.`}
        onConfirm={() => pendingDelete && void handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />

      {access.locked && <LayoutProPrompt access={access} open={askPro} onClose={() => setAskPro(false)} />}
    </>
  );
}

/** What View layout says without Pro: the layout is on the ball, and Pro is
 *  what draws it. Mounted for as long as Pro is locked, not only while it is
 *  open, so the web's steps for moving games outlive the prompt that started
 *  them. */
function LayoutProPrompt({
  access,
  open,
  onClose
}: {
  access: LockedProAccess;
  open: boolean;
  onClose: () => void;
}) {
  const entry = useProEntry(access);
  return (
    <>
      <ConfirmDialog
        open={open}
        title={t`Get Pro to visualize your ball layout`}
        message={t`Your layout is saved on the ball. Headpin Pro draws it on the ball and shows what it will do on the lane.`}
        confirmLabel={entry.label}
        confirmVariant="primary"
        confirmDisabled={entry.unavailable}
        cancelLabel={t`Not now`}
        onConfirm={() => {
          onClose();
          entry.start();
        }}
        onCancel={onClose}
      />
      {entry.dialog}
    </>
  );
}
