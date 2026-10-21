/**
 * How far in from the plot's sides the first and last points sit.
 *
 * A trend chart's average label is printed at the trailing end of its dashed
 * line, which is where the latest point is drawn. With a handful of points
 * there is room to spare, so the ends come in far enough that the last point
 * and its value clear the label; past that the points need the width, and they
 * run to the edges.
 */
export function trendInset(points: number, edge = 14, roomy = 46, roomyUpTo = 5): number {
  return points <= roomyUpTo ? roomy : edge;
}

/**
 * Where the dashed average line's label goes, as an SVG baseline y.
 *
 * It sits at the trailing end of the line, which is also where the latest
 * point is drawn, so it takes the side of the line that is clear of that point
 * and of the value printed over it (`lastHasValue`, 8px above the point and
 * about 10px tall). The label once went to the side opposite the dot and still
 * landed on the dot's own number ("avg 193" over "193") whenever the point sat
 * just under the line. Opposite the point is tried first; if neither side is
 * clear, it goes above the point's value, where nothing else is drawn.
 *
 * `avgY` and `lastPointY` are SVG y coordinates (down is larger).
 */
export function averageLabelY(avgY: number, lastPointY: number, fontSize = 9, lastHasValue = false): number {
  const gap = 4;
  const above = { base: avgY - gap, top: avgY - gap - fontSize, bottom: avgY - gap };
  const below = { base: avgY + gap + fontSize, top: avgY + gap, bottom: avgY + gap + fontSize };
  const obstacles: Array<[number, number]> = [[lastPointY - 5, lastPointY + 5]];
  if (lastHasValue) obstacles.push([lastPointY - 18, lastPointY - 6]);
  const clear = (slot: typeof above) => obstacles.every(([top, bottom]) => bottom <= slot.top || top >= slot.bottom);
  const preferred = lastPointY < avgY ? [below, above] : [above, below];
  const free = preferred.find(clear);
  if (free) return free.base;
  return lastHasValue ? Math.min(above.base, lastPointY - 20) : preferred[0].base;
}
