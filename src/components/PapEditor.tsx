import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { FIELD_DENSE_SELECT, FIELD_DENSE_SELECT_NARROW } from "./ui/field";
import {
  EIGHTHS,
  clamp,
  joinInches,
  splitInches,
  type InchParts,
  type PapMeasurement
} from "../lib/ballLayout";

/**
 * The bowler's positive axis point, as the two measurements it is spoken in.
 *
 * It lives here rather than in the layout lab because the PAP is a setting, and
 * two screens show these fields: Settings, which is the one that saves, and the
 * lab, where the same fields are a what-if that is never written back. One
 * component means the two can never disagree about the bounds, the rounding or
 * which way "down" is.
 *
 * Each measurement is one line, and the line reads the way it is said out loud:
 * the number first, then what it is. "5 1/2 over", "1/2 down". The labels used
 * to sit in a band above each row, which cost two bands of a phone screen to
 * name two things a bowler can already read off the row itself, and pushed the
 * ball below the fold on the screen whose whole complaint was that too little
 * fits on it. The names survive as the spoken labels on each control, so
 * nothing is lost to a screen reader.
 */
export function PapEditor({
  pap,
  onChange,
  idPrefix = "pap"
}: {
  pap: PapMeasurement;
  onChange: (next: PapMeasurement) => void;
  /** Distinguishes the two copies when both are mounted, as they are when the
   *  lab is pushed over Settings. */
  idPrefix?: string;
}) {
  const parts = splitInches(pap.up);

  return (
    <>
      <InchField
        label="Over"
        id={`${idPrefix}-over`}
        value={pap.over}
        maxWhole={6}
        onChange={(over) => onChange({ ...pap, over: clamp(over, 0, 6.5) })}
        trailing={<span className="text-sm text-ink-secondary">Over</span>}
      />
      <InchField
        label="Up or down"
        id={`${idPrefix}-up`}
        value={pap.up}
        maxWhole={3}
        onChange={(up) => onChange({ ...pap, up: clamp(up, -3, 3) })}
        trailing={
          // The direction rides the end of the row rather than the start,
          // because it is the word the measurement finishes on. It carries the
          // sign for the whole measurement, not for its integer part: half an
          // inch below the midline is a real PAP and there is no way to write
          // it as a negative zero.
          <Dropdown className="w-[5.25rem]">
            <select
              aria-label="Up or down direction"
              className={FIELD_DENSE_SELECT}
              value={parts.negative ? "down" : "up"}
              onChange={(e) =>
                onChange({
                  ...pap,
                  up: clamp(joinInches({ ...parts, negative: e.target.value === "down" }), -3, 3)
                })
              }
            >
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </Dropdown>
        }
      />
    </>
  );
}

/**
 * A select and the chevron that says it is one.
 *
 * `FIELD_DENSE_SELECT` drops the browser's own arrow (`appearance-none`) and
 * leaves room for a replacement it does not draw, which every other screen gets
 * away with because its selects hold a word. Here two of the three hold a
 * single digit, and a bare box with "5" in it reads as a text field: the
 * chevron is the only thing saying there is a list behind it.
 */
function Dropdown({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`relative shrink-0 ${className}`}>
      {children}
      <ChevronDown
        size={13}
        aria-hidden="true"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-tertiary"
      />
    </div>
  );
}

/**
 * A measurement picked the way it is written: whole inches in one box, the
 * fraction in another, and what it means after both.
 *
 * This replaced a single `type="number"` with `step="0.125"`. Nothing in
 * bowling is measured in decimal inches, so that field asked for a number no
 * bowler has: a PAP is "5 over and a half up", a tape reads in sixteenths, and
 * a drill sheet never carries a decimal point. Worse, the step only bound the
 * spinner arrows, so the keyboard would happily take 5.31 and the ball would
 * quietly move to an axis no pro shop could measure.
 *
 * Every part is a select, and that is the point: a PAP is bounded on both ends
 * (nobody measures 9 inches over), so the whole inches are a list of at most
 * seven, and a list cannot hold a decimal point, a stray digit or a number out
 * of range in the first place. The typed box that used to hold the whole inches
 * had to filter digits and clamp on the way through, and it still drew a
 * different control from the fraction beside it. Two selects of one width and
 * one height read as one measurement.
 */
export function InchField({
  label,
  id,
  value,
  onChange,
  maxWhole,
  trailing
}: {
  label: string;
  id: string;
  value: number;
  onChange: (value: number) => void;
  maxWhole: number;
  /** What the row finishes on: the word the measurement is named by, or the
   *  control that says which way it goes. */
  trailing?: ReactNode;
}) {
  const parts = splitInches(value);
  const emit = (next: Partial<InchParts>) => onChange(joinInches({ ...parts, ...next }));

  return (
    // Each control is sized by its wrapper rather than by a width class on the
    // control itself. `FIELD_DENSE` carries `w-full`, and Tailwind resolves
    // competing utilities by stylesheet order rather than attribute order, so a
    // `w-14` appended to it loses and the row overflows the card. Same trap as
    // the colour rule in docs/DESIGN-LANGUAGE.md §2.
    <div className="flex items-center gap-1.5">
      <Dropdown className="w-[3.5rem]">
        <select
          id={id}
          aria-label={label}
          className={`${FIELD_DENSE_SELECT_NARROW} tabular-nums`}
          value={parts.whole}
          onChange={(e) => emit({ whole: Number(e.target.value) })}
        >
          {Array.from({ length: maxWhole + 1 }, (_, whole) => (
            <option key={whole} value={whole}>
              {whole}
            </option>
          ))}
        </select>
      </Dropdown>
      <Dropdown className="w-[4.5rem]">
        <select
          aria-label={`${label} fraction`}
          className={`${FIELD_DENSE_SELECT_NARROW} tabular-nums`}
          value={parts.eighths}
          onChange={(e) => emit({ eighths: Number(e.target.value) })}
        >
          {EIGHTHS.map((fraction, eighths) => (
            <option key={eighths} value={eighths}>
              {fraction}
            </option>
          ))}
        </select>
      </Dropdown>
      {trailing}
    </div>
  );
}
