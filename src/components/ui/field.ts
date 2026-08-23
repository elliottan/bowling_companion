/**
 * Field chrome, as one string rather than a copy per form. Seven forms had
 * spelled it out by hand and five of those copies had lost `bg-surface`, so
 * every input in them fell back to the browser's own control background: a
 * warm grey block sitting in a blue-slate app. Same class of bug as the
 * hardcoded `slate-100` in `docs/DESIGN-LANGUAGE.md` §3, one level down.
 */
export const FIELD =
  "h-11 w-full min-w-0 box-border rounded-lg border border-edge-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary outline-none focus:border-accent-fill focus:ring-2 focus:ring-accent-fill/20";

/** The same chrome for a `<select>`, which needs room for its own chevron. */
export const FIELD_SELECT = `${FIELD} appearance-none pr-10`;

/** The same chrome for a multi-line field, which sizes by `rows` not height. */
export const FIELD_TEXTAREA = `${FIELD.replace("h-11", "min-h-11 py-2")} resize-none`;

/** Label above a field (§6). Sentence case, because it is a label and not one
 *  of the small uppercase group headings. */
export const FIELD_LABEL = "mb-1 block text-sm font-medium text-ink-strong";

/**
 * The dense score panels' field label. It used to be parked on the field's own
 * top border as an outline notch, which only works while the label is short
 * relative to the box: STANCE and TARGET are nearly as wide as the numeric
 * fields they name, so the notch ate the whole top edge and read as a label
 * dropped on top of the box. A plain band above costs 13px and reads.
 */
export const FIELD_MICRO_LABEL =
  "mb-0.5 block text-[10px] font-semibold uppercase leading-none tracking-[0.02em] text-ink-secondary";
