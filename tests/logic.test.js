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
  const txt = 'workout,start,end,exercise,weight,extraWeight,reps,time,warmup,checked\r\n' +
    '"Wed, Evening: Pull",100,200,Pull-Up,,5,8,,false,150\n' +
    '"Wed, Evening: Pull",100,200,Bar Hang,,0,,00:00:35,false,160\n' +
    '"Wed, Evening: Pull",100,200,Skipped Thing,0,,0,,false,\n' +
    'LEG,300,400,Leg Extension,40,,10,,true,350\n';
  const rows = parseCsv(txt);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].workout, 'Wed, Evening: Pull');
  const { sessions, exerciseNames } = csvToSessions(rows, 'big');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].routineId, 'pull');
  assert.equal(sessions[0].entries[0].sets[0].w, 5);
  assert.equal(sessions[0].entries[1].sets[0].t, 35);
  assert.equal(sessions[1].entries[0].sets[0].warm, true);
  assert.deepEqual(exerciseNames.sort(), ['Bar Hang', 'Leg Extension', 'Pull-Up']); // unchecked rows are ignored
  assert.equal(parseTime('01:02:03'), 3723);
  assert.equal(routineFromTitle('Quick Workout: EXTRA WORKOUT'), 'extra');
});

test('screw-on dumbbells satisfy dumbbell exercises', () => {
  const gym = { equipment: [{ key: 'dumbbell-screw', on: true }, { key: 'dumbbell', on: false }] };
  assert.ok(availableAt({ equipment: ['dumbbell'] }, gym));
  assert.ok(!availableAt({ equipment: ['barbell'] }, gym));
});

import { addedDefaults, lastPreferGym, buildWorkout, lastFor, restDue, routineChanges, toSession, stats } from '../js/logic/workout.js';
const gymB = { id: 'big', increment: 2.5 };
const R = { blocks: [
  { id: 'w', label: 'Warm-up', kind: 'warmup', rounds: 2, items: [{ slotId: 'rot', repMin: 12, repMax: 12 }] },
  { id: 'a', label: 'A', kind: 'superset', rounds: 3, items: [{ slotId: 'press', repMin: 10, repMax: 12 }, { slotId: 'fly', repMin: 12, repMax: 15 }] },
] };
const exs = { bench: { type: 'wr' }, deck: { type: 'wr' }, rot: { type: 'wr' } };
const A = { 'press|big': 'bench', 'fly|big': 'deck', 'rot|big': 'rot' };
const hist = [{ gymId: 'big', start: 5, end: 9, entries: [{ exerciseId: 'bench', sets: [{ w: 50, r: 12, done: true }, { w: 50, r: 12, done: true }] }] }];

test('lastFor is per gym and ignores warm-ups', () => {
  assert.equal(lastFor(hist, 'bench', 'big').sets.length, 2);
  assert.equal(lastFor(hist, 'bench', 'office'), null);
});
test('buildWorkout: pending first, suggestion bump, missing slot flagged', () => {
  const pending = [{ id: 'p1', target: 'push', slotId: 'press', exerciseId: 'deck', sets: 2, repMin: 12, repMax: 15, createdAt: 1 }];
  const w = buildWorkout({ routineId: 'push', routine: R, gym: gymB, assignments: { ...A, 'fly|big': undefined }, exercises: exs, sessions: hist, pending, now: 100 });
  assert.equal(w.blocks[0].kind, 'carry');
  assert.equal(w.entries[0].sets.length, 2);
  const press = w.entries.find((e) => e.slotId === 'press' && e.blockId !== w.blocks[0].id);
  assert.equal(press.sets.length, 3);
  assert.equal(press.sets[0].w, 52.5); // 12 reps on all sets last time -> +2.5
  assert.equal(w.entries.find((e) => e.slotId === 'fly' && e.sets.length === 3).exerciseId ?? null, null);
  assert.ok(w.entries.find((e) => e.slotId === 'rot').sets.every((s) => s.warm));
});
test('restDue: only when the whole superset round is checked', () => {
  const w = buildWorkout({ routineId: 'push', routine: R, gym: gymB, assignments: A, exercises: exs, sessions: [], pending: [], now: 1 });
  const [p, f] = w.entries.filter((e) => e.slotId === 'press' || e.slotId === 'fly');
  p.sets[0].done = true;
  assert.equal(restDue(w, p, 0), false);
  f.sets[0].done = true;
  assert.equal(restDue(w, f, 0), true);
  f.skipped = true; p.sets[1].done = true;
  assert.equal(restDue(w, p, 1), true);
});
test('routineChanges + toSession + stats', () => {
  const w = buildWorkout({ routineId: 'push', routine: R, gym: gymB, assignments: A, exercises: exs, sessions: [], pending: [], now: 1000 });
  const press = w.entries.find((e) => e.slotId === 'press');
  press.exerciseId = 'deck'; press.sets[0] = { ...press.sets[0], w: 20, r: 10, done: true };
  const ch = routineChanges(w);
  assert.deepEqual(ch.swaps.map((s) => [s.slotId, s.from, s.to]), [['press', 'bench', 'deck']]);
  const s = toSession(w, 1000 + 45 * 60000);
  assert.equal(s.entries.length, 1);
  assert.deepEqual(stats(s), { sets: 1, volume: 200, minutes: 45 });
});

