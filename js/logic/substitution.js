// Slots are movements; each gym maps a slot to a concrete exercise.
export const akey = (slotId, gymId) => `${slotId}|${gymId}`;

/** Returns exercise id assigned to the slot at this gym, or null when none (user must pick or skip). */
export function resolveSlot(assignments, slotId, gymId) {
  return assignments[akey(slotId, gymId)] ?? null;
}

/** Whole-routine resolution: [{slotId, exerciseId|null}] */
export function resolveRoutine(routine, assignments, gymId) {
  const out = [];
  for (const b of routine.blocks)
    for (const it of b.items)
      out.push({ blockId: b.id, slotId: it.slotId, exerciseId: resolveSlot(assignments, it.slotId, gymId) });
  return out;
}

/** True if every required equipment item for the exercise is enabled at the gym. */
export function availableAt(exercise, gym) {
  const need = exercise.equipment || [];
  if (!need.length) return true;
  const have = new Set((gym.equipment || []).filter((e) => e.on).map((e) => e.key));
  // screw-on dumbbells still count as dumbbells
  if (have.has('dumbbell-screw')) have.add('dumbbell');
  return need.every((k) => have.has(k));
}

/** Search by name or alias, accent/case-insensitive. */
export function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
export function searchExercises(list, q, gym) {
  const n = norm(q);
  const words = n.split(/\s+/).filter(Boolean);
  const scored = [];
  for (const e of list) {
    const hay = norm([e.name, ...(e.aliases || [])].join(' | '));
    if (!words.every((w) => hay.includes(w))) continue;
    let score = norm(e.name).startsWith(n) ? 0 : 1;
    if (gym && !availableAt(e, gym)) score += 2;
    scored.push([score, e]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map((x) => x[1]);
}
