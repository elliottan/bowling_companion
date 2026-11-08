import { plural, t } from "@lingui/core/macro";
import { ChevronRight } from "lucide-react";
import { Button } from "./Button";

/**
 * The way from a card to its whole list: a glass pill the card's width, at its
 * foot, where the thumb is once the card has been read (ADR-196). It used to
 * be a line of accent text in the card's top corner, "View all 78 leaves",
 * which read as a link in a heading and was a small target. The count stays,
 * so the bowler knows the size of what is behind it; the noun is for a screen
 * reader, since the card's heading already says what is counted.
 */
export function ViewAll({ count, noun, onClick }: { count: number; noun: "leaves" | "balls"; onClick: () => void }) {
  const spoken =
    noun === "leaves"
      ? plural(count, {
          one: "View all # leave",
          other: "View all # leaves"
        })
      : plural(count, {
          one: "View all # ball",
          other: "View all # balls"
        });
  return (
    <Button variant="glass" onClick={onClick} className="mt-3 w-full" aria-label={spoken}>
      {t`View all ${{ count }}`}
      <ChevronRight size={16} aria-hidden="true" className="-mr-1" />
    </Button>
  );
}