test('added exercise copies last values (set count, weight, reps), falling back to another gym', () => {
  const h2 = [{ gymId: 'office', start: 9, end: 10, entries: [{ exerciseId: 'curl', sets: [{ w: 14, r: 10, done: true }, { w: 14, r: 9, done: true }, { w: 14, r: 8, done: true }, { w: 14, r: 7, done: true }] }] }];
  const l = lastPreferGym(h2, 'curl', 'big');
  assert.ok(l.elsewhere);
  const d = addedDefaults(l);
  assert.equal(d.sets.length, 4);
  assert.deepEqual(d.sets.map((s) => [s.w, s.r]), [[14, 10], [14, 9], [14, 8], [14, 7]]);
  const none = addedDefaults(null);
  assert.equal(none.sets.length, 3);
  assert.deepEqual([none.repMin, none.repMax], [8, 12]);
});

import { monthGrid, dayKey, exerciseSeries, est1rm, niceRange, metricsFor } from '../js/logic/stats.js';
test('monthGrid: Monday-first, counts sessions in month', () => {
  const t = (y, m, d) => new Date(y, m, d, 18).getTime();
  const sess = [{ id: 'a', start: t(2026, 10, 3), end: t(2026, 10, 3) + 45 * 60000 }, { id: 'b', start: t(2026, 10, 3) + 1000, end: t(2026, 10, 3) + 30 * 60000 }, { id: 'c', start: t(2026, 9, 30), end: t(2026, 9, 30) + 60000 }];
  const g = monthGrid(2026, 10, sess);
  assert.equal(g.weeks[0][0].key, '2026-10-26'); // Nov 1 2026 is a Sunday
  assert.equal(g.weeks.length, 6);
  assert.equal(g.count, 2);
  assert.equal(g.minutes, 75);
  const cell = g.weeks.flat().find((c) => c.key === dayKey(t(2026, 10, 3)));
  assert.equal(cell.sessions.length, 2);
  assert.equal(cell.inMonth, true);
  assert.equal(g.weeks.flat().filter((c) => c.inMonth).length, 30);
});
test('exerciseSeries: per gym, per metric', () => {
  const S = [
    { id: '1', gymId: 'big', start: 1, entries: [{ exerciseId: 'x', sets: [{ w: 40, r: 10 }, { w: 45, r: 8 }, { w: 20, r: 12, warm: true }] }] },
    { id: '2', gymId: 'office', start: 2, entries: [{ exerciseId: 'x', sets: [{ w: 10, r: 10 }] }] },
    { id: '3', gymId: 'big', start: 3, entries: [{ exerciseId: 'x', sets: [{ w: 47.5, r: 8 }] }] },
  ];
  assert.deepEqual(exerciseSeries(S, 'x', 'big', 'top').map((p) => p.v), [45, 47.5]);
  assert.deepEqual(exerciseSeries(S, 'x', null, 'top').map((p) => p.v), [45, 10, 47.5]);
  assert.equal(exerciseSeries(S, 'x', 'big', 'volume')[0].v, 760);
  assert.equal(est1rm(100, 5), 116.7);
  assert.deepEqual(metricsFor('bw').map((m) => m[0]), ['reps', 'top']);
});
test('niceRange gives tidy ticks and handles flat data', () => {
  const r = niceRange(22.5, 47.5);
  assert.ok(r.lo <= 22.5 && r.hi >= 47.5 && r.ticks.length >= 3);
  const f = niceRange(50, 50);
  assert.ok(f.lo < 50 && f.hi > 50);
});

import { muscleLoad, heat, ago } from '../js/logic/stats.js';
test('muscleLoad: rolling days across week boundaries, warm-ups ignored, last-N mode', () => {
  const now = new Date(2026, 10, 25, 12).getTime(); // Wed
  const day = (n) => now - n * 86400000;
  const ex = { bp: { muscle: 'Chest' }, sq: { muscle: 'Quads' }, fp: { muscle: 'Rear delts' }, cc: { muscle: 'Mobility' } };
  const S = [
    { id: 'sat', start: day(4), entries: [{ exerciseId: 'bp', sets: [{ done: true }, { done: true }, { warm: true, done: true }] }] },
    { id: 'wed', start: day(0) - 1000, entries: [{ exerciseId: 'sq', sets: [{ done: true }] }, { exerciseId: 'cc', sets: [{ done: true }] }, { exerciseId: 'fp', sets: [{ done: true }] }] },
    { id: 'old', start: day(9), entries: [{ exerciseId: 'bp', sets: [{ done: true }] }] },
    { id: 'circuit', start: day(1), entries: [] },
  ];
  const r7 = muscleLoad(S, ex, { days: 7 }, now);
  assert.deepEqual(r7.counts, { chest: 2, quads: 1, rearDelts: 1 });
  assert.equal(r7.sessions, 2);
  assert.equal(r7.last.chest, day(4));
  assert.equal(ago(day(4), now), '4 days ago');
  assert.equal(ago(now - 1000, now), 'today');
  assert.equal(muscleLoad(S, ex, { days: 14 }, now).counts.chest, 3);
  assert.deepEqual(muscleLoad(S, ex, { workouts: 1 }, now).counts, { quads: 1, rearDelts: 1 });
  assert.equal(heat(0), '#2d2d33');
  assert.equal(heat(10), '#ff6b1f');
});

