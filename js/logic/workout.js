// Pure helpers to build and reason about a live workout. No DOM, no IndexedDB.
import { resolveSlot } from './substitution.js';
import { suggestNext } from './progression.js';
import { pendingFor, unfinished } from './carryover.js';

let seq = 0;
export const uid = (p = 'e') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Most recent done working sets of an exercise at a gym, or null. */
export function lastFor(sessions, exerciseId, gymId) {
  const list = sessions.filter((s) => s.gymId === gymId).sort((a, b) => b.start - a.start);
  for (const s of list) for (const e of s.entries) {
    if (e.exerciseId !== exerciseId) continue;
    const sets = (e.sets || []).filter((x) => !x.warm && x.done !== false);
    if (sets.length) return { date: s.start, sets };
  }
  return null;
}

/** Last time at this gym; if never done there, the most recent time anywhere (flagged `elsewhere`). */
export function lastPreferGym(sessions, exerciseId, gymId) {
  const here = lastFor(sessions, exerciseId, gymId);
  if (here) return here;
  const any = [...sessions].sort((a, b) => b.start - a.start);
  for (const s of any) for (const e of s.entries) {
    if (e.exerciseId !== exerciseId) continue;
    const sets = (e.sets || []).filter((x) => !x.warm && x.done !== false);
    if (sets.length) return { date: s.start, sets, elsewhere: true, gymId: s.gymId };
  }
  return null;
}

/** Defaults for an exercise added on the fly: copy set count, weights and reps from the last time. */
export function addedDefaults(last, { increment = 2.5, type = 'wr' } = {}) {
  const reps = last ? last.sets.map((s) => s.r).filter((r) => r != null) : [];
  const repMin = reps.length ? Math.min(8, ...reps) : 8;
  const repMax = reps.length ? Math.max(12, ...reps) : 12;
  const count = last ? Math.min(6, Math.max(1, last.sets.length)) : 3;
  const sets = makeSets(count, { type, last, repMin, repMax, increment });
  // when copying from another gym we copy values as-is (no progression bump)
  if (last?.elsewhere) sets.forEach((s, i) => { const o = last.sets[Math.min(i, last.sets.length - 1)]; s.w = o.w; s.r = o.r; s.t = o.t ?? s.t; });
  return { sets, repMin, repMax };
}

/** n fresh sets prefilled from the last session using double progression. */
export function makeSets(n, { type = 'wr', last = null, repMin = 8, repMax = 12, increment = 2.5, warm = false } = {}) {
  const sug = last && !warm ? suggestNext(last.sets, { repMin, repMax, increment }) : null;
  const lastW = last?.sets?.length ? last.sets[last.sets.length - 1] : null;
  return Array.from({ length: n }, (_, i) => ({
    w: type === 'rr' || type === 't' ? 0 : warm ? (lastW ? Math.round((lastW.w * 0.5) / increment) * increment : null) : (sug?.weight ?? null),
    r: type === 't' ? null : (sug?.reps ?? repMin),
    t: type === 't' ? (last?.sets?.[i]?.t ?? lastW?.t ?? 30) : null,
    warm, done: false,
  }));
}

export function suggestionFor(last, { repMin, repMax, increment }) {
  return last ? suggestNext(last.sets, { repMin, repMax, increment }) : null;
}

/**
 * @param o {routineId, routine|null, gym, assignments:{[key]:exId}, exercises:{[id]:ex}, sessions, pending, now}
 */
export function buildWorkout({ routineId, routine, gym, assignments, exercises, sessions, pending, now = Date.now() }) {
  const blocks = [], entries = [];
  const add = (b, e) => { blocks.push(b); b.entryIds = [e.id]; entries.push(e); };
  const typeOf = (id) => exercises[id]?.type || 'wr';

  for (const p of pendingFor(pending, routineId)) {
    const last = lastFor(sessions, p.exerciseId, gym.id);
    const e = { id: uid(), blockId: null, slotId: p.slotId, exerciseId: p.exerciseId, baseExerciseId: p.exerciseId, repMin: p.repMin, repMax: p.repMax, skipped: false, pendingId: p.id,
      sets: makeSets(p.sets, { type: typeOf(p.exerciseId), last, repMin: p.repMin, repMax: p.repMax, increment: gym.increment }) };
    const b = { id: uid('b'), label: 'Carried over', kind: 'carry', rounds: p.sets };
    e.blockId = b.id; add(b, e);
  }
  for (const rb of routine?.gymBlocks?.[gym.id] || routine?.blocks || []) {
    const b = { id: uid('b'), routineBlockId: rb.id, label: rb.label, kind: rb.kind, rounds: rb.rounds, entryIds: [] };
    for (const it of rb.items) {
      const exId = resolveSlot(assignments, it.slotId, gym.id);
      const warm = rb.kind === 'warmup';
      const last = exId ? lastFor(sessions, exId, gym.id) : null;
      const e = { id: uid(), blockId: b.id, slotId: it.slotId, exerciseId: exId, baseExerciseId: exId, repMin: it.repMin, repMax: it.repMax, skipped: false,
        sets: makeSets(rb.rounds, { type: exId ? typeOf(exId) : 'wr', last, repMin: it.repMin, repMax: it.repMax, increment: gym.increment, warm }) };
      if (warm && last) { // warm-up: reuse the first working weight, halved by makeSets, but never mark warm-up sets as work
        e.sets.forEach((s) => { s.warm = true; });
      }
      b.entryIds.push(e.id); entries.push(e);
    }
    blocks.push(b);
  }
  return { id: uid('w'), routineId, gymId: gym.id, start: now, blocks, entries, rest: null };
}

