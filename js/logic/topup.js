// "Complete the week": a short workout (three exercises) that fills the muscles the last 7 days left behind, so the body map
// ends up evenly lit. Pure functions; the screen only shows the result.
import { weightsFor } from './muscles.js';
import { availableAt } from './substitution.js';
import { lastFor } from './workout.js';

/** Working sets per week that count as "done" for each muscle (the map is fully orange at 10). */
export const WEEK_TARGET = { chest: 10, shoulders: 10, rearDelts: 10, biceps: 10, triceps: 10, lats: 10, upperBack: 10, lowerBack: 6, abs: 10, glutes: 10, quads: 10, hamstrings: 10, calves: 10, forearms: 4, adductors: 4, shins: 3 };
/**
 * Not every muscle matters the same: big legs and back muscles, abs and rear delts (posture) come first;
 * arms and small muscles last. A missing set of quads is worth more than a missing set of biceps.
 */
export const PRIORITY = { quads: 1.2, hamstrings: 1.1, glutes: 1.1, lats: 1.1, upperBack: 1.1, chest: 1, abs: 1, rearDelts: 1, shoulders: 0.9, calves: 0.9, biceps: 0.7, triceps: 0.7, lowerBack: 0.6, forearms: 0.25, adductors: 0.3, shins: 0.2 };

const SKIP = new Set(['deadlift', 'trap-bar-deadlift-with-low-handles', 'kettlebell-swing', 'farmer-s-walk']); // too taxing or awkward for a top-up
const HEAVY = new Set(['squat', 'front-squat', 'bench-press', 'incline-bench-press', 'overhead-press', 'barbell-row']); // fine, but not the first choice
const POSTURE = ['face-pull', 'cable-external-shoulder-rotation'];
const MOBILITY = ['open-book', 'cat-cow', 'lunge-with-thoracic-rotation', '90-90-hip-switch', 'hip-flexor-stretch', 'hamstring-stretch'];
const MIN_GAIN = 1.2;   // a pick must be worth at least this much (see `gain` below)
const SLOTS = 3;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** @returns {{items: Array, gaps: Array, complete: boolean}} items: {exerciseId, sets, repMin, repMax, kind: 'gap'|'posture'|'mobility', reason} */
export function planTopUp({ counts, exercises, gym, sessions = [], now = Date.now() }) {
  const done = (k) => counts[k] || 0;
  const rem = Object.fromEntries(Object.keys(WEEK_TARGET).map((k) => [k, Math.max(0, WEEK_TARGET[k] - done(k))]));
  const gaps = Object.keys(WEEK_TARGET).filter((k) => rem[k] >= 2).map((k) => ({ key: k, done: done(k), target: WEEK_TARGET[k], score: rem[k] * PRIORITY[k] }))
    .sort((a, b) => b.score - a.score);

  const usable = exercises.filter((e) => e && gym && availableAt(e, gym));
  const pool = usable.filter((e) => weightsFor(e) && !SKIP.has(e.id));
  const familiar = (e) => !!lastFor(sessions, e.id, gym.id);
  const items = [];
  const chosen = new Set();

  const usedMain = new Set();
  const mainOf = (w) => Object.keys(w).filter((k) => w[k] >= 0.75 && PRIORITY[k]).sort((a, b) => PRIORITY[b] * rem[b] - PRIORITY[a] * rem[a])[0];
  while (items.length < SLOTS) {
    let best = null;
    for (const e of pool) {
      if (chosen.has(e.id)) continue;
      const w = weightsFor(e);
      const main = mainOf(w);
      if (!main || usedMain.has(main)) continue; // one exercise per main muscle: a short session should cover different gaps
      // a big gap counts much more than several small ones: each muscle adds (sets it could still use) x priority x how empty it is
      let g = 0;
      for (const [k, wt] of Object.entries(w)) if (PRIORITY[k]) g += PRIORITY[k] * Math.min(rem[k] || 0, 4 * wt) * ((rem[k] || 0) / WEEK_TARGET[k]);
      g *= (HEAVY.has(e.id) ? 0.7 : 1) * (e.type === 't' ? 0.8 : 1) * (familiar(e) ? 1.15 : 1);
      if (!best || g > best.g) best = { e, w, g, main };
    }
    if (!best || best.g < MIN_GAIN) break;
    const { e, w, main } = best;
    usedMain.add(main);
    const sets = clamp(Math.ceil((rem[main] || 0) / w[main]), 2, 4);
    const was = done(main);
    for (const [k, wt] of Object.entries(w)) if (rem[k] != null) rem[k] = Math.max(0, rem[k] - sets * wt);
    chosen.add(e.id);
    const type = e.type || 'wr';
    items.push({ exerciseId: e.id, sets, repMin: type === 't' ? null : type === 'rr' ? 12 : 10, repMax: type === 't' ? null : type === 'rr' ? 20 : 15, kind: 'gap', main, reason: { key: main, done: was, target: WEEK_TARGET[main] } });
  }

  // free slots go to posture and mobility, whichever you did the longest ago
  const sinceDone = (id) => { let t = 0; for (const s of sessions) if (s.entries?.some((x) => x.exerciseId === id && x.sets?.some((y) => y.done !== false))) t = Math.max(t, s.start); return t; };
  const byId = Object.fromEntries(usable.map((e) => [e.id, e]));
  const oldest = (ids) => ids.filter((id) => byId[id] && !chosen.has(id)).sort((a, b) => sinceDone(a) - sinceDone(b))[0];
  const health = (id, kind) => {
    const e = byId[id]; const type = e.type || 'wr';
    chosen.add(id);
    items.push({ exerciseId: id, sets: kind === 'posture' ? 3 : 2, repMin: type === 't' ? null : kind === 'posture' ? 12 : 8, repMax: type === 't' ? null : kind === 'posture' ? 15 : 10, kind, reason: null });
  };
  if (items.length < SLOTS) { const p = oldest(POSTURE); if (p) health(p, 'posture'); }
  while (items.length < SLOTS) { const m = oldest(MOBILITY); if (!m) break; health(m, 'mobility'); }

  return { items, gaps, complete: !items.some((i) => i.kind === 'gap') };
}
