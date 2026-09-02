import { ChevronRight, Plus } from "lucide-react";
import { LanePairIcon } from "../components/icons";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { LaneBadge, LaneNoteFormDialog } from "../components/LaneNoteFormDialog";
import { PushScreen } from "../components/PushScreen";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Chip } from "../components/ui/Chip";
import { IconButton } from "../components/ui/IconButton";
import { getLaneNotes } from "../services/ballRepository";
import { getDistinctAlleys } from "../services/bowlingRepository";
import type { LaneNote } from "../types/bowling";
import { GROUP_HEADING } from "../components/ui/typography";
import { LIST_DIVIDER_BASE, ListGroup } from "../components/ui/ListGroup";

// A stable empty list: `?? []` would be a new array on every render, which
// invalidates every useMemo downstream of it.
const NO_NOTES: LaneNote[] = [];
const NO_ALLEYS: string[] = [];

/** null = closed, { note: null } = adding, { note } = editing. */
type FormState = { note: LaneNote | null } | null;

interface LaneNotesViewProps {
  /** Present when pushed as a screen: draws the shared nav bar. */
  onBack?: () => void;
  /** `overlay` when pushed over another tab, `inline` inside Settings. */
  mode?: "inline" | "overlay";
}

export function LaneNotesView({ onBack, mode = "inline" }: LaneNotesViewProps = {}) {
  // Live: writing a note updates the list, with no refresh call per site.
  const liveNotes = useLiveQuery(() => getLaneNotes());
  const liveAlleys = useLiveQuery(() => getDistinctAlleys());
  const laneNotes = liveNotes ?? NO_NOTES;
  const isLoading = liveNotes === undefined;

  const [form, setForm] = useState<FormState>(null);
  const [filterAlley, setFilterAlley] = useState("");

  // The add form suggests everywhere you have bowled, not only the alleys that
  // already carry a note.
  const alleySuggestions = useMemo(() => {
    const fromNotes = laneNotes.map((n) => n.alley);
    return [...new Set([...(liveAlleys ?? NO_ALLEYS), ...fromNotes])].sort();
  }, [liveAlleys, laneNotes]);

  // One section per alley, lanes in numeric order inside it. The alley name is
  // the heading rather than the first half of every row: it used to be repeated
  // on all of them, so what the row was actually about (the lane) started a
  // third of the way in.
  const groups = useMemo(() => {
    const byAlley = new Map<string, LaneNote[]>();
    for (const note of laneNotes) {
      const list = byAlley.get(note.alley);
      if (list) list.push(note);
      else byAlley.set(note.alley, [note]);
    }
    return [...byAlley.entries()]
      .map(([alley, notes]) => ({
        alley,
        notes: [...notes].sort(
          (a, b) => Number(a.lane) - Number(b.lane) || a.lane.localeCompare(b.lane)
        )
      }))
      .sort((a, b) => a.alley.localeCompare(b.alley));
  }, [laneNotes]);

  // A filter earns its row only once there is more than one alley to choose
  // between; below that the headings already say where you are.
  const showFilter = groups.length > 1;
  const shown = showFilter && filterAlley ? groups.filter((g) => g.alley === filterAlley) : groups;

  const body = (
    <section className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
      {isLoading ? (
        <p className="text-sm text-ink-secondary">Loading…</p>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={LanePairIcon}
          title="No lane notes yet"
          description="What a lane does is worth writing down once. It is here the next time you draw it."
        >
          <Button variant="primary" size="lg" onClick={() => setForm({ note: null })}>
            <Plus size={18} aria-hidden="true" />
            Add a lane note
          </Button>
        </EmptyState>
      ) : (
        <>
          {showFilter && (
            <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
              <Chip selected={filterAlley === ""} onClick={() => setFilterAlley("")}>
                All
              </Chip>
              {groups.map((g) => (
                <Chip
                  key={g.alley}
                  selected={filterAlley === g.alley}
                  onClick={() => setFilterAlley(g.alley)}
                  className="shrink-0"
                >
                  {g.alley}
                </Chip>
              ))}
            </div>
          )}

          <div className="space-y-5">
            {shown.map((group) => (
              <ListGroup
                key={group.alley}
                heading={<h2 className="truncate text-sm font-semibold text-ink">{group.alley}</h2>}
                headingTrailing={
                  <span className={`${GROUP_HEADING} shrink-0`}>
                    {group.notes.length} {group.notes.length === 1 ? "lane" : "lanes"}
                  </span>
                }
              >
                {/* The divider clears the 44px lane plate: 12px padding + 44 + 12 gap. */}
                {group.notes.map((n) => (
                  <li key={n.id} className={`${LIST_DIVIDER_BASE} before:left-[4.25rem]`}>
                    <button
                      type="button"
                      onClick={() => setForm({ note: n })}
                      aria-label={`Edit note for ${group.alley} lane ${n.lane}`}
                      className="flex w-full items-center gap-3 p-3 text-left active:bg-surface-muted"
                    >
                      <LaneBadge lane={n.lane} />
                      {n.notes ? (
                        <p className="line-clamp-2 min-w-0 flex-1 break-words text-sm leading-snug text-ink-secondary">
                          {n.notes}
                        </p>
                      ) : (
                        <p className="min-w-0 flex-1 text-sm italic text-ink-tertiary">
                          Nothing written yet
                        </p>
                      )}
                      <ChevronRight
                        size={18}
                        className="shrink-0 text-ink-tertiary"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                ))}
              </ListGroup>
            ))}
          </div>
        </>
      )}
    </section>
  );

  const sheet = form && (
    <LaneNoteFormDialog
      key={form.note?.id ?? "new"}
      note={form.note}
      alleys={alleySuggestions}
      onClose={() => setForm(null)}
      onSaved={() => setForm(null)}
    />
  );

  if (!onBack)
    return (
      <>
        {body}
        {sheet}
      </>
    );

  return (
    <>
      <PushScreen
        mode={mode}
        title="Lane notes"
        onBack={onBack}
        active={form === null}
        trailing={
          <IconButton onClick={() => setForm({ note: null })} label="Add lane note" variant="round">
            <Plus size={24} aria-hidden="true" />
          </IconButton>
        }
      >
        {body}
      </PushScreen>
      {sheet}
    </>
  );
}
