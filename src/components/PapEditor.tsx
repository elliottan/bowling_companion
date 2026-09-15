import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { FIELD_DENSE_SELECT, FIELD_MICRO_LABEL } from "./ui/field";
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
 * It lives here rather than in the layout lab because the PAP is a setting: the
 * lab edits it, Settings edits it, and both write the same stored measurement.
 * One component means the two can never disagree about the bounds, the rounding
 * or which way "down" is.
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
  return (
    <>
      <InchField
        label="Over"
        id={`${idPrefix}-over`}
        value={pap.over}
        maxWhole={6}
        onChange={(over) => onChange({ ...pap, over: clamp(over, 0, 6.5) })}
      />
      <InchField
        label="Up or down"
        id={`${idPrefix}-up`}
        value={pap.up}
        maxWhole={3}
        signed
        onChange={(up) => onChange({ ...pap, up: clamp(up, -3, 3) })}
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
        size={14}
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-tertiary"
      />
    </div>
  );
}

/**
 * A measurement picked the way it is written: whole inches in one box, the
 * fraction in another, and the unit spelled out after both.
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
 * different control from the fraction beside it. Three selects of one width and
 * one height read as one measurement.
 *
 * `signed` adds the direction select for a measurement that can sit either side
 * of the midline; the sign rides the whole measurement rather than its integer
 * part, because half an inch below the line cannot be written as a negative
 * zero.
 */
export function InchField({
  label,
  id,
  value,
  onChange,
  maxWhole,
  signed = false
}: {
  label: string;
  id: string;
  value: number;
  onChange: (value: number) => void;
  maxWhole: number;
  signed?: boolean;
}) {
  const parts = splitInches(value);
  const emit = (next: Partial<InchParts>) => onChange(joinInches({ ...parts, ...next }));

  return (
    <div>
      <span className={FIELD_MICRO_LABEL} id={`${id}-label`}>
        {label}
      </span>
      {/* Each control is sized by its wrapper rather than by a width class on
          the control itself. `FIELD_DENSE` carries `w-full`, and Tailwind
          resolves competing utilities by stylesheet order rather than attribute
          order, so a `w-14` appended to it loses and the row overflows the
          card. Same trap as the colour rule in docs/DESIGN-LANGUAGE.md §2. */}
      <div className="flex items-center gap-2">
        {/* Direction first, because it is read first: "half an inch down". A
            row without one indents by the same width, so the whole inches of
            both measurements line up in a column. */}
        {signed ? (
          <Dropdown className="w-[5.5rem]">
            <select
              aria-label={`${label} direction`}
              className={FIELD_DENSE_SELECT}
              value={parts.negative ? "down" : "up"}
              onChange={(e) => emit({ negative: e.target.value === "down" })}
            >
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </Dropdown>
        ) : (
          <span aria-hidden="true" className="w-[5.5rem] shrink-0" />
        )}
        <Dropdown className="w-[5rem]">
          <select
            id={id}
            aria-labelledby={`${id}-label`}
            className={`${FIELD_DENSE_SELECT} tabular-nums`}
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
        <Dropdown className="w-[5rem]">
          <select
            aria-label={`${label} fraction`}
            className={`${FIELD_DENSE_SELECT} tabular-nums`}
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
        <span className="text-sm text-ink-secondary">in</span>
      </div>
    </div>
  );
}
