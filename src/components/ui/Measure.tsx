import { splitFractionRuns } from "../../lib/ballLayout";

/**
 * A measurement with its fractions set a step smaller than its whole numbers.
 *
 * Bowling writes every distance as a mixed fraction: `4 1/2"` pin to PAP, a
 * `2 3/8"` buffer, a PAP `5 1/2` over. Set at one weight the fraction is three
 * characters wide and reads as loudly as the number it belongs to, so `4 1/2 x 45`
 * lands on the eye as a row of digits with punctuation in it. A step down in
 * size is what typesetting has always done with a fraction, and it is what
 * makes the whole inches read first and the fraction read as attached to them.
 *
 * The inch mark rides with the fraction (`splitFractionRuns` keeps them in one
 * run), so a bare `1/2"` shrinks whole instead of leaving a full-size quote
 * hanging off a small fraction.
 *
 * The text is unchanged: this only sizes runs of it. The accessible name of
 * whatever contains this is still the plain string, which is the whole reason
 * the fraction is a `<span>` and not a `<sup>`/`<sub>` pair.
 */
export function Measure({ children }: { children: string }) {
  return (
    <>
      {splitFractionRuns(children).map((run, i) =>
        run.fraction ? (
          <span key={i} className="text-[0.8em] leading-none">
            {run.text}
          </span>
        ) : (
          <span key={i}>{run.text}</span>
        )
      )}
    </>
  );
}
