import * as db from './db.js';
import { BIG_PLAN, bigVariant, bigSlots, bigAssignments } from './seed.js';

/** No supersets: every exercise is its own block of normal sets. */
export function flattenBlocks(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.items.length <= 1) { out.push(b); continue; }
    b.items.forEach((it, i) => out.push({ ...b, id: `${b.id}${i + 1}`, items: [it] }));
  }
  return out;
}

/** One-time upgrades of stored data. Safe to run on every start. */
export async function migrate() {
  const v = await db.kvGet('schema', 1);
  if (v < 2) {
    const hasBig = !!(await db.get('gyms', 'big'));
    for (const r of await db.all('routines')) {
      r.blocks = flattenBlocks(r.blocks);
      if (hasBig && BIG_PLAN[r.id]) r.gymBlocks = { ...(r.gymBlocks || {}), big: bigVariant(r.id) };
      await db.put('routines', r);
    }
    if (hasBig) { await db.putMany('slots', bigSlots()); await db.putMany('assignments', bigAssignments()); }
  }
  if (v < 3) { // the big gym is called Sportrade
    const g = await db.get('gyms', 'big');
    if (g && g.name === 'Big gym') { g.name = 'Sportrade'; await db.put('gyms', g); }
  }
  await db.kvSet('schema', 3);
}
