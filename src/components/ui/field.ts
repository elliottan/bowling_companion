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

/**
 * The dense variant, for the score panels: the shot detail bar, the spare line
 * boards. They sit two to a row beside a pin deck on a 390px screen, where a
 * 44px field would push the deck off the fold, so they are shorter than the
 * tap-target minimum on purpose. Everything else about them, the border, the
 * surface, the focus ring, is the same chrome as a full-size field, which is
 * the point: this exists so the three panels that need it stop each inventing
 * their own and losing `bg-surface` on the way (§6).
 */
export const FIELD_DENSE =
  "h-9 w-full min-w-0 box-border rounded-lg border border-edge-strong bg-surface-muted px-2 text-sm text-ink placeholder:text-ink-tertiary outline-none focus:border-accent-fill focus:bg-surface";

/** The dense chrome for a multi-line field. */
export const FIELD_DENSE_TEXTAREA = `${FIELD_DENSE.replace("h-9", "min-h-9 py-1.5")} resize-none leading-snug`;

/** The dense chrome for a `<select>`, which needs room for its own chevron. */
export const FIELD_DENSE_SELECT = `${FIELD_DENSE} appearance-none pr-8`;
