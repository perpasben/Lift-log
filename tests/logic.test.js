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

import { nextActiveSet, personalRecord, addedDefaults, lastPreferGym, buildWorkout, lastFor, restDue, routineChanges, toSession, stats } from '../js/logic/workout.js';
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

import { muscleLoad, heat, ago, mapHeat } from '../js/logic/stats.js';
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
  const pushPull = { chest: 11, shoulders: 6, rearDelts: 4, triceps: 8, biceps: 8, lats: 12 };
  assert.equal(trainingTip(pushPull, 'leg'), 'You trained arms and back a lot in the past two weeks and neglected legs. Leg is up next, which helps.');
  assert.equal(trainingTip(pushPull, 'push'), 'You trained arms and back a lot in the past two weeks and neglected legs.');
  assert.equal(trainingTip({ chest: 4, lats: 4, shoulders: 3, biceps: 2, triceps: 2, quads: 4 }, 'pull'), null); // balanced
  assert.equal(trainingTip({ chest: 3, lats: 2 }, 'push'), null); // too little data
  assert.equal(trainingTip({ chest: 6, lats: 6, shoulders: 6, biceps: 6, quads: 6, triceps: 0 }, 'pull'), null);
  const onlyLittle = trainingTip({ chest: 6, lats: 6, shoulders: 6, biceps: 3, triceps: 3, quads: 0 }, 'push');
  assert.equal(onlyLittle, "You haven't trained legs much in the past two weeks.");
  assert.equal(trainingTip({ chest: 30, lats: 5, shoulders: 5, biceps: 5, quads: 5 }, 'leg'), 'You trained chest the most in the past two weeks. Nothing is falling behind.');
});

import { weeklyCounts, progressInsight, lastTimeNote, ROUTINE_MUSCLES } from '../js/logic/stats.js';
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

test('progressInsight can be limited to a gym and to certain exercises', () => {
  const now = new Date(2026, 10, 25, 12).getTime(), d = 86400000;
  const mk = (days, exId, w, r, gym) => ({ id: `${exId}${days}${gym}`, gymId: gym, start: now - days * d, entries: [{ exerciseId: exId, sets: [{ w, r, done: true }] }] });
  const ex = { bench: { type: 'wr', muscle: 'Chest' }, ext: { type: 'wr', muscle: 'Quads' } };
  const gyms = [{ id: 'big', increment: 2.5 }, { id: 'office', increment: 2.5 }];
  const S = [...[50, 40, 30, 20].map((dd) => mk(dd, 'bench', 50, 10, 'big')), ...[50, 40, 30, 20, 10].map((dd) => mk(dd, 'ext', 40, 10, 'big')), ...[9, 8, 7, 6].map((dd) => mk(dd, 'bench', 20, 10, 'office'))];
  const legsOnly = progressInsight(S, ex, gyms, now, 120, { filter: (id) => ROUTINE_MUSCLES.leg.includes(ex[id]?.muscle) });
  assert.equal(legsOnly.exerciseId, 'ext');
  const pushOnly = progressInsight(S, ex, gyms, now, 120, { filter: (id) => ROUTINE_MUSCLES.push.includes(ex[id]?.muscle), gymId: 'office' });
  assert.equal(pushOnly.gymId, 'office'); assert.equal(pushOnly.w, 20);
  assert.equal(progressInsight(S, ex, gyms, now, 120, { filter: () => false }), null);
});
test('lastTimeNote: first planned lift with history, double progression hint', () => {
  const ex = { a: { name: 'Leg Extension', type: 'wr' }, b: { name: 'Calf Raise', type: 'wr' } };
  const S = [{ gymId: 'big', start: new Date(2026, 10, 4).getTime(), entries: [{ exerciseId: 'b', sets: [{ w: 40, r: 12, done: true }, { w: 40, r: 12, done: true }] }] }];
  assert.equal(lastTimeNote(S, [{ id: 'a', repMin: 10, repMax: 12 }, { id: 'b', repMin: 10, repMax: 12 }], 'big', ex), 'Calf Raise: last time 40 kg \u00d7 12, 4 Nov. Try 42.5 kg.');
  const S2 = [{ gymId: 'big', start: new Date(2026, 10, 4).getTime(), entries: [{ exerciseId: 'a', sets: [{ w: 40, r: 10, done: true }, { w: 40, r: 11, done: true }] }] }];
  assert.equal(lastTimeNote(S2, [{ id: 'a', repMin: 10, repMax: 12 }], 'big', ex), 'Leg Extension: last time 40 kg \u00d7 11, 4 Nov. Aim for 12 reps at 40 kg.');
  assert.equal(lastTimeNote(S2, [{ id: 'a' }], 'office', ex), null);
});

