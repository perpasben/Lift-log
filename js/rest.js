// Rest timer pill. Source of truth is an absolute end time stored on the active workout.
import { h } from './ui.js';
import { getActive, saveActive } from './active.js';
import { startTimer, remaining, addSeconds, fmt } from './logic/timer.js';

let pill, label, bar, timerId;
const LINGER_MS = 4000;

export function initRest() {
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

function tick() {
  const a = getActive();
  const t = a?.rest;
  if (!t) { pill.hidden = true; return; }
  const now = Date.now();
  const left = remaining(t, now);
  if (left === 0 && now - t.endAt > LINGER_MS) { a.rest = null; saveActive(); pill.hidden = true; return; }
  pill.hidden = false;
  pill.classList.toggle('over', left === 0);
  label.textContent = left === 0 ? 'Rest over' : fmt(left);
  bar.style.width = `${left === 0 ? 100 : Math.max(0, 100 - (left / t.total) * 100)}%`;
}
