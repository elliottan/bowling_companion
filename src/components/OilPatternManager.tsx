import { ChevronRight, Pencil, Plus, RotateCcw } from "lucide-react";
import { OilPatternIcon } from "./icons";
import { useMemo, useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorBanner } from "./ErrorBanner";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import { PatternSheet } from "./PatternSheet";
import { PushScreen } from "./PushScreen";
import { FormSheet } from "./ui/FormSheet";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { IconButton } from "./ui/IconButton";
import { Chip } from "./ui/Chip";
import {
  addOilPattern,
  getAllOilPatterns,
  removeOilPattern,
  setOilPatternArchived,
  updateOilPattern
} from "../services/ballRepository";
import type { OilPass, OilPattern } from "../types/bowling";
import {
  headlineRatio, oilStats, patternClass, patternLabel, patternLength, patternLengthBand,
  PATTERN_CLASS_LABEL, PATTERN_LENGTH_LABEL, type PatternClass, type PatternLengthBand,
} from "../lib/oilPattern";
import { FIELD } from "./ui/field";
import { getCatalogPatterns, type CatalogPattern } from "../services/patternCatalog";
import { LIST_DIVIDER, ListGroup } from "./ui/ListGroup";
import { GROUP_HEADING } from "./ui/typography";

interface OilPatternManagerProps {
  /** Present when pushed from Settings, draws the shared nav bar. Absent when
   *  the session form embeds the manager inline. */
  onBack?: () => void;
  /** `overlay` when pushed over another tab, `inline` inside Settings. */
  mode?: "inline" | "overlay";
  /** Jump to the line visualizer with a pattern's own load table already
   *  drawn. Omitted where the manager has no visualizer to send you to (the
   *  session form's inline copy). */
  onOpenLineVisualizer?: (patternId: number) => void;
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_PATTERNS: OilPattern[] = [];

export function OilPatternManager({ onBack, mode = "inline", onOpenLineVisualizer }: OilPatternManagerProps = {}) {
  // Live: adding, renaming, archiving and deleting a pattern all update this
  // list, including when the session form has the manager open on top of it.
  const live = useLiveQuery(() => getAllOilPatterns());
  const patterns = live ?? NO_PATTERNS;
  const isLoading = live === undefined;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OilPattern | undefined>(undefined);
  const [pendingRemove, setPendingRemove] = useState<OilPattern | null>(null);
  const [catalog, setCatalog] = useState<CatalogPattern[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);
  const [query, setQuery] = useState("");
  // Set while the catalog sheet is lending a load table to an existing pattern
  // rather than adding a new one.
  const [linkTo, setLinkTo] = useState<OilPattern | null>(null);
  const [sheetFor, setSheetFor] = useState<OilPattern | null>(null);
  const [shape, setShape] = useState<PatternClass | null>(null);
  const [band, setBand] = useState<PatternLengthBand | null>(null);

  // The shipped catalog (ADR-104). Loaded once, and an empty one simply means
  // nothing to start from, never a broken screen.
  useEffect(() => {
    let live = true;
    getCatalogPatterns().then((p) => { if (live) setCatalog(p); }).catch(() => {});
    return () => { live = false; };
  }, []);

  /** Add a catalog pattern to your own list. It is copied, not referenced: a
   *  pattern in your list is yours, and editing it must never edit the catalog. */
  async function addFromCatalog(pattern: CatalogPattern) {
    const target = linkTo;
    setShowCatalog(false);
    setLinkTo(null);
    try {
      // useLiveQuery re-reads the list, so there is nothing to refresh by hand.
      if (target?.id != null) {
        // The same row, enriched. Its id does not change, so every session
        // already on this pattern keeps resolving it, and the bowler's own name
        // for it survives: that is the name their history is written in.
        await updateOilPattern(target.id, {
          name: target.name,
          url: target.url ?? pattern.sourceUrl,
          passes: pattern.passes,
          // One way, and the point of it: this row IS that pattern now, so the
          // catalog keeps its load table current and only the name stays the
          // bowler's (ADR-105).
          catalog_id: pattern.id,
        });
        setNotice(`${target.name} now draws ${pattern.name}.`);
        return;
      }
      await addOilPattern(pattern.name, pattern.sourceUrl, pattern.passes);
      setNotice(`Added ${pattern.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add that pattern.");
    }
  }

  const all = useMemo(() => patterns.filter((p) => !p.archived), [patterns]);
  // One list, searched one way. The catalog seeds itself into it (ADR-105), so
  // there is nothing here to tell apart from anything else.
  const active = useMemo(
    () => all.filter((p) =>
      matchesFilters(p.name, patternLength(p), patternClass(headlineRatio(p.passes)), { query, shape, band })),
    [all, query, shape, band]
  );
  const catalogShown = useMemo(
    () => catalog.filter((p) =>
      matchesFilters(p.name, p.distance, p.shape ?? patternClass(p.ratio), { query, shape, band })),
    [catalog, query, shape, band]
  );
  const archived = useMemo(() => patterns.filter((p) => p.archived), [patterns]);

  async function handleSubmit(values: { name: string; url?: string; passes?: OilPass[]; distance?: number }) {
    if (editing?.id != null) {
      await updateOilPattern(editing.id, values);
    } else {
      await addOilPattern(values.name, values.url, values.passes, values.distance);
    }
    setDialogOpen(false);
    setEditing(undefined);
    setNotice("");
  }

  async function handleRemove(pattern: OilPattern) {
    if (pattern.id == null) return;
    setPendingRemove(null);
    setDialogOpen(false);
    setEditing(undefined);
    setError("");
    try {
      const result = await removeOilPattern(pattern.id);
      setNotice(
        result.outcome === "archived"
          ? `"${pattern.name}" is still used by ${result.sessions} ${result.sessions === 1 ? "session" : "sessions"}. Archived instead of deleted.`
          : `"${pattern.name}" deleted.`
      );
      } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove pattern.");
    }
  }

  async function handleRestore(pattern: OilPattern) {
    if (pattern.id == null) return;
    setError("");
    try {
      await setOilPatternArchived(pattern.id, false);
      setNotice("");
      } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restore pattern.");
    }
  }

  function openAdd() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(pattern: OilPattern) {
    setEditing(pattern);
    setDialogOpen(true);
  }

  const body = (
    <section className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
      {!onBack && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-ink">Oil patterns</h1>
          <IconButton onClick={openAdd} label="Add oil pattern" variant="round">
            <Plus size={20} aria-hidden="true" />
          </IconButton>
        </div>
      )}

      {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}
      {notice && (
        <p
          role="status"
          className="mb-3 rounded-lg border border-edge bg-surface-muted p-3 text-sm text-ink-secondary"
        >
          {notice}
        </p>
      )}

      {all.length > 3 && (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${FIELD} mb-2`}
            placeholder="Name or length, e.g. Stonehenge or 40"
            aria-label="Search patterns"
          />
          <PatternFilters shape={shape} onShape={setShape} band={band} onBand={setBand} />
        </>
      )}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : active.length === 0 ? (
        <EmptyState
          icon={OilPatternIcon}
          title="No oil patterns yet"
          description="Save patterns with a link to their sheet. They show up when you start a session."
        >
          <Button variant="primary" size="lg" onClick={openAdd}>
            <Plus size={18} aria-hidden="true" />
            Add a pattern
          </Button>
        </EmptyState>
      ) : (
        <ListGroup>
          {active.map((pattern) => (
            <PatternRow
              key={pattern.id}
              pattern={pattern}
              onEdit={() => openEdit(pattern)}
              onOpenSheet={() => setSheetFor(pattern)}
            />
          ))}
        </ListGroup>
      )}

