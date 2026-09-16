import { ChevronRight, ExternalLink, Plus, RotateCcw } from "lucide-react";
import { OilPatternIcon } from "./icons";
import { useMemo, useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorBanner } from "./ErrorBanner";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import { PushScreen } from "./PushScreen";
import { FormSheet } from "./ui/FormSheet";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { IconButton } from "./ui/IconButton";
import {
  addOilPattern,
  getAllOilPatterns,
  removeOilPattern,
  setOilPatternArchived,
  updateOilPattern
} from "../services/ballRepository";
import type { OilPass, OilPattern } from "../types/bowling";
import { headlineRatio, oilStats } from "../lib/oilPattern";
import { getCatalogPatterns, type CatalogPattern } from "../services/patternCatalog";
import { LIST_DIVIDER, ListGroup } from "./ui/ListGroup";
import { GROUP_HEADING } from "./ui/typography";

interface OilPatternManagerProps {
  /** Present when pushed from Settings, draws the shared nav bar. Absent when
   *  the session form embeds the manager inline. */
  onBack?: () => void;
  /** `overlay` when pushed over another tab, `inline` inside Settings. */
  mode?: "inline" | "overlay";
}

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_PATTERNS: OilPattern[] = [];

export function OilPatternManager({ onBack, mode = "inline" }: OilPatternManagerProps = {}) {
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
    setShowCatalog(false);
    try {
      // useLiveQuery re-reads the list, so there is nothing to refresh by hand.
      await addOilPattern(pattern.name, pattern.sourceUrl, pattern.passes);
      setNotice(`Added ${pattern.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add that pattern.");
    }
  }

  const active = useMemo(() => patterns.filter((p) => !p.archived), [patterns]);
  const archived = useMemo(() => patterns.filter((p) => p.archived), [patterns]);

  async function handleSubmit(values: { name: string; url?: string; passes?: OilPass[] }) {
    if (editing?.id != null) {
      await updateOilPattern(editing.id, values);
    } else {
      await addOilPattern(values.name, values.url, values.passes);
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

      {/* The catalog leads, because it is how a pattern gets a load table
          without anyone typing one (ADR-104). Absent when the catalog is
          empty or unreachable, so it never advertises nothing. */}
      {catalog.length > 0 && (
        <button
          type="button"
          onClick={() => setShowCatalog(true)}
          className="mb-3 flex w-full items-center gap-3 rounded-xl border border-edge bg-surface px-3 py-2.5 text-left active:bg-surface-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Add from the catalog</span>
            <span className="block truncate text-xs text-ink-secondary">
              {catalog.length} pattern{catalog.length === 1 ? "" : "s"}, with their load tables
            </span>
          </span>
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
        </button>
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
            <PatternRow key={pattern.id} pattern={pattern} onEdit={() => openEdit(pattern)} />
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

      {showCatalog && (
        <FormSheet title="Add from the catalog" onClose={() => setShowCatalog(false)}>
          <ListGroup>
            {catalog.map((pattern) => (
              <li key={pattern.id} className={`flex items-center ${LIST_DIVIDER}`}>
                <button
                  type="button"
                  onClick={() => void addFromCatalog(pattern)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{pattern.name}</span>
                    <span className="block truncate text-xs tabular-nums text-ink-secondary">
                      {Math.round(pattern.distance)} ft · {pattern.volumeMl.toFixed(2)} mL
                      {pattern.ratio != null ? ` · ${pattern.ratio.toFixed(1)}:1` : ""}
                    </span>
                  </span>
                  <Plus size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
                </button>
              </li>
            ))}
          </ListGroup>
          <p className="mt-2 px-1 text-xs text-ink-tertiary">
            Each one was checked against the totals printed on its own sheet before
            it shipped. Adding one copies it into your list, so you can edit it.
          </p>
        </FormSheet>
      )}

      <OilPatternFormDialog
        // Remount so the fields reset between add and edit.
        key={editing?.id ?? "new"}
        open={dialogOpen}
        initial={editing}
        onSubmit={handleSubmit}
        onRemove={editing ? () => setPendingRemove(editing) : undefined}
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
      active={!dialogOpen && pendingRemove === null}
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
    const tail = ratio != null ? ` · ${ratio.toFixed(1)}:1` : "";
    return `${Math.round(stats.length)} ft · ${stats.volumeMl.toFixed(2)} mL${tail}`;
  }
  return pattern.url ? "Pattern sheet saved" : "No link";
}

function PatternRow({
  pattern,
  onEdit,
  onRestore
}: {
  pattern: OilPattern;
  onEdit: () => void;
  onRestore?: () => void;
}) {
  return (
    <li className={`flex items-center ${LIST_DIVIDER}`}>
      {/* The row itself opens the editor. It used to carry an edit pencil and a
          delete bin beside the name, three targets in one row; removal moved
          into the editor, where it sits with the thing it destroys (§4, §2). */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${pattern.name}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-surface-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-ink">{pattern.name}</span>
          <span className="block truncate text-xs tabular-nums text-ink-secondary">
            {summarize(pattern)}
          </span>
        </span>
        {/* The chevron steps aside for the sheet link: two arrows in one row
            read as one crowded control rather than two clear ones. */}
        {!onRestore && !pattern.url && (
          <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-tertiary" />
        )}
      </button>
      {/* A second target, deliberately: the sheet is a different destination
          rather than an action on the row, the same exception the drag handle
          takes. */}
      {pattern.url && (
        <a
          href={pattern.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open the ${pattern.name} pattern sheet`}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-accent"
        >
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      )}
      {onRestore && (
        <IconButton label={`Restore ${pattern.name}`} onClick={onRestore}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
      )}
    </li>
  );
}
