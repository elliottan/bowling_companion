import { t } from "@lingui/core/macro";
import { Search, X } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FIELD_SEARCH } from "./field";

/**
 * A search field as iOS draws one (ADR-236): a magnifying glass leading the
 * box, a filled clear button trailing it once there is text, and Cancel
 * sliding in beside it while the search is live. The plain filled box it
 * replaces read as one more text field in a form, where this says "this
 * narrows the list under me".
 *
 * Live means focused or holding text, as a UISearchController stays active
 * after the keyboard goes until Cancel is tapped. Cancel empties the search
 * and lets the keyboard go; clear empties it and keeps the keyboard, which is
 * the difference between the two on the phone. Escape is Cancel and the
 * keyboard's Search key just lets the keyboard go, because the list already
 * filters as you type.
 *
 * Both buttons keep the field focused through the press (`pointerdown` is
 * cancelled), so the blur cannot collapse Cancel out from under the finger
 * before its click lands.
 */
export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  autoFocus = false,
  className = ""
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** The accessible name, where the placeholder alone does not say enough. */
  label?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(autoFocus);
  const live = focused || value !== "";

  const keepFocus = (e: PointerEvent) => e.preventDefault();

  const cancel = () => {
    onChange("");
    inputRef.current?.blur();
    setFocused(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      // A sheet would otherwise take Escape as its own close.
      e.stopPropagation();
      cancel();
    } else if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <div className={`flex min-w-0 items-center ${className}`.trim()}>
      <div className="relative min-w-0 flex-1">
        <Search
          size={17}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={placeholder ?? t`Search`}
          aria-label={label}
          className={`${FIELD_SEARCH} search-field pl-9 pr-10`}
        />
        {value !== "" && (
          <button
            type="button"
            aria-label={t`Clear search`}
            onPointerDown={keepFocus}
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center active:opacity-60"
          >
            {/* xmark.circle.fill: a grey disc with the mark knocked out of it. */}
            <span className="flex h-[17px] w-[17px] items-center justify-center rounded-full bg-ink-tertiary text-surface">
              <X size={11} strokeWidth={3} aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      {/* Always mounted, so it can slide out as it slid in (§7). Collapsed, it
          is out of the tab order and hidden from assistive tech. */}
      <button
        type="button"
        onPointerDown={keepFocus}
        onClick={cancel}
        tabIndex={live ? 0 : -1}
        aria-hidden={!live}
        className={`h-11 shrink-0 overflow-hidden whitespace-nowrap text-body text-accent transition-[max-width,opacity,margin] duration-200 ease-out active:opacity-60 motion-reduce:transition-none ${
          live ? "ml-3 max-w-[10rem] opacity-100" : "pointer-events-none ml-0 max-w-0 opacity-0"
        }`}
      >
        {t`Cancel`}
      </button>
    </div>
  );
}
