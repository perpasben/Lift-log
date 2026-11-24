import * as db from '../db.js';
import { h, topbar, fmtDate, fmtDur } from '../ui.js';

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout' };
const label = (s) => NAMES[s.routineId] || (s.title || 'Workout').replace(/^.*?:\s*/, '');

export async function historyView({ nav }) {
  const [sessions, gyms] = await Promise.all([db.all('sessions'), db.all('gyms')]);
  const gname = Object.fromEntries(gyms.map((g) => [g.id, g.name]));
  const list = sessions.sort((a, b) => b.start - a.start);
  const out = h('div', {}, ...topbar('History', nav));
  if (!list.length) return out.appendChild(h('div', { class: 'empty' }, 'Nothing here yet.')) && out;
  let month = '';
  let card;
  for (const s of list.slice(0, 150)) {
    const m = new Date(s.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (m !== month) { month = m; out.append(h('h2', {}, m)); card = h('div', { class: 'card' }); out.append(card); }
    const sets = s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.warm).length, 0);
    card.append(h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('div', { class: 't' }, label(s)), h('div', { class: 'd' }, `${fmtDate(s.start)} · ${gname[s.gymId] || ''}`)),
      h('div', { class: 'muted mono', style: 'text-align:right;font-size:14px' }, fmtDur(s.start, s.end), h('br'), `${sets} sets`)));
  }
  return out;
}