test('personalRecord: only when the whole exercise is completed at a heavier weight', () => {
  const mk = (gym, w, r, n = 4) => ({ gymId: gym, start: 1, entries: [{ exerciseId: 'b', sets: Array.from({ length: n }, () => ({ w, r, done: true })) }] });
  const hist = [mk('big', 50, 10), mk('big', 52.5, 8), mk('big', 52.5, 10)];
  const day = (w, r, n = 4, done = n) => Array.from({ length: n }, (_, i) => ({ w, r, done: i < done }));
  assert.equal(personalRecord([hist[0]], 'b', 'big', day(99, 5)), null); // too little history
  assert.deepEqual(personalRecord(hist, 'b', 'big', day(55, 8)), { w: 55, r: 8 });
  assert.equal(personalRecord(hist, 'b', 'big', day(55, 8, 4, 3)), null); // one set still to do: not completed yet
  assert.equal(personalRecord(hist, 'b', 'big', [{ w: 70, r: 5, done: true }, ...day(50, 8, 3)]), null); // one heavy set is not enough
  assert.equal(personalRecord(hist, 'b', 'big', day(52.5, 10)), null); // equal is not a record
  assert.deepEqual(personalRecord(hist, 'b', 'big', day(52.5, 11)), { w: 52.5, r: 11 }); // same weight, more reps
  assert.equal(personalRecord(hist, 'b', 'big', day(80, 5, 2)), null); // fewer than 3 sets
  assert.equal(personalRecord([...hist, mk('office', 90, 5)], 'b', 'big', day(60, 5))?.w, 60); // other gyms ignored
});

test('nextActiveSet follows the last ticked set and moves on when an exercise is finished', () => {
  const ent = (id, n, extra = {}) => ({ id, exerciseId: id, sets: Array.from({ length: n }, () => ({ done: false })), ...extra });
  const w = { entries: [ent('a', 3), ent('b', 3), ent('c', 2), ent('d', 2, { skipped: true })] };
  assert.deepEqual(nextActiveSet(w), { id: 'a', i: 0 });          // nothing ticked: first set of the first exercise
  w.entries[2].sets[0].done = true; w.lastDone = { id: 'c', i: 0 };  // you started with the third exercise
  assert.deepEqual(nextActiveSet(w), { id: 'c', i: 1 });          // the highlight follows you there
  w.entries[0].sets[0].done = true; w.lastDone = { id: 'a', i: 0 };  // back to the top
  assert.deepEqual(nextActiveSet(w), { id: 'a', i: 1 });
  w.entries[2].sets[1].done = true; w.lastDone = { id: 'c', i: 1 };  // finishing the third exercise: on to the next one with sets
  assert.deepEqual(nextActiveSet(w), { id: 'a', i: 1 });          // d is skipped, wraps to a
  w.entries[1].sets.forEach((x) => { x.done = true; }); w.entries[0].sets.forEach((x) => { x.done = true; }); w.lastDone = { id: 'a', i: 2 };
  assert.equal(nextActiveSet(w), null);                            // everything done
  const w2 = { entries: [ent('a', 3), ent('b', 3)], lastDone: { id: 'a', i: 2 } }; w2.entries[0].sets[2].done = true;
  assert.deepEqual(nextActiveSet(w2), { id: 'a', i: 0 });         // ticked the last set first: back to the earlier undone one
});

