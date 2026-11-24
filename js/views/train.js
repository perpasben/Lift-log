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
import { heroPhoto, photos, pickPhoto, setPhoto } from '../photos.js';
import { icon } from '../icons.js';
import { howTo } from '../howto.js';
import { photosView } from './photos.js';
import { weeklyCounts, muscleLoad } from '../logic/stats.js';

const RCOL = { push: '#e8590c', pull: '#4f84ee', leg: '#25a97a' };
// Segmented ring: one segment per workout in the last 7 days, out of a goal of 4.
function weekRing(done, goal = 4) {
  const R = 17, C = 22, gap = 18, seg = 360 / goal - gap;
  const pt = (deg) => { const a = ((deg - 90) * Math.PI) / 180; return [C + R * Math.cos(a), C + R * Math.sin(a)]; };
  let paths = '';
  for (let i = 0; i < goal; i++) {
    const a0 = i * (360 / goal) + gap / 2, a1 = a0 + seg;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    paths += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)}A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" fill="none" stroke="${i < done ? accent2().hex : '#2a2724'}" stroke-width="4.5"/>`;
  }
  return h('span', { class: 'ring', role: 'img', 'aria-label': `${done} of ${goal} workouts in the last 7 days`, html: `<svg viewBox="0 0 44 44" width="44" height="44">${paths}</svg>` });
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
  const others = ROTATION.filter((r) => r !== next);
  const exMap = Object.fromEntries(exAll.map((e) => [e.id, e]));
  const asg = Object.fromEntries(asgAll.map((a) => [a.id, a.exerciseId]));
  const shownId = active ? active.routineId : next;

  // today's plan at the gym you will use
  const plan = (routine.gymBlocks?.[gym?.id] || routine.blocks).flatMap((b) => b.items.map((it) => ({ id: asg[akey(it.slotId, gym?.id)], sets: b.rounds, repMin: it.repMin, repMax: it.repMax }))).filter((p) => p.id);
  const totalSets = plan.reduce((n, p) => n + p.sets, 0);
  const lens = sessions.filter((s) => s.routineId === next && s.gymId === gym?.id).sort((a, b) => b.start - a.start).slice(0, 6).map((s) => Math.round((s.end - s.start) / 60000)).filter((m) => m >= 15 && m <= 120).sort((a, b) => a - b);
  const minutes = lens.length ? lens[Math.floor(lens.length / 2)] : Math.round(totalSets * 3);

  const avatar = photos().avatar;
  const top = h('div', { class: 'home-top' },
    h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('b', {}, 'LiftLog')),
    h('button', { class: 'avatar', 'aria-label': 'Photos', style: avatar ? `background-image:url(${avatar})` : '', html: avatar ? '' : icon('user'), onclick: () => nav.push(photosView) }));

  const photo = heroPhoto(shownId);
  const changePhoto = async () => { const url = await pickPhoto(1000); if (!url) return; await setPhoto(shownId, url); nav.refresh(); };
  const name = NAMES[shownId] || 'Workout';
  const hero = h('div', { class: `hp ${photo ? 'has-photo' : ''}`, style: photo ? `background-image:url(${photo})` : '' },
    h('button', { class: 'hp-cam', 'aria-label': photo ? 'Change photo' : 'Add a photo', onclick: changePhoto, html: `${icon('camera')}${photo ? '' : '<span>Add photo</span>'}` }),
    h('div', { class: 'hp-e' }, active ? `In progress \u00b7 ${gyms.find((g) => g.id === active.gymId)?.name}` : `Up next \u00b7 ${gym?.name}`),
    h('div', { class: 'hp-h' }, `${name} day.`),
    h('div', { class: 'hp-s' }, active ? `Started ${new Date(active.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : [`${plan.length || routine.blocks.length} exercises`, `about ${minutes} min`, carried ? `${carried} carried over` : null].filter(Boolean).join(' \u00b7 ')),
    h('button', { class: 'cta', onclick: () => (active ? nav.push(workoutView) : start(next, nav)) }, active ? 'Resume workout' : 'Start workout', h('span', { html: icon('arrow') })));

  // three real numbers, one strip
  const lifting = sessions.filter((s) => s.entries.length);
  const wk = weeklyCounts(lifting, Date.now(), 6);
  const avg = Math.round((wk.reduce((a, b) => a + b, 0) / wk.length) * 10) / 10;
  const sets2w = Object.values(muscleLoad(sessions, exMap, { days: 14 }).counts).reduce((a, b) => a + b, 0);
  const strip = lifting.length >= 3 ? h('div', { class: 'strip' },
    h('div', {}, h('span', { class: 'si' }, weekRing(wk.at(-1))), h('b', { class: 'num' }, `${wk.at(-1)}/4`), h('span', {}, 'last 7 days')),
    h('div', {}, h('span', { class: 'si', html: icon('history') }), h('b', { class: 'num' }, String(avg)), h('span', {}, 'workouts a week')),
    h('div', {}, h('span', { class: 'si', html: icon('train') }), h('b', { class: 'num' }, String(sets2w)), h('span', {}, 'sets, 2 weeks'))) : null;

  const planSec = active || !plan.length ? null : h('div', {},
    h('div', { class: 'sec-h' }, h('b', {}, 'Today\u2019s plan'), h('span', {}, `${plan.length} exercises`)),
    h('div', { class: 'plan' }, ...plan.map((p, i) => {
      const ex = exMap[p.id];
      return h('button', { class: 'plan-row', onclick: () => sheet((close) => [h('h3', {}, ex.name), h('p', { class: 'muted', style: 'margin:0 0 10px' }, `${p.sets} sets${p.repMax ? ` \u00b7 ${p.repMin === p.repMax ? p.repMax : `${p.repMin}\u2013${p.repMax}`} reps` : ''}`), h('p', { class: 'how' }, howTo(ex) || 'No description yet.'), h('button', { class: 'btn block', style: 'margin-top:16px', onclick: close }, 'Close')]) },
        h('span', { class: 'pn num' }, String(i + 1)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, ex.name), h('div', { class: 'd' }, `${p.sets} sets${p.repMax ? ` \u00b7 ${p.repMin === p.repMax ? p.repMax : `${p.repMin}\u2013${p.repMax}`} reps` : ''}`)),
        h('span', { class: 'chev', html: icon('chev') }));
    })));

  const row = (title, desc, fn) => h('button', { class: 'row', onclick: fn }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null));
  const planned = plan.map((p) => ({ id: p.id, repMin: p.repMin, repMax: p.repMax }));
  return h('div', { class: 'home' }, top, hero, strip, planSec,
    !active && sessions.length >= 3 ? insightsCarousel({ sessions, exercises: exMap, gyms, nextId: next, gym, planned }) : null,
    active ? null : h('h2', {}, 'Or instead'),
    active ? null : h('div', { class: 'pair' }, ...others.map((r) => h('button', { class: 'tile', style: `--rc:${RCOL[r]}`, onclick: () => start(r, nav) }, h('span', { class: 'tile-dot' }), h('span', { class: 'tile-n' }, NAMES[r]), h('span', { class: 'tile-s' }, `${routines.find((x) => x.id === r)?.blocks.reduce((n, b) => n + b.items.length, 0)} exercises`)))),
    h('h2', {}, 'Extras'),
    h('div', { class: 'card plain' },
      row('Extra workout', extra ? `${extra} parked` : 'Nothing parked', () => (active ? toast('Finish the current workout first') : start('extra', nav))),
      row('Extras', 'Mobility, abs, farmer\u2019s walk', () => nav.push(extrasView))),
    await muscleMapSection());
}
