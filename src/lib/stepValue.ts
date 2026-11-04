/** One step from `value` in `dir`, landing on the step grid: from a typed
 *  15.3 with half-board steps, up is 15.5 and down is 15, not 15.8 and 14.8. */
export function stepValue(value: number, step: number, dir: 1 | -1, min: number, max: number): number {
  const units = value / step;
  const snapped = dir > 0 ? Math.floor(units + 1e-9) + 1 : Math.ceil(units - 1e-9) - 1;
  // Rounded off the float: 0.5 steps summed drift to 15.499999.
  const next = Math.round(snapped * step * 1000) / 1000;
  return Math.max(min, Math.min(max, next));
}
