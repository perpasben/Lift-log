import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, SLOTS, ROUTINES, seedAssignments, seedGyms } from '../js/seed.js';

test('seed integrity: assignments, routine slots and ids are consistent', () => {
  const ex = new Set(CATALOG.map((e) => e.id));
  assert.equal(ex.size, CATALOG.length, 'duplicate catalog ids');
  const slots = new Set(SLOTS.map((s) => s.id));
  for (const a of seedAssignments()) {
    assert.ok(ex.has(a.exerciseId), `missing exercise ${a.exerciseId}`);
    assert.ok(slots.has(a.slotId), `missing slot ${a.slotId}`);
  }
  const gyms = seedGyms().map((g) => g.id);
  for (const r of ROUTINES) for (const b of r.blocks) for (const i of b.items) {
    assert.ok(slots.has(i.slotId), `routine slot ${i.slotId}`);
    for (const g of gyms) assert.ok(seedAssignments().some((a) => a.slotId === i.slotId && a.gymId === g), `${i.slotId} unassigned at ${g}`);
  }
});