      {archived.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className={`mt-5 px-1 ${GROUP_HEADING}`}
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-1.5">
              <ListGroup>
                {archived.map((pattern) => (
                  <PatternRow
                    key={pattern.id}
                    pattern={pattern}
                    onEdit={() => openEdit(pattern)}
                    onRestore={() => void handleRestore(pattern)}
                  />
                ))}
              </ListGroup>
            </div>
          )}
        </>
      )}

      {sheetFor && (
        <PatternSheet
          pattern={sheetFor}
          onClose={() => setSheetFor(null)}
          onOpenInLineVisualizer={
            onOpenLineVisualizer && sheetFor.id != null
              ? () => {
                  onOpenLineVisualizer(sheetFor.id!);
                  setSheetFor(null);
                }
              : undefined
          }
        />
      )}

      {showCatalog && (
        <FormSheet
          title={`Load table for ${linkTo?.name ?? "this pattern"}`}
          onClose={() => { setShowCatalog(false); setLinkTo(null); }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${FIELD} mb-2`}
            placeholder="Name or length, e.g. Stonehenge or 40"
            aria-label="Search patterns"
          />

          <PatternFilters shape={shape} onShape={setShape} band={band} onBand={setBand} />

          <ListGroup>
            {catalogShown.map((pattern) => (
              <li key={pattern.id} className={`flex items-center ${LIST_DIVIDER}`}>
                <button
                  type="button"
                  onClick={() => void addFromCatalog(pattern)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{patternLabel(pattern)}</span>
                    <span className="block truncate text-xs tabular-nums text-ink-secondary">
                      {pattern.volumeMl.toFixed(2)} mL
                      {pattern.ratio != null ? ` · ${pattern.ratio.toFixed(1)}:1` : ""}
                      {(pattern.shape ?? patternClass(pattern.ratio))
                        ? ` · ${PATTERN_CLASS_LABEL[(pattern.shape ?? patternClass(pattern.ratio))!]}`
                        : ""}
                    </span>
                  </span>
                  <Plus size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
                </button>
              </li>
            ))}
          </ListGroup>
          <p className="mt-2 px-1 text-xs text-ink-tertiary">
            Catalog patterns match their official sheets. Linking replaces this pattern's details with the catalog's, but keeps your name for it and its sessions. You can't undo this.
          </p>
        </FormSheet>
      )}

      <OilPatternFormDialog
        // Remount so the fields reset between add and edit.
        key={editing?.id ?? "new"}
        open={dialogOpen}
        initial={editing}
        onSubmit={handleSubmit}
        onRemove={editing && !editing.catalog_id ? () => setPendingRemove(editing) : undefined}
        catalogName={catalog.find((c) => c.id === editing?.catalog_id)?.name}
        onLinkCatalog={
          editing && !editing.catalog_id && catalog.length > 0
            ? () => {
                const target = editing;
                setDialogOpen(false);
                setEditing(undefined);
                setLinkTo(target);
                setShowCatalog(true);
              }
            : undefined
        }
        onCancel={() => {
          setDialogOpen(false);
          setEditing(undefined);
        }}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        title={`Remove ${pendingRemove?.name ?? "pattern"}?`}
        message="Sessions already bowled on it keep the pattern. If any still use it, it is archived instead of deleted."
        confirmLabel="Remove"
        onConfirm={() => pendingRemove && void handleRemove(pendingRemove)}
        onCancel={() => setPendingRemove(null)}
      />
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen
      mode={mode}
      title="Oil patterns"
      onBack={onBack}
      active={!dialogOpen && pendingRemove === null && sheetFor === null && !showCatalog}
      trailing={
        <IconButton onClick={openAdd} label="Add oil pattern" variant="round">
          <Plus size={24} aria-hidden="true" />
        </IconButton>
      }
    >
      {body}
    </PushScreen>
  );
}

/** The one line under the name: what the pattern IS where it is known, and what
 *  is on file where it is not. A load table outranks a link, because a drawn
 *  pattern is the thing the link was standing in for. */
function summarize(pattern: OilPattern): string {
  const stats = oilStats(pattern.passes);
  if (stats.length > 0) {
    const ratio = headlineRatio(pattern.passes);
    const shape = patternClass(ratio);
    // The length leads the name (patternLabel), so it is not repeated here.
    return [
      `${stats.volumeMl.toFixed(2)} mL`,
      ratio != null ? `${ratio.toFixed(1)}:1` : null,
      shape ? PATTERN_CLASS_LABEL[shape] : null,
    ].filter(Boolean).join(" · ");
  }
  // No table, so the length is whatever was typed, and there is no ratio to
  // classify by: a pattern you added yourself is a label, not a drawing.
  return pattern.url ? "Pattern sheet saved" : "No link";
}

function PatternRow({
  pattern,
  onEdit,
  onOpenSheet,
  onRestore
}: {
  pattern: OilPattern;
  onEdit: () => void;
  /** Given for the active list: the row opens the pattern's detail sheet, and
   *  the pencil beside it opens the editor. Archived rows have no detail page
   *  worth a special row, so they keep the row opening the editor directly. */
  onOpenSheet?: () => void;
  onRestore?: () => void;
}) {
  const primary = onOpenSheet ?? onEdit;
  return (
    <li className={`flex items-center ${LIST_DIVIDER}`}>
      <button
        type="button"
        onClick={primary}
        aria-label={onOpenSheet ? `${pattern.name} details` : `Edit ${pattern.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{patternLabel(pattern)}</span>
          <span className="block truncate text-xs tabular-nums text-ink-secondary">
            {summarize(pattern)}
          </span>
        </span>
        {!onOpenSheet && !onRestore && (
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
        )}
      </button>
      {/* A second target, deliberately: editing is a different destination
          rather than an action folded into the row, the same exception the
          drag handle takes. */}
      {onOpenSheet && (
        <IconButton label={`Edit ${pattern.name}`} onClick={onEdit}>
          <Pencil size={16} aria-hidden="true" />
        </IconButton>
      )}
      {onRestore && (
        <IconButton label={`Restore ${pattern.name}`} onClick={onRestore}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
      )}
    </li>
  );
}

/** Search box text, a play style and a length band, all three optional. The
 *  box takes a name or a length: typing 40 finds the forty footers. */
function matchesFilters(
  name: string,
  feet: number | null,
  plays: PatternClass | null,
  filters: { query: string; shape: PatternClass | null; band: PatternLengthBand | null },
): boolean {
  if (filters.shape && plays !== filters.shape) return false;
  if (filters.band && patternLengthBand(feet) !== filters.band) return false;
  const q = filters.query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q) || (feet != null && String(Math.round(feet)).startsWith(q));
}

/** How a pattern plays, by its ratio (derived rather than claimed, ADR-101),
 *  and how long it runs. Each row picks one or none. */
function PatternFilters({
  shape, onShape, band, onBand,
}: {
  shape: PatternClass | null;
  onShape: (next: PatternClass | null) => void;
  band: PatternLengthBand | null;
  onBand: (next: PatternLengthBand | null) => void;
}) {
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Play style">
        {(["sport", "challenge", "recreation"] as const).map((option) => (
          <Chip key={option} selected={shape === option} onClick={() => onShape(shape === option ? null : option)}>
            {PATTERN_CLASS_LABEL[option]}
          </Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Length">
        {(["short", "medium", "long"] as const).map((option) => (
          <Chip key={option} selected={band === option} onClick={() => onBand(band === option ? null : option)}>
            {PATTERN_LENGTH_LABEL[option]}
          </Chip>
        ))}
      </div>
    </div>
  );
}
