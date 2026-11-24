// Rest timer based on an absolute end timestamp, so it survives backgrounding/locking.
export function startTimer(now, seconds) {
  return { endAt: now + seconds * 1000, total: seconds };
}
export function remaining(t, now) {
  if (!t) return 0;
  return Math.max(0, Math.ceil((t.endAt - now) / 1000));
}
export function isDone(t, now) {
  return !t || now >= t.endAt;
}
export function addSeconds(t, s) {
  return { ...t, endAt: t.endAt + s * 1000, total: t.total + s };
}
export function fmt(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}
// Interval circuits (work/rest) computed from a start time; no ticking state needed.
export function circuitState(startAt, now, work, rest, rounds) {
  const cycle = work + rest;
  const el = Math.max(0, Math.floor((now - startAt) / 1000));
  const idx = Math.floor(el / cycle);
  if (idx >= rounds) return { finished: true, index: rounds, phase: 'done', left: 0 };
  const inCycle = el % cycle;
  return inCycle < work
    ? { finished: false, index: idx, phase: 'work', left: work - inCycle }
    : { finished: false, index: idx, phase: 'rest', left: cycle - inCycle };
}
