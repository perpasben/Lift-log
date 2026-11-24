import * as db from '../db.js';
import { h, sheet, toast } from '../ui.js';
import { nextRoutine, pendingFor, ROTATION } from '../logic/carryover.js';
import { buildWorkout } from '../logic/workout.js';
import { getActive, setActive } from '../active.js';
import { workoutView } from './workout.js';
import { extrasView } from './extras.js';
import { muscleMapSection } from './musclemap.js';
import { insightsCarousel } from './carousel.js';
import { accent2 } from '../theme.js';
import { akey } from '../logic/substitution.js';

const RCOL = { push: '#e8590c', pull: '#4f84ee', leg: '#25a97a' };
// Segmented ring: one segment per workout in the last 7 days, out of a goal of 4.
function weekDial(done, goal = 4) {
  const ns = 'http://www.w3.org/2000/svg', R = 30, C = 40, gap = 16, seg = 360 / goal - gap;
  const pt = (deg) => { const a = ((deg - 90) * Math.PI) / 180; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
  let paths = '';
  for (let i = 0; i < goal; i++) {
    const a0 = i * (360 / goal) + gap / 2, a1 = a0 + seg;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    paths += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${i < done ? accent2().hex : '#2a2724'}" stroke-width="7"/>`;
  }
  const el = h('div', { class: 'dial', role: 'img', 'aria-label': `${done} of ${goal} workouts in the last 7 days` });
  el.innerHTML = `<svg viewBox="0 0 80 80" width="84" height="84">${paths}<text x="40" y="46" text-anchor="middle" class="dial-n">${done}</text></svg><span>last 7 days<br>goal ${goal}</span>`;
  return el;
}

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
  const [sessions, routines, gyms, pending, settings, exAll, asgAll] = await Promise.all([db.all('sessions'), db.all('routines'), db.all('gyms'), db.all('pending'), db.kvGet('settings', {}), db.all('exercises'), db.all('assignments')]);
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
      weekDial(sessions.filter((x) => x.entries.length && x.start > Date.now() - 7 * 86400000).length),
      h('div', { class: 'kick' }, 'Up next'),
      h('div', { class: 'big' }, routine.name),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, `${items} exercises`), h('span', { class: 'chip' }, gym?.name), carried ? h('span', { class: 'chip ac' }, `${carried} carried over`) : null),
      h('button', { class: 'btn pri block', onclick: () => start(next, nav) }, 'Start workout'));

  const row = (title, desc, fn) => h('button', { class: 'row', onclick: fn }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null));
  const exMap = Object.fromEntries(exAll.map((e) => [e.id, e]));
  const asg = Object.fromEntries(asgAll.map((a) => [a.id, a.exerciseId]));
  const planned = (routine.gymBlocks?.[gym?.id] || routine.blocks).flatMap((b) => b.items.map((it) => ({ id: asg[akey(it.slotId, gym?.id)], repMin: it.repMin, repMax: it.repMax }))).filter((p) => p.id);
  return h('div', { style: 'padding-top:18px' }, hero,
    !active && sessions.length >= 3 ? insightsCarousel({ sessions, exercises: exMap, gyms, nextId: next, gym, planned }) : null,
    active ? null : h('h2', {}, 'Or instead'),
    active ? null : h('div', { class: 'pair' }, ...others.map((r) => h('button', { class: 'tile', style: `--rc:${RCOL[r]}`, onclick: () => start(r, nav) }, h('span', { class: 'tile-dot' }), h('span', { class: 'tile-n' }, NAMES[r]), h('span', { class: 'tile-s' }, `${routines.find((x) => x.id === r)?.blocks.reduce((n, b) => n + b.items.length, 0)} exercises`)))),
    h('h2', {}, 'Extras'),
    h('div', { class: 'card plain' },
      row('Extra workout', extra ? `${extra} parked` : 'Nothing parked', () => (active ? toast('Finish the current workout first') : start('extra', nav))),
      row('Extras', 'Mobility, abs, farmer’s walk', () => nav.push(extrasView))),
    h('p', { class: 'muted', style: 'margin-top:22px;font-size:14px' }, sessions.length ? `${sessions.length} workouts logged.` : 'No workouts yet. Import your StrengthLog history in Settings.'),
    await muscleMapSection());
}
