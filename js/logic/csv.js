// StrengthLog CSV export -> app sessions. Pure functions, no DOM.
export function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function parseTime(t) {
  if (!t) return null;
  const p = t.split(':').map(Number);
  if (p.some(Number.isNaN)) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Guess a routine from the StrengthLog workout title. */
export function routineFromTitle(title) {
  const t = title.toLowerCase();
  if (/\bpush\b/.test(t)) return 'push';
  if (/\bpull\b/.test(t)) return 'pull';
  if (/\bleg\b/.test(t)) return 'leg';
  if (/extra/.test(t)) return 'extra';
  return null;
}

/**
 * @returns {{sessions:object[], exerciseNames:string[]}}
 * Sessions carry exercise *names*; the caller maps them to catalog ids.
 */
export function csvToSessions(rows, gymId) {
  const by = new Map();
  for (const r of rows) {
    if (!r.checked) continue; // planned but never completed
    const k = `${r.workout}|${r.start}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  const sessions = [];
  const names = new Set();
  for (const [k, list] of by) {
    const first = list[0];
    const entries = [];
    const idx = new Map();
    for (const r of list) {
      names.add(r.exercise);
      if (!idx.has(r.exercise)) {
        idx.set(r.exercise, entries.length);
        entries.push({ id: `e${entries.length}`, exerciseName: r.exercise, sets: [] });
      }
      const w = Number(r.weight || r.extraWeight || 0);
      const t = parseTime(r.time);
      entries[idx.get(r.exercise)].sets.push({
        w,
        r: r.reps ? Number(r.reps) : null,
        t,
        warm: r.warmup === 'true',
        done: true,
      });
    }
    sessions.push({
      id: `sl_${first.start}`,
      source: 'strengthlog',
      title: first.workout,
      routineId: routineFromTitle(first.workout),
      gymId,
      start: Number(first.start),
      end: Number(first.end),
      entries,
    });
  }
  return { sessions: sessions.sort((a, b) => a.start - b.start), exerciseNames: [...names] };
}
