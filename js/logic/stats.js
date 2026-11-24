// Calendar and progress helpers. Pure functions over stored sessions.
export const dayKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Monday-first month grid. Each cell: {key, day, inMonth, sessions[]} */
export function monthGrid(year, month, sessions) {
  const by = new Map();
  for (const s of sessions) { const k = dayKey(s.start); if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(year, month, 1 - lead);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = dayKey(dt.getTime());
      row.push({ key, day: dt.getDate(), inMonth: dt.getMonth() === month, sessions: by.get(key) || [] });
    }
    if (w >= 4 && !row.some((c) => c.inMonth)) break; // drop a trailing empty week
    weeks.push(row);
  }
  const inMonth = sessions.filter((s) => { const d = new Date(s.start); return d.getFullYear() === year && d.getMonth() === month; });
  const minutes = inMonth.reduce((n, s) => n + Math.max(0, Math.round((s.end - s.start) / 60000)), 0);
  return { weeks, count: inMonth.length, minutes };
}

export const est1rm = (w, r) => (!r || r <= 0 ? 0 : r === 1 ? w : Math.round(w * (1 + r / 30) * 10) / 10);

export function metricsFor(type) {
  if (type === 't') return [['time', 'Best time']];
  if (type === 'rr') return [['reps', 'Reps']];
  if (type === 'bw') return [['reps', 'Best reps'], ['top', 'Extra kg']];
  return [['top', 'Top weight'], ['e1rm', 'Est. 1RM'], ['volume', 'Volume']];
}

/** Ascending series [{t, v}] of one metric for an exercise at a gym (gymId null = all gyms). */
export function exerciseSeries(sessions, exerciseId, gymId, metric) {
  const out = [];
  for (const s of [...sessions].sort((a, b) => a.start - b.start)) {
    if (gymId && s.gymId !== gymId) continue;
    const e = s.entries.find((x) => x.exerciseId === exerciseId);
    if (!e) continue;
    const sets = e.sets.filter((x) => !x.warm && x.done !== false);
    if (!sets.length) continue;
    let v;
    if (metric === 'top') v = Math.max(...sets.map((x) => x.w || 0));
    else if (metric === 'e1rm') v = Math.max(...sets.map((x) => est1rm(x.w || 0, x.r || 0)));
    else if (metric === 'volume') v = sets.reduce((n, x) => n + (x.w || 0) * (x.r || 0), 0);
    else if (metric === 'time') v = Math.max(...sets.map((x) => x.t || 0));
    else v = Math.max(...sets.map((x) => x.r || 0));
    out.push({ t: s.start, v: Math.round(v * 10) / 10, sessionId: s.id });
  }
  return out;
}

/** Round axis range to tidy ticks. */
export function niceRange(min, max, ticks = 3) {
  if (min === max) { const pad = Math.max(1, Math.abs(min) * 0.1); min -= pad; max += pad; }
  const span = max - min;
  const raw = span / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const vals = [];
  for (let v = lo; v <= hi + step / 2; v += step) vals.push(Math.round(v * 100) / 100);
  return { lo, hi, step, ticks: vals };
}

