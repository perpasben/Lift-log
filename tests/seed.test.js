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

import { BIG_PLAN, bigVariant, bigSlots, bigAssignments } from '../js/seed.js';
import { flattenBlocks } from '../js/migrate.js';
import { buildWorkout } from '../js/logic/workout.js';
test('big gym plan: exercises exist, every slot is assigned at big, no supersets', () => {
  const ex = new Set(CATALOG.map((e) => e.id));
  for (const [rid, plan] of Object.entries(BIG_PLAN)) {
    assert.ok(plan.length >= 3, rid);
    for (const [id] of plan) assert.ok(ex.has(id), `${rid}: ${id}`);
    const assigned = new Set(bigAssignments().map((a) => a.slotId));
    for (const b of bigVariant(rid)) { assert.equal(b.items.length, 1); assert.ok(assigned.has(b.items[0].slotId)); }
  }
  assert.ok(bigSlots().every((s) => s.name));
});
test('flattenBlocks splits supersets into single-exercise blocks and is idempotent', () => {
  const merged = ROUTINES[0].blocks;
  assert.ok(merged.some((b) => b.items.length > 1));
  const flat = flattenBlocks(merged);
  assert.ok(flat.every((b) => b.items.length === 1));
  assert.equal(flat.length, merged.reduce((n, b) => n + b.items.length, 0));
  assert.equal(new Set(flat.map((b) => b.id)).size, flat.length);
  assert.deepEqual(flattenBlocks(flat), flat);
});
test('buildWorkout uses the gym-specific blocks when present', () => {
  const routine = { blocks: flattenBlocks(ROUTINES[0].blocks), gymBlocks: { big: bigVariant('push') } };
  const asg = Object.fromEntries([...seedAssignments(), ...bigAssignments()].map((a) => [a.id, a.exerciseId]));
  const ex = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
  const big = buildWorkout({ routineId: 'push', routine, gym: { id: 'big', increment: 2.5 }, assignments: asg, exercises: ex, sessions: [], pending: [], now: 1 });
  assert.deepEqual(big.entries.map((e) => e.exerciseId), BIG_PLAN.push.map((p) => p[0]));
  assert.ok(big.entries.every((e) => e.sets.length === 4));
  const office = buildWorkout({ routineId: 'push', routine, gym: { id: 'office', increment: 2.5 }, assignments: asg, exercises: ex, sessions: [], pending: [], now: 1 });
  assert.equal(office.entries.length, 7);
  assert.equal(office.entries[1].exerciseId, 'cable-chest-press');
});

import { FAMILIES, alternativesFor, kindOf } from '../js/alternatives.js';
test('alternatives: families only reference real exercises', () => {
  const ids = new Set(CATALOG.map((e) => e.id));
  for (const f of FAMILIES) for (const id of f) assert.ok(ids.has(id), `unknown exercise in family: ${id}`);
});
test('alternatives: free weight suggests machine first, machine suggests free weight first, gym equipment respected', () => {
  const ex = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
  const big = seedGyms()[1], office = seedGyms()[0];
  const fromBench = alternativesFor('bench-press', ex, big);
  assert.equal(fromBench[0].id, 'machine-chest-press');
  assert.ok(fromBench.some((a) => a.kind === 'cable') && fromBench.some((a) => a.kind === 'free'));
  assert.equal(kindOf(ex['machine-lateral-raise']), 'machine');
  const fromMachine = alternativesFor('machine-chest-press', ex, big);
  assert.equal(kindOf(ex[fromMachine[0].id]), 'free');
  assert.ok(!fromMachine.some((a) => a.id === 'machine-chest-press'));
  const atOffice = alternativesFor('bench-press', ex, office);
  assert.ok(atOffice.length > 0 && atOffice.every((a) => a.id !== 'machine-chest-press'));
  assert.deepEqual(alternativesFor('does-not-exist', ex, big), []);
});
