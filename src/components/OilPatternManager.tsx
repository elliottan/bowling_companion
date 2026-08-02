import { ExternalLink, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "./ErrorBanner";
import { OilPatternFormDialog } from "./OilPatternFormDialog";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import {
  addOilPattern,
  getAllOilPatterns,
  removeOilPattern,
  setOilPatternArchived,
  updateOilPattern
} from "../services/ballRepository";
import type { OilPattern } from "../types/bowling";

export function OilPatternManager() {
  const [patterns, setPatterns] = useState<OilPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OilPattern | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setPatterns(await getAllOilPatterns());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load oil patterns.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    await refresh();
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
      await refresh();
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
      await refresh();
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

  return (
    <section className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-ink">Oil Patterns</h1>
        <Button variant="primary" onClick={openAdd}>
          <Plus size={16} aria-hidden="true" />
          Add
        </Button>
      </div>

      {error && <ErrorBanner className="mb-3">{error}</ErrorBanner>}
      {notice && <p className="mb-3 text-xs text-ink-secondary">{notice}</p>}

      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-ink-secondary">
          No oil patterns yet. Add one here, or from the oil pattern field when you start a session.
        </p>
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
            className="mt-5 px-1 text-xs font-semibold uppercase tracking-wide text-ink-secondary"
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