test('mapHeat: grey when idle, light accent for few sets, full accent from 10 sets', () => {
  assert.equal(mapHeat(0), '#2d2d33');
  assert.equal(mapHeat(10), '#ff6b1f');
  assert.equal(mapHeat(30), '#ff6b1f');
  assert.equal(mapHeat(0.001), '#ffc9a2');
  const mid = mapHeat(5);
  assert.notEqual(mid, '#ffc9a2'); assert.notEqual(mid, '#ff6b1f');
});

test('muscleKeyOf: splits the back into lats, upper back and lower back', async () => {
  const { muscleKeyOf } = await import('../js/logic/stats.js');
  const ex = (name, muscle = 'Back') => ({ id: name.toLowerCase().replace(/ /g, '-'), name, muscle });
  assert.equal(muscleKeyOf(ex('Pull-Up')), 'lats');
  assert.equal(muscleKeyOf(ex('Lat Pulldown')), 'lats');
  assert.equal(muscleKeyOf(ex('Straight Arm Lat Pulldown')), 'lats');
  assert.equal(muscleKeyOf(ex('Seated Machine Row')), 'upperBack');
  assert.equal(muscleKeyOf(ex('Barbell Row')), 'upperBack');
  assert.equal(muscleKeyOf(ex('Deadlift')), 'lowerBack');
  assert.equal(muscleKeyOf(ex('Bench Press', 'Chest')), 'chest');
  assert.equal(muscleKeyOf(ex('Face Pull', 'Rear delts')), 'rearDelts');
  assert.equal(muscleKeyOf(null), null);
});

test('groupLoad: few groups for the list, busiest muscle sets the colour', async () => {
  const { groupLoad } = await import('../js/logic/stats.js');
  const g = groupLoad({ chest: 10, lats: 7, upperBack: 3, quads: 4, hamstrings: 2, forearms: 1, neck: 2, abs: 0 });
  assert.deepEqual(g.map((x) => [x.name, x.total, x.top]), [['Chest', 10, 10], ['Back', 10, 7], ['Legs', 6, 4], ['Shoulders', 2, 2], ['Arms', 1, 1]]);
  assert.deepEqual(groupLoad({}), []);
});

import { MUSCLE_WEIGHTS, weightsFor } from '../js/logic/muscles.js';
import { CATALOG } from '../js/seed.js';
import { MUSCLE_LABEL as LABELS } from '../js/logic/stats.js';
test('muscle weights: every real exercise is covered, with a main muscle and valid keys', () => {
  for (const ex of CATALOG) {
    if (ex.muscle === 'Mobility') continue;
    const w = MUSCLE_WEIGHTS[ex.id];
    assert.ok(w, `${ex.name} has no weights`);
    assert.ok(Object.values(w).includes(1), `${ex.name} has no main muscle (weight 1)`);
    for (const [k, v] of Object.entries(w)) { assert.ok(LABELS[k], `${ex.name}: unknown muscle ${k}`); assert.ok(v > 0 && v <= 1, `${ex.name}: bad weight for ${k}`); }
  }
  for (const id of Object.keys(MUSCLE_WEIGHTS)) assert.ok(CATALOG.some((e) => e.id === id), `${id} is not in the catalog`);
});

test('muscleLoad: an exercise counts for every muscle it works, once in the total', () => {
  const now = new Date(2026, 10, 25, 12).getTime();
  const exs = { 'bar-dip': { id: 'bar-dip', name: 'Bar Dip', muscle: 'Chest' }, mine: { id: 'mine', name: 'Cable Thing', muscle: 'Biceps' }, 'full': { id: 'full', name: 'Mobility', muscle: 'Mobility' } };
  const set = (done = true, warm = false) => ({ w: 0, r: 10, warm, done });
  const s = { start: now - 1000, entries: [
    { exerciseId: 'bar-dip', sets: [set(), set(), set(), set(), set(true, true), set(false)] },
    { exerciseId: 'mine', sets: [set(), set()] },
    { exerciseId: 'full', sets: [set(), set()] },
  ] };
  const r = muscleLoad([s], exs, { days: 7 }, now);
  assert.equal(r.counts.chest, 4); assert.equal(r.counts.triceps, 3); assert.equal(r.counts.shoulders, 2);
  assert.equal(r.counts.biceps, 2);          // not in the table: its own muscle at weight 1
  assert.equal(r.counts.abs, undefined);
  assert.equal(r.sets, 6);                   // 4 dip sets + 2 curl sets; warm-up, undone and mobility not counted
});

