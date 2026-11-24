// Rest timer pill. Source of truth is an absolute end time stored on the active workout.
import { h } from './ui.js';
import { getActive, saveActive } from './active.js';
import { startTimer, remaining, addSeconds, fmt } from './logic/timer.js';

let pill, label, bar, timerId, actBar, actName, actTime, hooks = {};
const LINGER_MS = 4000;

const ROUTINE_NAME = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout' };
const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60; return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`; };

/** hooks: { isOtherTab(): bool, openWorkout(): void } supplied by the navigation layer. */
export function initRest(h2 = {}) {
  hooks = h2;
  actName = h('b', {}, '');
  actTime = h('span', { class: 'num' }, '');
  actBar = h('button', { class: 'actbar', hidden: true, onclick: () => hooks.openWorkout?.() },
    h('span', { class: 'act-dot' }), h('span', { class: 'act-t' }, h('small', {}, 'Active workout'), h('span', {}, actName, ' \u00b7 ', actTime)), h('span', { class: 'act-go' }, 'Resume'));
  document.getElementById('app').insertBefore(actBar, document.getElementById('tabs'));
  label = h('span', { class: 'rest-t num' });
  bar = h('div', { class: 'rest-bar' });
  pill = h('div', { class: 'rest', hidden: true },
    bar,
    h('button', { class: 'rest-b', 'aria-label': '15 seconds less', onclick: () => nudge(-15) }, '−15'),
    label,
    h('button', { class: 'rest-b', 'aria-label': '15 seconds more', onclick: () => nudge(15) }, '+15'),
    h('button', { class: 'rest-b', 'aria-label': 'Skip rest', onclick: stop }, 'Skip'));
  document.getElementById('app').insertBefore(pill, document.getElementById('tabs'));
  timerId = setInterval(tick, 250);
  document.addEventListener('visibilitychange', tick);
  addEventListener('pageshow', tick);
  tick();
}

export function startRest(seconds) {
  const a = getActive();
  if (!a) return;
  a.rest = startTimer(Date.now(), seconds);
  saveActive();
  tick();
}
function nudge(s) {
  const a = getActive();
  if (!a?.rest) return;
  const t = addSeconds(a.rest, s);
  a.rest = t.endAt <= Date.now() ? { ...t, endAt: Date.now() + 1000 } : t;
  saveActive(); tick();
}
function stop() {
  const a = getActive();
  if (a) { a.rest = null; saveActive(); }
  tick();
}

export const refreshRest = () => tick();

function tick() {
  const a = getActive();
  let restShown = false;
  const t = a?.rest;
  if (t) {
    const now = Date.now();
    const left = remaining(t, now);
    if (left === 0 && now - t.endAt > LINGER_MS) { a.rest = null; saveActive(); }
    else {
      restShown = true;
      pill.classList.toggle('over', left === 0);
      label.textContent = left === 0 ? 'Rest over' : fmt(left);
      bar.style.width = `${left === 0 ? 100 : Math.max(0, 100 - (left / t.total) * 100)}%`;
    }
  }
  pill.hidden = !restShown;
  // no rest timer running: show the active-workout bar, but only outside the Train tab (Train already shows the workout)
  const showAct = !!a && !restShown && !!hooks.isOtherTab?.();
  actBar.hidden = !showAct;
  if (showAct) {
    actBar.setAttribute('aria-label', 'Return to your active workout'); actName.textContent = ROUTINE_NAME[a.routineId] || 'Workout'; actTime.textContent = clock(Date.now() - a.start); }
}
