import { ExternalLink, Pencil, Plus, RotateCcw, Trash2, Waves } from "lucide-react";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
import { GROUP_HEADING } from "./ui/typography";

interface OilPatternManagerProps {
  /** Present when pushed from Settings — draws the shared nav bar. Absent when
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
    setError("");
    try {
      const result = await removeOilPattern(pattern.id);
      setNotice(
        result.outcome === "archived"
          ? `"${pattern.name}" is used by ${result.sessions} ${result.sessions === 1 ? "session" : "sessions"}, so it was archived instead of deleted.`
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
      {notice && <p className="mb-3 text-xs text-ink-secondary">{notice}</p>}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : active.length === 0 ? (
        <EmptyState
          icon={Waves}
          title="No oil patterns yet"
          description="Save the patterns you bowl on, with a link to their sheet, and they show up when you start a session."
        >
          <Button variant="primary" size="lg" onClick={openAdd}>
            <Plus size={18} aria-hidden="true" />
            Add a pattern
          </Button>
        </EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {active.map((pattern) => (
            <PatternRow
              key={pattern.id}
              pattern={pattern}
              onEdit={() => openEdit(pattern)}
              onRemove={() => void handleRemove(pattern)}
            />
          ))}
        </ul>
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
            <ul className="mt-1.5 space-y-1.5">
              {archived.map((pattern) => (
                <PatternRow
                  key={pattern.id}
                  pattern={pattern}
                  onEdit={() => openEdit(pattern)}
                  onRestore={() => void handleRestore(pattern)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      <OilPatternFormDialog
        // Remount so the fields reset between add and edit.
        key={editing?.id ?? "new"}
        open={dialogOpen}
        initial={editing}
        onSubmit={handleSubmit}
        onCancel={() => {
          setDialogOpen(false);
          setEditing(undefined);
        }}
      />
    </section>
  );

  if (!onBack) return body;

  return (
    <PushScreen
      mode={mode}
      title="Oil patterns"
      onBack={onBack}
      trailing={
        <IconButton onClick={openAdd} label="Add oil pattern">
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
  onRemove,
  onRestore
}: {
  pattern: OilPattern;
  onEdit: () => void;
  onRemove?: () => void;
  onRestore?: () => void;
}) {
  return (
    <li className="flex items-center gap-1 rounded-lg border border-edge bg-surface px-3 py-1.5 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{pattern.name}</p>
        {pattern.url ? (
          <a
            href={pattern.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent underline underline-offset-2"
          >
            <ExternalLink size={12} aria-hidden="true" />
            Pattern sheet
          </a>
        ) : (
          <p className="text-xs text-ink-tertiary">No link</p>
        )}
      </div>
      <IconButton label={`Edit ${pattern.name}`} onClick={onEdit}>
        <Pencil size={16} aria-hidden="true" />
      </IconButton>
      {onRestore ? (
        <IconButton label={`Restore ${pattern.name}`} onClick={onRestore}>
          <RotateCcw size={16} aria-hidden="true" />
        </IconButton>
      ) : (
        <IconButton variant="danger" label={`Remove ${pattern.name}`} onClick={onRemove}>
          <Trash2 size={16} aria-hidden="true" />
        </IconButton>
      )}
    </li>
  );
}