import { periodRange, PERIODS, groupLoad as gl2, plannedGroups } from '../js/logic/stats.js';
test('periodRange: rolling days, this year, since start and a custom range (both days included)', () => {
  const now = new Date(2026, 10, 25, 12).getTime();
  assert.deepEqual(periodRange('d28', now), { days: 28 });
  assert.deepEqual(periodRange('m12', now), { days: 365 });
  assert.deepEqual(periodRange('year', now), { from: new Date(2026, 0, 1).getTime(), to: now });
  assert.deepEqual(periodRange('all', now), { from: 0, to: now });
  const c = periodRange('custom', now, { from: '2026-11-01', to: '2026-11-10' });
  assert.equal(c.from, new Date(2026, 10, 1).getTime());
  assert.equal(c.to, new Date(2026, 10, 10, 23, 59, 59, 999).getTime());
  assert.equal(PERIODS.length, 8);
});

test('muscleLoad: absolute ranges include only sessions inside them', () => {
  const now = new Date(2026, 10, 25, 12).getTime(), d = 86400000;
  const exs = { x: { id: 'x', name: 'Triceps Pushdown With Bar', muscle: 'Triceps' } };
  const sess = (ago) => ({ start: now - ago * d, entries: [{ exerciseId: 'x', sets: [{ done: true }, { done: true }] }] });
  const all = [sess(1), sess(20), sess(200)];
  assert.equal(muscleLoad(all, exs, periodRange('d7', now), now).counts.triceps, 2);
  assert.equal(muscleLoad(all, exs, periodRange('d28', now), now).counts.triceps, 4);
  assert.equal(muscleLoad(all, exs, periodRange('all', now), now).counts.triceps, 6);
  const mid = periodRange('custom', now, { from: new Date(now - 25 * d).toISOString().slice(0, 10), to: new Date(now - 15 * d).toISOString().slice(0, 10) });
  assert.equal(muscleLoad(all, exs, mid, now).counts.triceps, 2);
});

test('groupLoad: groups you should train stay in the list at 0; plannedGroups reads them from the routines', () => {
  const g = gl2({ chest: 4 }, ['Chest', 'Back', 'Legs']);
  assert.deepEqual(g.map((x) => [x.name, x.total]), [['Chest', 4], ['Back', 0], ['Legs', 0]]);
  assert.deepEqual(gl2({ chest: 4 }, []).map((x) => x.name), ['Chest']);
  const routines = [{ id: 'push', blocks: [{ items: [{ slotId: 's1' }] }] }, { id: 'pull', blocks: [{ items: [{ slotId: 's2' }] }], gymBlocks: { g2: [{ items: [{ slotId: 's3' }] }] } }];
  const exs = { press: { id: 'bench-press', name: 'Bench Press', muscle: 'Chest' }, row: { id: 'seated-machine-row', name: 'Seated Machine Row', muscle: 'Back' }, curl: { id: 'barbell-curl', name: 'Barbell Curl', muscle: 'Biceps' } };
  const map = { [akey('s1', 'g1')]: 'press', [akey('s2', 'g1')]: 'row', [akey('s3', 'g2')]: 'curl' };
  assert.deepEqual(plannedGroups(routines, map, exs, [{ id: 'g1' }, { id: 'g2' }]).sort(), ['Arms', 'Back', 'Chest']);
});

