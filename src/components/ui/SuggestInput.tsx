import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { FIELD } from "./field";

export interface Suggestion {
  /** What lands in the field when it is picked. */
  value: string;
  /** What the list shows, where it says more than the value: a pattern's
   *  length before its name, say. Matched against as well as the value. */
  label?: string;
}

interface SuggestInputProps {
  id?: string;
  value: string;
  onChange: (text: string) => void;
  /** Every suggestion; the field narrows them to what is typed. */
  suggestions: readonly (string | Suggestion)[];
  /** A suggestion was tapped. Defaults to `onChange` with its value. */
  onPick?: (value: string) => void;
  /** The field lost focus, for a caller that only takes a known value and
   *  puts the field back when what was typed is not one. */
  onCommit?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  /** The input's classes, for a field off the app's surface (the dark lane). */
  className?: string;
  /** The list's colours, likewise. */
  tone?: "surface" | "dark";
  /** How many suggestions show at once. */
  limit?: number;
}

/**
 * A text field that offers what has been typed here before, the way alley and
 * description always have: focus shows them, typing narrows them, a tap fills
 * the field in. One component so every field that suggests behaves the same,
 * where each used to carry its own copy of the list.
 *
 * Narrowing matches anywhere in the words, not just the start ("street" finds
 * Main Street), and leaves out the entry already typed in full, since offering
 * what is already there is noise.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  onPick,
  onCommit,
  placeholder,
  ariaLabel,
  className = FIELD,
  tone = "surface",
  limit = 6
}: SuggestInputProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const all = suggestions.map((s) => (typeof s === "string" ? { value: s } : s));
    const list = q
      ? all.filter((s) => {
          const v = s.value.toLowerCase();
          return v !== q && (v.includes(q) || (s.label ?? "").toLowerCase().includes(q));
        })
      : all;
    return list.slice(0, limit);
  }, [value, suggestions, limit]);

  const list = tone === "dark" ? "border-white/20 bg-slate-800" : "border-edge bg-surface";
  const item = tone === "dark" ? "text-white hover:bg-white/10" : "text-ink-strong hover:bg-surface-muted";

  return (
    <div className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() =>
          // Late enough for a tap on a suggestion to land first.
          setTimeout(() => {
            setOpen(false);
            onCommit?.();
          }, 120)
        }
        className={className}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
      />
      {open && matches.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border py-1 shadow-lg ${list}`}
        >
          {matches.map((s, i) => (
            // By position too: two entries can share a value, and a repeated
            // key leaves stale rows on screen as the list narrows.
            <li key={`${i}:${s.value}`} role="option" aria-selected={false}>
              <button
                type="button"
                // Keeps focus in the field, so the blur above does not close
                // the list out from under the tap.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  (onPick ?? onChange)(s.value);
                  setOpen(false);
                }}
                className={`block w-full px-3 py-2 text-left text-sm ${item}`}
              >
                {s.label ?? s.value}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ChoiceInputProps {
  id?: string;
  /** The value chosen, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  options: readonly (string | Suggestion)[];
  /** Shown while nothing is chosen: what none means here ("All patterns"). */
  placeholder?: string;
  ariaLabel?: string;
  /** Names the clear button, which shows while something is chosen. */
  clearLabel?: string;
  className?: string;
  tone?: "surface" | "dark";
}

/**
 * The suggesting field for a choice among known values, a filter or a picker,
 * where a value nobody has is not something to keep. Typing narrows the
 * options and a tap chooses one. Leaving the field takes what was typed when it
 * names an option in full, clears the choice when the field was emptied, and
 * otherwise puts the field back as it was.
 */
export function ChoiceInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  clearLabel,
  className = FIELD,
  tone = "surface"
}: ChoiceInputProps) {
  // What is being typed, or null while the field shows the choice itself.
  const [draft, setDraft] = useState<string | null>(null);
  const values = useMemo(() => options.map((o) => (typeof o === "string" ? o : o.value)), [options]);

  function commit() {
    if (draft == null) return;
    const q = draft.trim().toLowerCase();
    const named = values.find((v) => v.toLowerCase() === q);
    if (q === "") onChange("");
    else if (named !== undefined) onChange(named);
    setDraft(null);
  }

  return (
    <div className="relative">
      <SuggestInput
        id={id}
        value={draft ?? value}
        onChange={setDraft}
        suggestions={options}
        onPick={(v) => {
          setDraft(null);
          onChange(v);
        }}
        onCommit={commit}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        className={clearLabel ? `${className} pr-10` : className}
        tone={tone}
      />
      {clearLabel && (draft ?? value) !== "" && (
        <button
          type="button"
          aria-label={clearLabel}
          // Not through the field's blur, which would commit the half-typed
          // text a moment after this cleared it.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft(null);
            onChange("");
          }}
          className={`absolute right-1 top-0 flex h-full w-9 items-center justify-center ${
            tone === "dark" ? "text-white/60" : "text-ink-tertiary hover:text-ink-secondary"
          }`}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
