import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestNext } from '../js/logic/progression.js';
import { startTimer, remaining, isDone, circuitState, fmt, addSeconds } from '../js/logic/timer.js';
import { resolveSlot, resolveRoutine, akey, searchExercises, availableAt } from '../js/logic/substitution.js';
import { buildPending, pendingFor, nextRoutine, unfinished } from '../js/logic/carryover.js';
import { parseCsv, csvToSessions, parseTime, routineFromTitle } from '../js/logic/csv.js';

const P = { repMin: 10, repMax: 12, increment: 2.5 };
test('progression: all sets at top -> +increment, reps reset to min', () => {
  const r = suggestNext([{ w: 40, r: 12, done: true }, { w: 40, r: 12, done: true }], P);
  assert.deepEqual(r, { weight: 42.5, reps: 10, bumped: true });
});
test('progression: not all at top -> same weight, reps +1', () => {
  const r = suggestNext([{ w: 40, r: 12 }, { w: 40, r: 10 }], P);
  assert.deepEqual(r, { weight: 40, reps: 13 > 12 ? 12 : 13, bumped: false });
});
test('progression: ignores warm-ups and undone sets; empty -> nulls', () => {
  assert.equal(suggestNext([{ w: 10, r: 12, warm: true }, { w: 40, r: 12 }], P).weight, 42.5);
  assert.equal(suggestNext([{ w: 40, r: 12, done: false }], P).weight, null);
  assert.equal(suggestNext([], P).weight, null);
});

test('timer: survives time passing (end timestamp based)', () => {
  const t = startTimer(1_000_000, 90);
  assert.equal(remaining(t, 1_000_000), 90);
  assert.equal(remaining(t, 1_000_000 + 30_500), 60);
  assert.equal(remaining(t, 1_000_000 + 600_000), 0);
  assert.ok(isDone(t, 1_090_000) && !isDone(t, 1_089_999));
  assert.equal(remaining(addSeconds(t, 15), 1_000_000), 105);
  assert.equal(fmt(65), '1:05');
});
test('circuit 40/20 x 7', () => {
  const s = 0;
  assert.deepEqual(circuitState(s, 10_000, 40, 20, 7), { finished: false, index: 0, phase: 'work', left: 30 });
  assert.deepEqual(circuitState(s, 45_000, 40, 20, 7), { finished: false, index: 0, phase: 'rest', left: 15 });
  assert.equal(circuitState(s, 60_000, 40, 20, 7).index, 1);
  assert.ok(circuitState(s, 420_000, 40, 20, 7).finished);
});

const routine = { blocks: [{ id: 'A', items: [{ slotId: 'chest' }, { slotId: 'fly' }] }] };
const asg = { [akey('chest', 'office')]: 'cable-chest-press', [akey('chest', 'big')]: 'bench-press' };
test('substitution: per-gym assignment, null when missing', () => {
  assert.equal(resolveSlot(asg, 'chest', 'big'), 'bench-press');
  assert.equal(resolveSlot(asg, 'fly', 'big'), null);
  assert.deepEqual(resolveRoutine(routine, asg, 'office').map((x) => x.exerciseId), ['cable-chest-press', null]);
});
test('search by alias, accents, equipment availability ordering', () => {
  const ex = [
    { id: 'a', name: 'Barbell Bench Press', aliases: ['press banca'], equipment: ['barbell'] },
    { id: 'b', name: 'Cable Chest Press', aliases: ['press de pecho en polea'], equipment: ['cable'] },
  ];
  assert.equal(searchExercises(ex, 'PRESS pecho')[0].id, 'b');
  assert.equal(searchExercises(ex, 'banca').length, 1);
  const gym = { equipment: [{ key: 'cable', on: true }] };
  assert.equal(searchExercises(ex, 'press', gym)[0].id, 'b');
  assert.ok(!availableAt(ex[0], gym));
});

test('carryover: per-exercise decision; carry vs extra; next routine rotation', () => {
  const s = {
    id: 's1', routineId: 'pull', gymId: 'big',
    entries: [
      { id: 'e1', slotId: 'row', exerciseId: 'x', sets: [{ done: true }, { done: false }, { done: false }] },
      { id: 'e2', slotId: 'curl', exerciseId: 'y', sets: [{ done: false }] },
      { id: 'e3', slotId: 'z', exerciseId: 'z', sets: [{ done: true }] },
      { id: 'e4', slotId: 'w', exerciseId: 'w', skipped: true, sets: [{ done: false }] },
    ],
  };
  assert.equal(unfinished(s).length, 2);
  const p = buildPending(s, { e1: 'carry', e2: 'extra' }, 5);
  assert.equal(p.length, 2);
  assert.equal(p[0].sets, 2);
  assert.deepEqual(pendingFor(p, 'pull').map((x) => x.exerciseId), ['x']);
  assert.deepEqual(pendingFor(p, 'extra').map((x) => x.exerciseId), ['y']);
  assert.equal(nextRoutine([{ routineId: 'push', start: 1 }, { routineId: 'pull', start: 2 }]), 'leg');
  assert.equal(nextRoutine([{ routineId: 'leg', start: 3 }, { routineId: 'extra', start: 4 }]), 'push');
  assert.equal(nextRoutine([]), 'push');
});

test('csv: quoted commas, sessions, time, routine guess', () => {
  const txt = 'workout,start,end,exercise,weight,extraWeight,reps,time,warmup\r\n' +
    '"Wed, Evening: Pull",100,200,Pull-Up,,5,8,,false\n' +
    '"Wed, Evening: Pull",100,200,Bar Hang,,0,,00:00:35,false\n' +
    'LEG,300,400,Leg Extension,40,,10,,true\n';
  const rows = parseCsv(txt);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].workout, 'Wed, Evening: Pull');
  const { sessions, exerciseNames } = csvToSessions(rows, 'big');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].routineId, 'pull');
  assert.equal(sessions[0].entries[0].sets[0].w, 5);
  assert.equal(sessions[0].entries[1].sets[0].t, 35);
  assert.equal(sessions[1].entries[0].sets[0].warm, true);
  assert.deepEqual(exerciseNames.sort(), ['Bar Hang', 'Leg Extension', 'Pull-Up']);
  assert.equal(parseTime('01:02:03'), 3723);
  assert.equal(routineFromTitle('Quick Workout: EXTRA WORKOUT'), 'extra');
});

test('screw-on dumbbells satisfy dumbbell exercises', () => {
  const gym = { equipment: [{ key: 'dumbbell-screw', on: true }, { key: 'dumbbell', on: false }] };
  assert.ok(availableAt({ equipment: ['dumbbell'] }, gym));
  assert.ok(!availableAt({ equipment: ['barbell'] }, gym));
});