import { estimateMinutes } from '../js/logic/stats.js';
test('estimateMinutes: same routine first, then workouts of similar size, then your pace per exercise', () => {
  const min = 60000;
  const s = (id, routineId, gymId, n, m, day) => ({ id, routineId, gymId, start: day * 86400000, end: day * 86400000 + m * min, entries: Array.from({ length: n }, () => ({ sets: [{ done: true }] })) });
  const hist = [s('a', 'push', 'big', 5, 50, 10), s('b', 'push', 'big', 5, 56, 9), s('c', 'push', 'big', 4, 44, 8), s('d', 'pull', 'big', 5, 40, 7)];
  // same routine and gym: median of 50, 56, 44
  assert.deepEqual(estimateMinutes(hist, { routineId: 'push', gymId: 'big', count: 5 }), { minutes: 50, basis: 'routine' });
  // another routine never done there: the workouts with 4-6 exercises (all four) -> median of 40, 44, 50, 56 = 47
  assert.deepEqual(estimateMinutes(hist, { routineId: 'leg', gymId: 'big', count: 5 }), { minutes: 47, basis: 'size' });
  // a very different size: your pace per exercise (about 10, 11.2, 11, 8 -> 10.5) x 9 exercises
  assert.equal(estimateMinutes(hist, { routineId: 'leg', gymId: 'big', count: 9 }).basis, 'pace');
  assert.equal(estimateMinutes(hist, { routineId: 'leg', gymId: 'big', count: 9 }).minutes, 95);
  // not enough history: rough guess; outliers (under 15 or over 150 minutes) and workouts without lifting are ignored
  assert.equal(estimateMinutes([], { routineId: 'push', gymId: 'big', count: 4, sets: 14 }).basis, 'guess');
  assert.equal(estimateMinutes([s('x', 'push', 'big', 5, 5, 1), s('y', 'push', 'big', 5, 400, 2)], { routineId: 'push', gymId: 'big', count: 5 }).basis, 'guess');
});

import { planTopUp, WEEK_TARGET, PRIORITY } from '../js/logic/topup.js';
import { seedGyms } from '../js/seed.js';
test('planTopUp: fills the biggest gaps, one exercise per muscle, legs and back before arms', () => {
  const [office, big] = seedGyms();
  const trained = { chest: 12, lats: 10, upperBack: 8, quads: 9, hamstrings: 8, glutes: 7, shoulders: 10, biceps: 8, triceps: 9, rearDelts: 5, abs: 1, calves: 2, lowerBack: 4, forearms: 3, adductors: 3, shins: 0 };
  const plan = planTopUp({ counts: trained, exercises: CATALOG, gym: big });
  assert.equal(plan.items.length, 3);
  assert.equal(plan.complete, false);
  assert.deepEqual(plan.items.map((i) => i.main).sort(), ['abs', 'calves', 'rearDelts']);       // abs and calves barely trained, then the rear delts
  assert.equal(new Set(plan.items.map((i) => i.main)).size, 3);
  assert.ok(plan.items.every((i) => i.sets >= 2 && i.sets <= 4));
  assert.deepEqual(plan.gaps.slice(0, 2).map((g) => g.key), ['abs', 'calves']);
  // equipment: the office has cables but no leg press, so the calves come from another exercise
  const o = planTopUp({ counts: trained, exercises: CATALOG, gym: office });
  assert.ok(!o.items.some((i) => i.exerciseId === 'calf-raise-in-leg-press'));
  // legs matter more than chest: with both empty, the quads come first
  const empty = Object.fromEntries(Object.keys(trained).map((k) => [k, 10]));
  const both = planTopUp({ counts: { ...empty, chest: 0, quads: 0, hamstrings: 0 }, exercises: CATALOG, gym: big });
  assert.equal(both.items[0].main, 'quads');
  assert.deepEqual(both.items.map((i) => i.main).sort(), ['chest', 'hamstrings', 'quads']);
  assert.ok(PRIORITY.quads > PRIORITY.biceps && WEEK_TARGET.chest === 10);
});

