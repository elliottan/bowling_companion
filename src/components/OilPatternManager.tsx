import { ChevronRight, ExternalLink, Plus, RotateCcw, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { ErrorBanner } from "./ErrorBanner";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import { PushScreen } from "./PushScreen";
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
import type { OilPattern } from "../types/bowling";
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

  const active = useMemo(() => patterns.filter((p) => !p.archived), [patterns]);
  const archived = useMemo(() => patterns.filter((p) => p.archived), [patterns]);

  async function handleSubmit(values: { name: string; url?: string }) {
    if (editing?.id != null) {
      await updateOilPattern(editing.id, values);
    } else {
      await addOilPattern(values.name, values.url);
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

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : active.length === 0 ? (
        <EmptyState
          icon={Waves}
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
          <span className="block truncate text-xs text-ink-secondary">
            {pattern.url ? "Pattern sheet saved" : "No link"}
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
