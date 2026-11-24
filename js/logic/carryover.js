// Pending work: unfinished exercises either carry to the start of the next workout of the same routine,
// or get parked in the Extra Workout. The user chooses per exercise.

/** Entries with at least one undone working set (and not skipped). */
export function unfinished(session) {
  return session.entries
    .filter((e) => !e.skipped)
    .map((e) => {
      const left = e.sets.filter((s) => !s.warm && !s.done);
      return left.length ? { entry: e, left: left.length } : null;
    })
    .filter(Boolean);
}

/**
 * @param decisions map entryId -> 'carry' | 'extra' | 'drop'
 * @returns pending items to persist
 */
export function buildPending(session, decisions, now = Date.now()) {
  const out = [];
  for (const { entry, left } of unfinished(session)) {
    const d = decisions[entry.id] ?? 'drop';
    if (d === 'drop') continue;
    out.push({
      id: `p_${session.id}_${entry.id}`,
      target: d === 'carry' ? session.routineId : 'extra',
      slotId: entry.slotId,
      exerciseId: entry.exerciseId,
      gymId: session.gymId,
      blockId: entry.blockId,
      sets: left,
      repMin: entry.repMin,
      repMax: entry.repMax,
      createdAt: now,
    });
  }
  return out;
}

/** Pending items to inject at the very start of a workout of `routineId`. */
export function pendingFor(pending, routineId) {
  return pending.filter((p) => p.target === routineId).sort((a, b) => a.createdAt - b.createdAt);
}

/** Order of the rotation and next routine suggestion. */
export const ROTATION = ['push', 'pull', 'leg'];
export function nextRoutine(sessions) {
  const last = [...sessions].filter((s) => ROTATION.includes(s.routineId)).sort((a, b) => b.start - a.start)[0];
  if (!last) return ROTATION[0];
  return ROTATION[(ROTATION.indexOf(last.routineId) + 1) % ROTATION.length];
}
