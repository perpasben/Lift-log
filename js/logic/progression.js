// Double progression: hit the top of the rep range on every working set -> add one increment.
export function roundToStep(w, step) {
  return Math.round(w / step) * step;
}

/**
 * @param {{w:number,r:number,warm?:boolean,done?:boolean}[]} lastSets  last session's sets for this exercise at this gym
 * @param {{repMin:number,repMax:number,increment:number}} p
 * @returns {{weight:number|null, reps:number|null, bumped:boolean}}
 */
export function suggestNext(lastSets, { repMin, repMax, increment }) {
  const work = (lastSets || []).filter((s) => !s.warm && s.done !== false && s.w != null);
  if (!work.length) return { weight: null, reps: null, bumped: false };
  const allTop = work.every((s) => s.r >= repMax);
  const top = Math.max(...work.map((s) => s.w));
  if (allTop) return { weight: round(top + increment), reps: repMin, bumped: true };
  // keep the heaviest weight, aim at the best reps achieved +1 (capped at the range top)
  const atTop = work.filter((s) => s.w === top);
  const best = Math.max(...atTop.map((s) => s.r));
  return { weight: top, reps: Math.min(repMax, Math.max(repMin, best + 1)), bumped: false };
}

function round(n) {
  return Math.round(n * 100) / 100;
}
