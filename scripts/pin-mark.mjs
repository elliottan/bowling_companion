// The mark, as data: the felt, the cream and the pin's outline. Shared by the
// icon generator and the guide cards, so the pin on a home screen and the pin on
// a link preview are one drawing and cannot drift apart.

export const FELT = "#1b5148";
export const CREAM = "#fff8ed";
// The neck bands used to be cut in the background colour, which meant they only
// existed where the pin sat on felt and read as two nicks out of the neck. Real
// pins have red bands, and a red that survives being 1px tall at 48px is a
// saturated one; #c8102e is the red of a house pin.
export const BAND = "#c8102e";

// Pin profile in a 100x154 box: head, neck, shoulder, belly, base. Symmetric
// about x=50, drawn down the right side and back up the left.
export const PIN_W = 100;
export const PIN_H = 154;
export const PIN_PATH = [
  "M 50 5",
  "C 57 5 63 11 63 20",
  "C 63 30 60 40 60 52",
  "C 60 64 63 70 67 80",
  "C 72 91 76 100 76 114",
  "C 76 130 71 143 65 149",
  "L 65 151",
  "L 35 151",
  "L 35 149",
  "C 29 143 24 130 24 114",
  "C 24 100 28 91 33 80",
  "C 37 70 40 64 40 52",
  "C 40 40 37 30 37 20",
  "C 37 11 43 5 50 5",
  "Z"
].join(" ");

