/**
 * Where the dashed average line's label goes. It sits at the trailing end of
 * the line, which is also where the latest point is drawn, so on the side the
 * point is on the two collided ("avg ●93"). The label takes the other side.
 *
 * `avgY` and `lastPointY` are SVG y coordinates (down is larger). Returns the
 * label's baseline y: just above the line when the point is below it or level
 * with it, just below the line when the point is above it.
 */
export function averageLabelY(avgY: number, lastPointY: number, fontSize = 9): number {
  const gap = 4;
  return lastPointY < avgY ? avgY + gap + fontSize : avgY - gap;
}
