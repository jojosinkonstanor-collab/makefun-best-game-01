// FEVER: when the warden's kill combo reaches 8, the ember burns hotter —
// every kill scores double while the combo holds. The combo timer (2.5 s
// without a kill) ends the fever by itself, so it rewards aggressive play.
export const FEVER_COMBO = 8;
export const FEVER_MULT = 2;

/** Is this combo hot enough for fever? */
export function isFever(combo) {
  return combo >= FEVER_COMBO;
}

/** Score multiplier for a kill at this combo (before the combo's own ramp). */
export function feverMult(combo) {
  return isFever(combo) ? FEVER_MULT : 1;
}