export const entryOf = (w, id) => w.entries.find((e) => e.id === id);

/** After checking set `i`, is the whole round of the block finished (so rest should start)? */
export function restDue(w, entry, i) {
  const b = w.blocks.find((x) => x.id === entry.blockId);
  const peers = b.entryIds.map((id) => entryOf(w, id)).filter((e) => !e.skipped && e.exerciseId);
  return peers.every((p) => !p.sets[i] || p.sets[i].done);
}

/** Changes vs. the routine that the user may want to persist. */
export function routineChanges(w) {
  const kind = (e) => w.blocks.find((b) => b.id === e.blockId)?.kind;
  const swaps = w.entries.filter((e) => e.slotId && !e.skipped && e.exerciseId && e.exerciseId !== e.baseExerciseId && ['superset', 'warmup'].includes(kind(e)))
    .map((e) => ({ entryId: e.id, slotId: e.slotId, from: e.baseExerciseId, to: e.exerciseId }));
  const added = w.entries.filter((e) => kind(e) === 'added' && !e.skipped && e.sets.some((s) => s.done))
    .map((e) => ({ entryId: e.id, exerciseId: e.exerciseId, sets: e.sets.length, repMin: e.repMin, repMax: e.repMax }));
  return { swaps, added };
}

/** Session record to store: done sets only, skipped entries removed. */
export function toSession(w, end = Date.now()) {
  const entries = w.entries.filter((e) => !e.skipped && e.exerciseId)
    .map((e) => ({ id: e.id, slotId: e.slotId ?? null, exerciseId: e.exerciseId, blockId: e.blockId, sets: e.sets.filter((s) => s.done).map(({ w: ww, r, t, warm }) => ({ w: ww ?? 0, r, t, warm, done: true })) }))
    .filter((e) => e.sets.length);
  return { id: w.id, routineId: w.routineId, gymId: w.gymId, start: w.start, end, entries };
}

export function stats(session) {
  let sets = 0, volume = 0;
  for (const e of session.entries) for (const s of e.sets) if (!s.warm) { sets++; volume += (s.w || 0) * (s.r || 0); }
  return { sets, volume: Math.round(volume), minutes: Math.max(1, Math.round((session.end - session.start) / 60000)) };
}

export const pendingAfter = (w) => unfinished(w);

/**
 * A "new personal record": you COMPLETED the exercise (every working set done, at least 3 sets) and the lightest
 * of those sets is heavier than the weight you ever completed it with before at this gym (or the same weight with
 * more reps). One heavy set is not enough. Needs 3 earlier completed workouts so the first sessions are not all
 * records. Returns {w, r} (weight and fewest reps across the sets) or null.
 */
export function personalRecord(sessions, exerciseId, gymId, sets) {
  const MIN_SETS = 3;
  const completion = (ws) => ({ w: Math.min(...ws.map((x) => x.w)), r: Math.min(...ws.map((x) => x.r || 0)) });
  const better = (a, b) => !b || a.w > b.w || (a.w === b.w && a.r > b.r);
  let best = null, n = 0;
  for (const s of sessions) {
    if (s.gymId !== gymId) continue;
    const e = s.entries.find((x) => x.exerciseId === exerciseId);
    const ws = e?.sets.filter((x) => !x.warm && x.done !== false && (x.w || 0) > 0);
    if (!ws || ws.length < MIN_SETS) continue;
    n++;
    const c = completion(ws);
    if (better(c, best)) best = c;
  }
  if (!best || n < 3) return null;
  const work = sets.filter((x) => !x.warm);
  if (work.length < MIN_SETS || !work.every((x) => x.done && (x.w || 0) > 0)) return null;
  const cand = completion(work);
  return better(cand, best) ? cand : null;
}
