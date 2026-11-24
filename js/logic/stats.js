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