test('planTopUp: when every muscle is covered it suggests posture and mobility, the one you did longest ago first', () => {
  const [, big] = seedGyms();
  const full = Object.fromEntries(Object.keys(WEEK_TARGET).map((k) => [k, 12]));
  const plan = planTopUp({ counts: full, exercises: CATALOG, gym: big });
  assert.equal(plan.complete, true);
  assert.deepEqual(plan.items.map((i) => i.kind), ['posture', 'mobility', 'mobility']);
  const day = 86400000, now = Date.now();
  const did = (id, ago) => ({ start: now - ago * day, entries: [{ exerciseId: id, sets: [{ done: true }] }] });
  const hist = [did('face-pull', 2), did('cable-external-shoulder-rotation', 30), did('open-book', 3), did('cat-cow', 1)];
  const p2 = planTopUp({ counts: full, exercises: CATALOG, gym: big, sessions: hist, now });
  assert.equal(p2.items[0].exerciseId, 'cable-external-shoulder-rotation');
  assert.ok(!p2.items.slice(1).some((i) => i.exerciseId === 'cat-cow' || i.exerciseId === 'open-book')); // recently done: others come first
});

import { trainingDaysPerWeek, strengthIndex, weekStart } from '../js/logic/stats.js';
test('trainingDaysPerWeek: distinct training days per calendar week (Mon-Sun), oldest first', () => {
  const now = new Date(2026, 10, 25, 12).getTime(); // Wednesday
  const at = (d, h = 18) => new Date(2026, 10, d, h).getTime();
  const e = [{ exerciseId: 'x', sets: [{ done: true }] }];
  const list = [{ start: at(23), entries: e }, { start: at(24), entries: e }, { start: at(24, 9), entries: e }, { start: at(16), entries: e }, { start: at(1), entries: e }, { start: at(25), entries: [] }];
  const w = trainingDaysPerWeek(list, now, 4);
  assert.equal(w.length, 4);
  assert.equal(w.at(-1).days, 2);          // Mon 23 and Tue 24 (two workouts on the 24th count as one day); the empty one is ignored
  assert.equal(w.at(-2).days, 1);          // Mon 16
  assert.equal(w.at(-3).days, 0);
  assert.equal(w[0].days, 0);              // 1 Nov (a Sunday) belongs to the week before the four shown
  assert.equal(new Date(w.at(-1).start).getDay(), 1);
  assert.equal(weekStart(now), new Date(2026, 10, 23).getTime());
});

test('strengthIndex: 100 at the start, median across lifts, null without enough data', () => {
  const day = 86400000, start = new Date(2026, 8, 7).getTime(); // a Monday
  const exs = { a: { type: 'wr' }, b: { type: 'wr' }, c: { type: 'wr' }, d: { type: 'wr' } };
  const mk = (id, week, w) => ({ id: `${id}${week}`, gymId: 'g', start: start + week * 7 * day + 3600000, entries: [{ exerciseId: id, sets: [{ w, r: 10, done: true }, { w: 20, r: 10, warm: true, done: true }] }] });
  const sessions = [];
  for (let i = 0; i < 8; i++) { sessions.push(mk('a', i, 100 + 5 * i), mk('b', i, 60 + 3 * i), mk('c', i, 40)); } // a, b improve; c stays
  const now = start + 7 * 7 * day + 2 * day;
  const r = strengthIndex(sessions, exs, now);
  assert.equal(r.lifts, 3);
  assert.equal(r.points[0].v, 100);
  // at the end a is 135/105 = 1.286, b is 81/63 = 1.286, c is 1.0 -> median 1.286
  assert.equal(r.points.at(-1).v, 128.6);
  assert.ok(r.points.every((p, i) => i === 0 || p.t > r.points[i - 1].t));
  assert.equal(strengthIndex(sessions.filter((s) => s.entries[0].exerciseId !== 'c'), exs, now), null); // only two lifts
  assert.equal(strengthIndex([], exs, now), null);
});

