import * as db from '../db.js';
import { h, sheet, toast } from '../ui.js';
import { nextRoutine, pendingFor, ROTATION } from '../logic/carryover.js';
import { buildWorkout, buildTopUpWorkout } from '../logic/workout.js';
import { planTopUp } from '../logic/topup.js';
import { assessLoad } from '../logic/load.js';
import { getActive, setActive } from '../active.js';
import { workoutView } from './workout.js';
import { extrasView } from './extras.js';
import { muscleMapSection } from './musclemap.js';
import { insightsCarousel } from './carousel.js';
import { accent2 } from '../theme.js';
import { akey } from '../logic/substitution.js';
import { heroPhoto, photos } from '../photos.js';
import { icon } from '../icons.js';
import { howTo } from '../howto.js';
import { weeklyCounts, muscleLoad, estimateMinutes, dayKey, fmtSets, MUSCLE_LABEL } from '../logic/stats.js';

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

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Pending exercises', topup: 'Complete the week' };

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
  const exMap = Object.fromEntries(exList.map((e) => [e.id, e]));
  let w;
  if (routineId === 'topup') {
    const counts = muscleLoad(sessions, exMap, { days: 7 }).counts;
    const plan = planTopUp({ counts, exercises: exList, gym, sessions });
    if (!plan.items.length) { toast('Nothing to suggest with this gym\u2019s equipment'); return; }
    w = buildTopUpWorkout({ plan, gym, exercises: exMap, sessions });
  } else {
    w = buildWorkout({
      routineId, routine: routines.find((r) => r.id === routineId) || null, gym,
      assignments: Object.fromEntries(asg.map((a) => [a.id, a.exerciseId])),
      exercises: exMap, sessions, pending,
    });
  }
  await db.kvSet('settings', { ...settings, lastGymId: gymId });
  await setActive(w);
  nav.push(workoutView, 'up');
}

function openTopUp(plan, exMap, nav) {
  const why = (it) => {
    if (it.kind === 'gap') return `${it.sets} sets \u00b7 ${MUSCLE_LABEL[it.reason.key]}: ${fmtSets(it.reason.done)} of ${it.reason.target} sets this week`;
    return `${it.sets} sets \u00b7 ${it.kind === 'posture' ? 'posture and shoulder health' : 'mobility'}`;
  };
  sheet((close) => [h('h3', {}, 'Complete the week'),
    h('p', { class: 'muted', style: 'margin:0 0 12px' }, plan.complete
      ? 'Your last 7 days cover every muscle. A short session for posture and mobility.'
      : 'Muscles the last 7 days left behind, to even out the body map. Legs and back first.'),
    h('div', { class: 'card' }, ...plan.items.map((it, i) => h('div', { class: 'row' }, h('span', { class: 'pn num' }, String(i + 1)), h('div', { class: 'grow' }, h('div', { class: 't' }, exMap[it.exerciseId]?.name || it.exerciseId), h('div', { class: 'd' }, why(it)))))),
    h('button', { class: 'btn pri block', style: 'margin-top:16px', onclick: () => { close(); start('topup', nav); } }, 'Start')]);
}