/* ---------- muscle load (map of what was trained) ---------- */
export const MUSCLE_KEY = { Chest: 'chest', Shoulders: 'shoulders', 'Rear delts': 'rearDelts', 'Rotator cuff': 'rearDelts', Triceps: 'triceps', Biceps: 'biceps', Back: 'back', Quads: 'quads', Hamstrings: 'hamstrings', Glutes: 'glutes', Calves: 'calves', Abs: 'abs' };
export const MUSCLE_LABEL = { chest: 'Chest', shoulders: 'Shoulders', rearDelts: 'Rear delts', biceps: 'Biceps', triceps: 'Triceps', back: 'Back', abs: 'Abs', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves' };

/**
 * Working sets per muscle over a rolling window.
 * range: {days:n} (rolling, ends now) or {workouts:n} (latest n sessions that have lifting entries).
 */
export function muscleLoad(sessions, exercises, range, now = Date.now()) {
  let used = [...sessions].filter((s) => s.entries.length).sort((a, b) => b.start - a.start);
  if (range.workouts) used = used.slice(0, range.workouts);
  else used = used.filter((s) => s.start > now - range.days * 86400000 && s.start <= now);
  const counts = {}, last = {};
  for (const s of used) for (const e of s.entries) {
    const key = MUSCLE_KEY[exercises[e.exerciseId]?.muscle];
    if (!key) continue;
    const n = e.sets.filter((x) => !x.warm && x.done !== false).length;
    if (n) { counts[key] = (counts[key] || 0) + n; last[key] = Math.max(last[key] || 0, s.start); }
  }
  return { counts, last, sessions: used.length, from: used.length ? used.at(-1).start : null };
}

/** Mix grey -> accent by intensity 0..1 (returns #rrggbb). */
export function heat(count, full = 10) {
  const t = count > 0 ? 0.3 + 0.7 * Math.min(1, count / full) : 0;
  const a = [45, 45, 51], b = [255, 107, 31];
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** "today", "yesterday", "3 days ago" */
export function ago(ms, now = Date.now()) {
  const d = Math.floor((now - ms) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/* ---------- "Tip": what got a lot of work and what was neglected ---------- */
export const TIP_GROUPS = { chest: ['chest'], back: ['back'], shoulders: ['shoulders', 'rearDelts'], arms: ['biceps', 'triceps'], legs: ['quads', 'hamstrings', 'glutes', 'calves'] };
const TIP_COVERS = { push: ['chest', 'shoulders', 'arms'], pull: ['back', 'arms', 'shoulders'], leg: ['legs'] };
const TIP_NEXT = { push: 'Push', pull: 'Pull', leg: 'Leg' };
const listWords = (a) => (a.length === 2 ? `${a[0]} and ${a[1]}` : a[0]);

/**
 * One or two plain sentences, or null when there is nothing useful to say.
 * counts: working sets per muscle over the last two weeks (see muscleLoad).
 */
export function trainingTip(counts, nextRoutineId) {
  const g = Object.fromEntries(Object.entries(TIP_GROUPS).map(([k, keys]) => [k, keys.reduce((n, m) => n + (counts[m] || 0), 0)]));
  const total = Object.values(g).reduce((a, b) => a + b, 0);
  if (total < 8) return null; // not enough recent training to say anything
  const avg = total / Object.keys(g).length;
  const asc = Object.entries(g).sort((a, b) => a[1] - b[1]);
  const much = [...asc].reverse().filter(([, n]) => n >= Math.max(10, avg * 1.2)).slice(0, 2).map((e) => e[0]);
  const little = asc.filter(([k, n]) => n <= Math.max(2, avg * 0.35) && !much.includes(k)).slice(0, 2).map((e) => e[0]);
  if (!much.length && !little.length) return null;
  let text;
  if (much.length && little.length) text = `You trained ${listWords(much)} a lot in the past two weeks and neglected ${listWords(little)}.`;
  else if (little.length) text = `You haven't trained ${listWords(little)} much in the past two weeks.`;
  else text = `You trained ${listWords(much)} the most in the past two weeks. Nothing is falling behind.`;
  if (little.length && TIP_COVERS[nextRoutineId]?.some((k) => little.includes(k))) text += ` ${TIP_NEXT[nextRoutineId]} is up next, which helps.`;
  return text;
}

/* ---------- carousel insights ---------- */
/** Workouts per rolling 7-day bucket, oldest first; the last bucket is "the last 7 days". */
export function weeklyCounts(sessions, now = Date.now(), weeks = 6) {
  const out = Array(weeks).fill(0);
  for (const s of sessions) {
    if (!s.entries?.length) continue;
    const age = now - s.start;
    if (age < 0) continue;
    const i = Math.floor(age / (7 * 86400000));
    if (i < weeks) out[weeks - 1 - i]++;
  }
  return out;
}

/**
 * The most useful progress note about one lift at one gym over the last `days`:
 *  - stall: the same top set (weight x reps, or reps for bodyweight) for 4+ workouts in a row
 *  - gain: biggest improvement since the first workout in the window
 * Returns null when nothing stands out.
 */
export function progressInsight(sessions, exercises, gyms, now = Date.now(), days = 120) {
  const since = now - days * 86400000;
  const inc = Object.fromEntries(gyms.map((g) => [g.id, g.increment || 2.5]));
  const by = new Map();
  for (const s of [...sessions].sort((a, b) => a.start - b.start)) {
    if (s.start < since) continue;
    for (const e of s.entries) {
      const sets = e.sets.filter((x) => !x.warm && x.done !== false);
      if (!sets.length) continue;
      const key = `${e.exerciseId}|${s.gymId}`;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push({ t: s.start, sets });
    }
  }
  let stall = null, gain = null;
  for (const [key, list] of by) {
    if (list.length < 4) continue;
    const [exerciseId, gymId] = key.split('|');
    const type = exercises[exerciseId]?.type || 'wr';
    if (type === 't') continue;
    const pts = list.map(({ t, sets }) => {
      const top = Math.max(...sets.map((x) => x.w || 0));
      const reps = Math.max(...sets.filter((x) => (x.w || 0) === top).map((x) => x.r || 0));
      return { t, top, reps, bestReps: Math.max(...sets.map((x) => x.r || 0)) };
    });
    const repsMode = pts.every((p) => p.top === 0);
    const val = (p) => (repsMode ? p.bestReps : p.top);
    const sig = (p) => (repsMode ? `${p.bestReps}` : `${p.top}x${p.reps}`);
    let k = 1;
    for (let i = pts.length - 2; i >= 0 && sig(pts[i]) === sig(pts.at(-1)); i--) k++;
    const series = pts.slice(-10).map((p) => ({ t: p.t, v: val(p) }));
    const base = { exerciseId, gymId, repsMode, series, increment: inc[gymId] || 2.5 };
    if (k >= 4 && (!stall || k > stall.k || (k === stall.k && pts.at(-1).t > stall.last))) {
      stall = { ...base, kind: 'stall', k, w: pts.at(-1).top, r: pts.at(-1).reps, last: pts.at(-1).t };
    }
    const d = val(pts.at(-1)) - val(pts[0]);
    const min = repsMode ? 2 : inc[gymId] || 2.5;
    if (d >= min && val(pts[0]) > 0) {
      const rel = d / val(pts[0]);
      if (!gain || rel > gain.rel) gain = { ...base, kind: 'gain', from: val(pts[0]), to: val(pts.at(-1)), since: pts[0].t, rel };
    }
  }
  return stall || gain || null;
}