import { assessLoad, trainingStreak, recentStrengthRatio, LIMITS } from '../js/logic/load.js';
test('assessLoad: a normal week is fine; a week-long streak plus a volume spike asks for rest; resting clears it', () => {
  const day = 86400000, now = new Date(2026, 10, 25, 12).getTime();
  const exs = { 'bench-press': { id: 'bench-press', name: 'Bench Press', type: 'wr', muscle: 'Chest' }, 'seated-leg-press': { id: 'seated-leg-press', name: 'Seated Leg Press', type: 'wr', muscle: 'Quads' } };
  const sess = (ago, w = 60, n = 6) => ({ id: `s${ago}`, gymId: 'g', start: now - ago * day - 3600000, entries: [{ exerciseId: 'bench-press', sets: Array.from({ length: n }, () => ({ w, r: 8, done: true })) }, { exerciseId: 'seated-leg-press', sets: Array.from({ length: n }, () => ({ w: 120, r: 10, done: true })) }] });
  const usual = []; for (let wk = 1; wk <= 5; wk++) for (const d of [0, 2, 4]) usual.push(sess(wk * 7 + d + 1)); // 3 workouts a week, 12 sets each, for 5 weeks
  assert.equal(assessLoad(usual, exs, now).level, 'ok');
  assert.equal(assessLoad([], exs, now).level, 'ok');

  const heavy = [...usual]; for (let a = 0; a < 7; a++) heavy.push(sess(a, 60, 7));             // 7 days in a row, 14 sets each
  const r = assessLoad(heavy, exs, now);
  assert.equal(r.level, 'rest');
  assert.ok(r.reasons.some((x) => x.kind === 'streak') && r.reasons.some((x) => x.kind === 'spike'));
  assert.equal(trainingStreak(heavy, now), 7);

  const rested = [...usual]; for (let a = 3; a < 10; a++) rested.push(sess(a, 60, 7));          // the same load, but nothing for the last 2 days
  assert.equal(assessLoad(rested, exs, now).level, 'ok');

  const five = [...usual]; for (let a = 0; a < 5; a++) five.push(sess(a, 60, 4));                // 5 days in a row at a lighter pace: fine
  assert.equal(assessLoad(five, exs, now).level, 'ok');
  const seven = [...usual]; for (let a = 0; a < 7; a++) seven.push(sess(a, 60, 3));              // 7 days in a row but light: a heads up, not a stop
  const w = assessLoad(seven, exs, now);
  assert.equal(w.level, 'watch');
  assert.ok(w.score >= LIMITS.watch && w.score < LIMITS.rest);
});

test('assessLoad: a sustained drop in your lifts only weighs heavily together with high load', () => {
  const day = 86400000, now = new Date(2026, 10, 25, 12).getTime();
  const ids = ['bench-press', 'seated-leg-press', 'lat-pulldown'];
  const exs = Object.fromEntries(ids.map((id) => [id, { id, name: id, type: 'wr', muscle: 'Chest' }]));
  const sess = (ago, w) => ({ id: `s${ago}`, gymId: 'g', start: now - ago * day - 3600000, entries: ids.map((id) => ({ exerciseId: id, sets: Array.from({ length: 4 }, () => ({ w, r: 8, done: true })) })) });
  const before = [30, 27, 24, 20].map((a) => sess(a, 100));                                      // a month ago
  const dipped = [...before, ...[10, 7, 4].map((a) => sess(a, 90)), sess(1, 90)];               // since then 10% lower, but every other day
  assert.ok(recentStrengthRatio(dipped, exs, now) <= LIMITS.drop);
  assert.equal(assessLoad(dipped, exs, now).level, 'ok');                                        // a dip alone is not a rest order
  const dippedAndGrinding = [...before, ...[10, 7, 6, 5, 4, 3, 2, 1, 0].map((a) => sess(a, 90))]; // plus nine days in a row
  const r = assessLoad(dippedAndGrinding, exs, now);
  assert.equal(r.level, 'rest');
  assert.ok(r.reasons.some((x) => x.kind === 'drop'));
});