import { trainingTip } from '../js/logic/stats.js';
test('trainingTip: a lot vs neglected, next routine, and silence when there is nothing to say', () => {
  const pushPull = { chest: 11, shoulders: 6, rearDelts: 4, triceps: 8, biceps: 8, back: 12 };
  assert.equal(trainingTip(pushPull, 'leg'), 'You trained arms and back a lot in the past two weeks and neglected legs. Leg is up next, which helps.');
  assert.equal(trainingTip(pushPull, 'push'), 'You trained arms and back a lot in the past two weeks and neglected legs.');
  assert.equal(trainingTip({ chest: 4, back: 4, shoulders: 3, biceps: 2, triceps: 2, quads: 4 }, 'pull'), null); // balanced
  assert.equal(trainingTip({ chest: 3, back: 2 }, 'push'), null); // too little data
  assert.equal(trainingTip({ chest: 6, back: 6, shoulders: 6, biceps: 6, quads: 6, triceps: 0 }, 'pull'), null);
  const onlyLittle = trainingTip({ chest: 6, back: 6, shoulders: 6, biceps: 3, triceps: 3, quads: 0 }, 'push');
  assert.equal(onlyLittle, "You haven't trained legs much in the past two weeks.");
  assert.equal(trainingTip({ chest: 30, back: 5, shoulders: 5, biceps: 5, quads: 5 }, 'leg'), 'You trained chest the most in the past two weeks. Nothing is falling behind.');
});

import { weeklyCounts, progressInsight } from '../js/logic/stats.js';
test('weeklyCounts buckets rolling 7-day windows, oldest first, ignoring circuits', () => {
  const now = new Date(2026, 10, 25, 12).getTime(), d = 86400000;
  const S = [{ start: now - 1 * d, entries: [1] }, { start: now - 6 * d, entries: [1] }, { start: now - 8 * d, entries: [1] }, { start: now - 40 * d, entries: [1] }, { start: now - 2 * d, entries: [] }];
  assert.deepEqual(weeklyCounts(S, now, 6), [1, 0, 0, 0, 1, 2]);
});
test('progressInsight: stall wins, then gain, else null', () => {
  const now = new Date(2026, 10, 25, 12).getTime(), d = 86400000;
  const mk = (days, exId, w, r, gym = 'big') => ({ id: `${exId}${days}`, gymId: gym, start: now - days * d, entries: [{ exerciseId: exId, sets: [{ w, r, done: true }, { w, r, done: true }] }] });
  const ex = { bench: { type: 'wr' }, curl: { type: 'wr' }, pull: { type: 'bw' } };
  const gyms = [{ id: 'big', increment: 2.5 }];
  const stalled = [50, 40, 30, 20, 10, 3].map((dd) => mk(dd, 'bench', 50, 10));
  const gaining = [100, 80, 60, 40, 20].map((dd, i) => mk(dd, 'curl', 20 + i * 2.5, 10));
  const r1 = progressInsight([...stalled, ...gaining], ex, gyms, now);
  assert.equal(r1.kind, 'stall'); assert.equal(r1.exerciseId, 'bench'); assert.equal(r1.k, 6); assert.equal(r1.w, 50);
  const r2 = progressInsight(gaining, ex, gyms, now);
  assert.equal(r2.kind, 'gain'); assert.equal(r2.from, 20); assert.equal(r2.to, 30);
  const reps = [80, 60, 40, 20].map((dd, i) => mk(dd, 'pull', 0, 6 + i * 2));
  assert.deepEqual([progressInsight(reps, ex, gyms, now).kind, progressInsight(reps, ex, gyms, now).repsMode], ['gain', true]);
  assert.equal(progressInsight([mk(5, 'bench', 50, 10), mk(3, 'bench', 52.5, 8)], ex, gyms, now), null); // too few workouts
  const old = [300, 280, 260, 240].map((dd) => mk(dd, 'bench', 50, 10));
  assert.equal(progressInsight(old, ex, gyms, now), null); // outside the window
});
