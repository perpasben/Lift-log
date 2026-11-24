import * as db from '../db.js';
import { h, sheet, toast } from '../ui.js';
import { nextRoutine, pendingFor, ROTATION } from '../logic/carryover.js';
import { buildWorkout } from '../logic/workout.js';
import { getActive, setActive } from '../active.js';
import { workoutView } from './workout.js';
import { extrasView } from './extras.js';
import { muscleMapSection } from './musclemap.js';

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout' };

function chooseGym(gyms, preselected, routineName) {
  return new Promise((res) => {
    let pick = preselected, settled = false;
    const done = (v, close) => { if (!settled) { settled = true; res(v); } close(); };
    sheet((close) => {
      const rows = gyms.map((g) => h('button', { class: 'row', 'aria-pressed': String(g.id === pick), onclick: (ev) => { pick = g.id; rows.forEach((r) => r.querySelector('.sw').setAttribute('aria-checked', String(r === ev.currentTarget))); } },
        h('div', { class: 'grow t' }, g.name), h('span', { class: 'sw', 'aria-checked': String(g.id === pick), style: 'pointer-events:none' })));
      return [h('h3', {}, 'Which gym are you at?'), h('p', { class: 'muted', style: 'margin:0 0 12px' }, routineName),
        h('div', { class: 'card' }, ...rows),
        h('button', { class: 'btn pri block', style: 'margin-top:16px', onclick: () => done(pick, close) }, 'Start')];
    });
    new MutationObserver((_, ob) => { if (!document.querySelector('.sheet')) { ob.disconnect(); if (!settled) { settled = true; res(null); } } }).observe(document.getElementById('layer'), { childList: true });
  });
}

async function start(routineId, nav) {
  const [gyms, settings, routines, asg, exList, sessions, pending] = await Promise.all([db.all('gyms'), db.kvGet('settings', {}), db.all('routines'), db.all('assignments'), db.all('exercises'), db.all('sessions'), db.all('pending')]);
  const gymId = await chooseGym(gyms, gyms.some((g) => g.id === settings.lastGymId) ? settings.lastGymId : gyms[0]?.id, NAMES[routineId] || routineId);
  if (!gymId) return;
  const gym = gyms.find((g) => g.id === gymId);
  const w = buildWorkout({
    routineId, routine: routines.find((r) => r.id === routineId) || null, gym,
    assignments: Object.fromEntries(asg.map((a) => [a.id, a.exerciseId])),
    exercises: Object.fromEntries(exList.map((e) => [e.id, e])), sessions, pending,
  });
  await db.kvSet('settings', { ...settings, lastGymId: gymId });
  await setActive(w);
  nav.push(workoutView);
}

export async function trainView({ nav }) {
  const [sessions, routines, gyms, pending, settings] = await Promise.all([db.all('sessions'), db.all('routines'), db.all('gyms'), db.all('pending'), db.kvGet('settings', {})]);
  const active = getActive();
  const next = nextRoutine(sessions);
  const routine = routines.find((r) => r.id === next);
  const gym = gyms.find((g) => g.id === settings.lastGymId) || gyms[0];
  const carried = pendingFor(pending, next).length;
  const extra = pendingFor(pending, 'extra').length;
  const items = routine.blocks.reduce((n, b) => n + b.items.length, 0);
  const others = ROTATION.filter((r) => r !== next);

  const hero = active
    ? h('div', { class: 'hero' },
      h('div', { class: 'kick' }, 'In progress'),
      h('div', { class: 'big' }, NAMES[active.routineId] || 'Workout'),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, gyms.find((g) => g.id === active.gymId)?.name), h('span', { class: 'chip ac' }, `started ${new Date(active.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`)),
      h('button', { class: 'btn pri block', onclick: () => nav.push(workoutView) }, 'Resume workout'))
    : h('div', { class: 'hero' },
      h('div', { class: 'kick' }, 'Up next'),
      h('div', { class: 'big' }, routine.name),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, `${items} exercises`), h('span', { class: 'chip' }, gym?.name), carried ? h('span', { class: 'chip ac' }, `${carried} carried over`) : null),
      h('button', { class: 'btn pri block', onclick: () => start(next, nav) }, 'Start workout'));

  const row = (title, desc, fn) => h('button', { class: 'row', onclick: fn }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null));
  return h('div', { style: 'padding-top:18px' }, hero,
    h('h2', {}, 'Other'),
    h('div', { class: 'card' },
      ...(active ? [] : others.map((r) => row(`Do ${NAMES[r]} instead`, null, () => start(r, nav)))),
      row('Extra workout', extra ? `${extra} parked` : 'Nothing parked', () => (active ? toast('Finish the current workout first') : start('extra', nav))),
      row('Extras', 'Mobility, abs, farmer’s walk', () => nav.push(extrasView))),
    h('p', { class: 'muted', style: 'margin-top:22px;font-size:14px' }, sessions.length ? `${sessions.length} workouts logged.` : 'No workouts yet. Import your StrengthLog history in Settings.'),
    await muscleMapSection());
}
