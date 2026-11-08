import type { ReactNode } from "react";
import { longestWordEm } from "../../lib/headingWidth";

/**
 * Text that never breaks inside a word, in a box that can be narrower than
 * one: a quarter of a phone at the largest text size is narrower than
 * "Deslizamiento". Rather than split it ("Desliza" / "miento"), the type
 * shrinks until the longest word fits on a line of its own, and only then:
 * where the word fits, it is drawn at the size it was given.
 *
 * The box is a size container, so `100cqi` is its width, and the type is the
 * smaller of the inherited size and that width over the longest word's
 * estimated width in em (`longestWordEm`, generous on purpose, and a
 * little more). Lines still
 * wrap between words as usual.
 */
export function WholeWords({
  text,
  upper = false,
  className = "",
  children
}: {
  /** What is drawn, measured for its longest word. */
  text: string;
  /** Drawn in capitals, which are wider. */
  upper?: boolean;
  /** Classes for the text itself: `block`, or a line clamp, which needs its
   *  own display and so must not be given `block` beside it. */
  className?: string;
  /** Drawn instead of `text`, when it carries markup. */
  children?: ReactNode;
}) {
  // A little over the estimate, for letter spacing and the faces that run
  // wider than it: a word a pixel too wide still breaks.
  const em = longestWordEm(text, upper) * 1.06;
  return (
    <span className="block w-full [container-type:inline-size]">
      <span className={className} style={{ fontSize: em > 0 ? `min(1em, calc(100cqi / ${em.toFixed(2)}))` : undefined }}>
        {children ?? text}
      </span>
    </span>
  );
}
