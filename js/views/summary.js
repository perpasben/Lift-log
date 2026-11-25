import { h } from '../ui.js';
import { muscleLoad, groupLoad } from '../logic/stats.js';
import { mapBlock } from './musclemap.js';

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout' };
const SESSION_FULL = 6; // effective sets of one muscle in a single workout that give the strongest colour
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts a number up from 0 (skipped when the user prefers reduced motion). */
function countUp(el, to, fmt = (v) => String(v), ms = 800, delay = 350) {
  el.textContent = fmt(reduced() ? to : 0);
  if (reduced() || !to) return;
  setTimeout(() => {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      if (!el.isConnected) return;
      el.textContent = fmt(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, delay);
}

/** The screen a finished workout turns into: what you did, and which muscles got the work. */
export function summaryView({ session, st, gym, exs, routineId, pend = [] }) {
  return ({ nav }) => {
    const counts = muscleLoad([session], exs, { workouts: 1 }).counts;
    const rows = groupLoad(counts);
    const title = routineId === 'extra' ? 'Extra workout.' : `${NAMES[routineId] || 'Workout'} day.`;
    let i = 0;
    const rise = (el) => { el.classList.add('rise'); el.style.setProperty('--i', String(i++)); return el; };
    const stat = (value, one, many, fmt) => { const b = h('b', { class: 'num' }, ''); countUp(b, value, fmt); return h('div', {}, b, h('span', {}, value === 1 ? one : many)); };

    const map = mapBlock({}, { full: SESSION_FULL, text: rows.length ? 'Tap a muscle.' : 'No muscles to show for this workout.' });
    // the muscles light up after the screen has settled
    setTimeout(() => map.paintTo(counts), reduced() ? 0 : 650);

    const carried = pend.filter((p) => p.target !== 'extra').length, parked = pend.filter((p) => p.target === 'extra').length;
    return h('div', { class: 'sum' },
      rise(h('div', { class: 'sum-top' }, h('div', { class: 'sum-e' }, `Workout complete \u00b7 ${gym?.name || ''}`), h('h1', { class: 'sum-h' }, title))),
      rise(h('div', { class: 'sum-stats' }, stat(st.minutes, 'minute', 'minutes'), stat(st.sets, 'set', 'sets'), stat(st.volume, 'kg volume', 'kg volume', (v) => v.toLocaleString('en-GB')))),
      rise(h('h2', {}, 'Muscles worked')),
      rise(map),
      pend.length ? rise(h('p', { class: 'muted sum-pend' }, `${carried} carried to the next workout${parked ? `, ${parked} parked in Extra` : ''}.`)) : null,
      rise(h('button', { class: 'btn pri block sum-done', onclick: () => nav.tab('train') }, 'Done')));
  };
}
