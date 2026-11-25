// "Am I doing too much?" A transparent rule set built from the research notes in docs/overtraining.md.
// The app only sees what you log (days, sets, weights), so this is an early warning for too much load with too little recovery,
// not a diagnosis. Overtraining syndrome itself is rare in lifting and can only be confirmed afterwards; what is common is
// overreaching, and the signs below are the ones the literature and coaches use to catch it early.
import { muscleLoad, setStrength, dayKey, MUSCLE_LABEL } from './stats.js';

const DAY = 86400000;
const NEGLIGIBLE = new Set(['forearms', 'adductors', 'hips', 'shins', 'neck']); // small muscles do not set the alarm off

/** Every number the rules use, so they can be tuned in one place. */
export const LIMITS = {
  streak: [5, 7, 9],          // days in a row without a rest day -> 1, 2, 3 points
  daysInWeek: [6, 7],         // days trained out of the last 7 -> 1, 2 points
  spike: [1.5, 2],            // this week's sets vs your usual week (previous 4 weeks) -> 1, 2 points
  spikeMinSets: 25, usualMinSets: 10, // ignore the ratio when the numbers are tiny
  muscleSets: [25, 35],       // weighted sets for one muscle in 7 days -> 1, 2 points
  drop: 0.95,                 // lifts below 95% of their recent best -> counts
  rest: 3, watch: 2,          // points for "rest" and for "heads up"
};

const pts = (v, steps) => steps.reduce((n, t) => n + (v >= t ? 1 : 0), 0);

/** Consecutive training days ending today (or yesterday, if you have not trained yet today). */
export function trainingStreak(sessions, now = Date.now()) {
  const days = new Set(sessions.filter((s) => s.entries?.length).map((s) => dayKey(s.start)));
  let d = new Date(now); d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d.getTime()))) d = new Date(d.getTime() - DAY);
  let n = 0;
  while (days.has(dayKey(d.getTime()))) { n++; d = new Date(d.getTime() - DAY); }
  return n;
}

/** Median ratio of each lift's best effort in the last 14 days to its best in the 28 days before, for lifts with data in both. */
export function recentStrengthRatio(sessions, exercises, now = Date.now()) {
  const best = { recent: new Map(), before: new Map() };
  for (const s of sessions) {
    if (!s.entries?.length || s.start > now) continue;
    const age = (now - s.start) / DAY;
    const bucket = age <= 14 ? best.recent : age <= 42 ? best.before : null;
    if (!bucket) continue;
    for (const e of s.entries) {
      const type = exercises[e.exerciseId]?.type;
      if (!type) continue;
      const v = Math.max(0, ...(e.sets || []).map((x) => setStrength(type, x)));
      const key = `${e.exerciseId}@${s.gymId}`;
      if (v) bucket.set(key, Math.max(bucket.get(key) || 0, v));
    }
  }
  const r = [...best.recent].filter(([k]) => best.before.has(k)).map(([k, v]) => v / best.before.get(k)).sort((a, b) => a - b);
  if (r.length < 3) return null;
  const m = r.length >> 1;
  return r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2;
}

/**
 * @returns {{level: 'ok'|'watch'|'rest', score: number, reasons: {kind: string, points: number, text: string}[]}}
 * Nothing is flagged when you have already rested (no workout today or yesterday): the load has already eased off.
 */
export function assessLoad(sessions, exercises, now = Date.now()) {
  const lifting = sessions.filter((s) => s.entries?.length);
  const last = lifting.reduce((m, s) => Math.max(m, s.start), 0);
  const trainedRecently = dayKey(last) === dayKey(now) || dayKey(last) === dayKey(now - DAY);
  if (!lifting.length || !trainedRecently) return { level: 'ok', score: 0, reasons: [] };

  const reasons = [];
  const add = (kind, points, text) => { if (points > 0) reasons.push({ kind, points, text }); };

  const streak = trainingStreak(lifting, now);
  const week = new Set(lifting.filter((s) => s.start > now - 7 * DAY && s.start <= now).map((s) => dayKey(s.start))).size;
  const sp = pts(streak, LIMITS.streak), wp = pts(week, LIMITS.daysInWeek);
  if (sp >= wp) add('streak', sp, `${streak} days in a row without a rest day`);
  else add('days', wp, `${week} of the last 7 days trained`);

  const acute = muscleLoad(lifting, exercises, { from: now - 7 * DAY, to: now }, now);
  const before = muscleLoad(lifting, exercises, { from: now - 35 * DAY, to: now - 7 * DAY }, now);
  const usual = before.sets / 4;
  if (acute.sets >= LIMITS.spikeMinSets && usual >= LIMITS.usualMinSets) {
    const ratio = acute.sets / usual;
    add('spike', pts(ratio, LIMITS.spike), `${acute.sets} sets this week, ${ratio.toFixed(1)}× your usual`);
  }

  const top = Object.entries(acute.counts).filter(([k]) => !NEGLIGIBLE.has(k)).sort((a, b) => b[1] - a[1])[0];
  if (top) add('muscle', pts(top[1], LIMITS.muscleSets), `${MUSCLE_LABEL[top[0]]}: ${Math.round(top[1])} sets in 7 days`);

  // a sustained drop in performance is the one sign that is reliable in lifters, but it can also be sleep or stress:
  // it only weighs heavily when the load is high too
  const ratio = recentStrengthRatio(lifting, exercises, now);
  if (ratio != null && ratio <= LIMITS.drop) {
    const loadPoints = reasons.reduce((n, r) => n + r.points, 0);
    add('drop', loadPoints >= 1 ? 2 : 1, `your lifts are ${Math.round((1 - ratio) * 100)}% below where they were a month ago`);
  }

  const score = reasons.reduce((n, r) => n + r.points, 0);
  reasons.sort((a, b) => b.points - a.points);
  return { level: score >= LIMITS.rest ? 'rest' : score >= LIMITS.watch ? 'watch' : 'ok', score, reasons };
}