function whyRest(load) {
  sheet((close) => [h('h3', {}, 'Time to recover'),
    h('div', { class: 'why-list' }, ...load.reasons.map((r) => h('div', { class: 'why' }, h('i', {}), h('span', {}, r.text[0].toUpperCase() + r.text.slice(1))))),
    h('p', { class: 'how', style: 'margin-top:14px' }, 'Muscles grow while you recover, not while you lift. A lot of load with little rest stalls progress and raises the risk of getting hurt. One or two lighter days usually sort it out, and you do not lose progress.'),
    h('p', { class: 'muted', style: 'font-size:13px;margin:10px 0 0' }, 'This is a guide built from what you log, not a diagnosis. Sleep, stress and food matter too.'),
    h('button', { class: 'btn block', style: 'margin-top:16px', onclick: close }, 'Got it')]);
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
  const minutes = estimateMinutes(sessions, { routineId: next, gymId: gym?.id, count: (plan.length || routine.blocks.length) + carried, sets: totalSets }).minutes;
  // trained already today? then this is what comes next; otherwise it is today's training, trained or not
  const today = dayKey(Date.now());
  const doneToday = !active && sessions.some((s) => s.entries.length && dayKey(s.start) === today);
  // too much load with too little rest: say so on the card (see logic/load.js and docs/overtraining.md)
  const load = active ? { level: 'ok', reasons: [] } : assessLoad(sessions, exMap, Date.now());
  const rest = load.level === 'rest';

  const top = h('div', { class: 'home-top' }, h('div', { class: 'brand' }, h('img', { src: 'icons/icon-192.png', alt: '' }), h('b', {}, 'LiftLog')));

  const photo = heroPhoto(shownId);
  const name = NAMES[shownId] || 'Workout';
  const hero = h('div', { class: `hp ${photo ? 'has-photo' : ''}`, style: photo ? `background-image:url(${photo})` : '' },
    h('div', { class: `hp-e ${rest ? 'warn' : ''}` }, active ? `In progress \u00b7 ${gyms.find((g) => g.id === active.gymId)?.name}` : rest ? 'Overtraining risk \u00b7 rest up' : (doneToday ? 'Done for today \u00b7 next up' : `Today\u2019s training \u00b7 ${gym?.name}`)),
    h('div', { class: 'hp-h' }, rest ? 'Rest day.' : ['push', 'pull', 'leg'].includes(shownId) ? `${name} day.` : `${name}.`),
    h('div', { class: 'hp-s' }, active ? `Started ${new Date(active.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : rest ? load.reasons.slice(0, 2).map((r) => r.text).join(' \u00b7 ') : [`${plan.length || routine.blocks.length} exercises`, `about ${minutes} min`, carried ? `${carried} carried over` : null].filter(Boolean).join(' \u00b7 ')),
    load.level === 'watch' ? h('div', { class: 'hp-watch' }, `Heavy week: ${load.reasons[0].text}. A rest day soon helps.`) : null,
    h('button', { class: `cta ${rest ? 'ghost' : ''}`, onclick: () => (active ? nav.push(workoutView, 'up') : start(next, nav)) }, active ? 'Resume workout' : rest ? 'Train anyway' : 'Start workout', h('span', { html: icon('arrow') })),
    rest ? h('button', { class: 'hp-why', onclick: () => whyRest(load) }, 'Why rest?') : null);

  // three real numbers, one strip
  const lifting = sessions.filter((s) => s.entries.length);
  const wk = weeklyCounts(lifting, Date.now(), 6);
  const avg = Math.round((wk.reduce((a, b) => a + b, 0) / wk.length) * 10) / 10;
  const sets2w = muscleLoad(sessions, exMap, { days: 14 }).sets;
  const strip = lifting.length >= 3 ? h('div', { class: 'strip' },
    h('div', {}, h('span', { class: 'si' }, weekRing(wk.at(-1))), h('b', { class: 'num' }, `${wk.at(-1)}/4`), h('span', {}, 'last 7 days')),
    h('div', {}, h('span', { class: 'si', html: icon('history') }), h('b', { class: 'num' }, String(avg)), h('span', {}, 'workouts a week')),
    h('div', {}, h('span', { class: 'si', html: icon('train') }), h('b', { class: 'num' }, String(sets2w)), h('span', {}, 'sets, 2 weeks'))) : null;

  const planSec = active || !plan.length ? null : h('div', {},
    h('div', { class: 'sec-h' }, h('b', {}, doneToday || rest ? 'Next workout' : 'Today\u2019s plan'), h('span', {}, `${plan.length} exercises`)),
    h('div', { class: 'plan' }, ...plan.map((p, i) => {
      const ex = exMap[p.id];
      return h('button', { class: 'plan-row', onclick: () => sheet((close) => [h('h3', {}, ex.name), h('p', { class: 'muted', style: 'margin:0 0 10px' }, `${p.sets} sets${p.repMax ? ` \u00b7 ${p.repMin === p.repMax ? p.repMax : `${p.repMin}\u2013${p.repMax}`} reps` : ''}`), h('p', { class: 'how' }, howTo(ex) || 'No description yet.'), h('button', { class: 'btn block', style: 'margin-top:16px', onclick: close }, 'Close')]) },
        h('span', { class: 'pn num' }, String(i + 1)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, ex.name), h('div', { class: 'd' }, `${p.sets} sets${p.repMax ? ` \u00b7 ${p.repMin === p.repMax ? p.repMax : `${p.repMin}\u2013${p.repMax}`} reps` : ''}`)),
        h('span', { class: 'chev', html: icon('chev') }));
    })));

  const weekCounts = muscleLoad(sessions, exMap, { days: 7 }).counts;
  const topPlan = planTopUp({ counts: weekCounts, exercises: exAll, gym, sessions });
  // the row names what the plan works on, so it matches the sheet
  const topupHint = [...new Set(topPlan.items.map((i) => (i.kind === 'gap' ? MUSCLE_LABEL[i.main] : i.kind === 'posture' ? 'Posture' : 'Mobility')))].join(' \u00b7 ') || 'Nothing to suggest here';
  const row = (title, desc, fn) => h('button', { class: 'row', onclick: fn }, h('div', { class: 'grow' }, h('div', { class: 't' }, title), desc ? h('div', { class: 'd' }, desc) : null));
  const planned = plan.map((p) => ({ id: p.id, repMin: p.repMin, repMax: p.repMax }));
  return h('div', { class: 'home' }, top, hero, strip, planSec,
    !active && sessions.length >= 3 ? insightsCarousel({ sessions, exercises: exMap, gyms, nextId: next, gym, planned }) : null,
    active ? null : h('h2', {}, 'Or instead'),
    active ? null : h('div', { class: 'pair' }, ...others.map((r) => { const ph = photos()[r] || null; return h('button', { class: `tile ${ph ? 'has-photo' : ''}`, style: `--rc:${RCOL[r]}${ph ? `;background-image:linear-gradient(0deg,rgba(0,0,0,.92) 8%,rgba(0,0,0,.55) 48%,rgba(0,0,0,.1) 100%),url(${ph})` : ''}`, onclick: () => start(r, nav) }, ph ? null : h('span', { class: 'tile-ic', html: icon(r) }), h('span', { class: 'tile-n' }, NAMES[r]), h('span', { class: 'tile-s' }, `${routines.find((x) => x.id === r)?.blocks.reduce((n, b) => n + b.items.length, 0)} exercises`)); })),
    h('h2', {}, 'Extras'),
    h('div', { class: 'card plain' },
      row('Pending exercises', extra ? `${extra} waiting` : 'Nothing waiting', () => (active ? toast('Finish the current workout first') : start('extra', nav))),
      row('Complete the week', topupHint, () => (active ? toast('Finish the current workout first') : openTopUp(topPlan, exMap, nav))),
      row('Extras', 'Mobility, abs, farmer\u2019s walk', () => nav.push(extrasView))),
    await muscleMapSection());
}
