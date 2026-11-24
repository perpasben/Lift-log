import * as db from '../db.js';
import { h, topbar, fmtDate, fmtDur } from '../ui.js';
import { icon } from '../icons.js';
import { fmtSet } from './workout.js';
import { stats } from '../logic/workout.js';

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout', mobility: 'Mobility', abs: 'Abs', farmer: "Farmer's walk" };
const label = (s) => NAMES[s.routineId] || (s.title || 'Workout').replace(/^.*?:\s*/, '');
let mode = 'workouts';
let q = '';

const setsLine = (type, sets) => sets.map((s) => (s.warm ? `W ${fmtSet(type, s)}` : fmtSet(type, s))).join('  ·  ');

export async function historyView({ nav }) {
  const out = h('div', {}, ...topbar('History', nav));
  out.append(h('div', { class: 'seg' }, ...[['workouts', 'Workouts'], ['exercises', 'Exercises']].map(([id, l]) =>
    h('button', { 'aria-pressed': String(mode === id), onclick: () => { mode = id; nav.refresh(); } }, l))));
  const [sessions, gyms, exs] = await Promise.all([db.all('sessions'), db.all('gyms'), db.all('exercises')]);
  const ctx = { nav, sessions: sessions.sort((a, b) => b.start - a.start), gname: Object.fromEntries(gyms.map((g) => [g.id, g.name])), exs: Object.fromEntries(exs.map((e) => [e.id, e])) };
  out.append(mode === 'workouts' ? workouts(ctx) : exercises(ctx));
  return out;
}

function workouts(ctx) {
  const box = h('div');
  if (!ctx.sessions.length) return h('div', { class: 'empty' }, 'Nothing here yet.');
  let month = '', card;
  for (const s of ctx.sessions.slice(0, 200)) {
    const m = new Date(s.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (m !== month) { month = m; box.append(h('h2', {}, m)); card = h('div', { class: 'card' }); box.append(card); }
    const sets = s.entries.reduce((n, e) => n + e.sets.filter((x) => !x.warm).length, 0);
    card.append(h('button', { class: 'row', onclick: () => ctx.nav.push(() => sessionView(ctx, s.id)) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, label(s)), h('div', { class: 'd' }, `${fmtDate(s.start)} · ${ctx.gname[s.gymId] || ''}`)),
      h('div', { class: 'muted mono', style: 'text-align:right;font-size:14px' }, fmtDur(s.start, s.end), sets ? h('br') : null, sets ? `${sets} sets` : null),
      h('span', { class: 'chev', html: icon('chev') })));
  }
  return box;
}

function exercises(ctx) {
  const count = new Map();
  for (const s of ctx.sessions) for (const e of s.entries) if (e.sets.some((x) => !x.warm)) count.set(e.exerciseId, (count.get(e.exerciseId) || 0) + 1);
  const list = [...count].map(([id, n]) => ({ id, n, name: ctx.exs[id]?.name || id, muscle: ctx.exs[id]?.muscle || '' })).sort((a, b) => b.n - a.n);
  const input = h('input', { class: 'search', type: 'search', placeholder: 'Search exercises you have done', value: q, autocomplete: 'off' });
  const res = h('div', { class: 'card' });
  const paint = () => {
    const needle = q.toLowerCase().trim();
    const f = list.filter((x) => x.name.toLowerCase().includes(needle)).slice(0, 80);
    res.replaceChildren(...(f.length ? f.map((x) => h('button', { class: 'row', onclick: () => ctx.nav.push(() => exerciseHistoryView(ctx, x.id)) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, x.name), h('div', { class: 'd' }, [x.muscle, `${x.n} workouts`].filter(Boolean).join(' · '))), h('span', { class: 'chev', html: icon('chev') })))
      : [h('div', { class: 'empty' }, list.length ? 'No matches' : 'Nothing logged yet.')]));
  };
  input.addEventListener('input', () => { q = input.value; paint(); });
  paint();
  return h('div', {}, input, res);
}

function sessionView(ctx, id) {
  const s = ctx.sessions.find((x) => x.id === id);
  const out = h('div', {}, ...topbar(label(s), ctx.nav));
  const st = stats(s);
  out.append(h('p', { class: 'sub' }, `${new Date(s.start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · ${ctx.gname[s.gymId] || ''}`),
    h('div', { class: 'stat3' }, h('div', {}, h('b', { class: 'num' }, String(st.minutes)), h('span', {}, 'minutes')), h('div', {}, h('b', { class: 'num' }, String(st.sets)), h('span', {}, 'sets')), h('div', {}, h('b', { class: 'num' }, st.volume.toLocaleString('en-GB')), h('span', {}, 'kg volume'))));
  if (!s.entries.length) out.append(h('div', { class: 'empty' }, 'Circuit workout: time only.'));
  const card = h('div', { class: 'card' });
  for (const e of s.entries) {
    const ex = ctx.exs[e.exerciseId];
    card.append(h('button', { class: 'row', style: 'align-items:flex-start', onclick: () => ctx.nav.push(() => exerciseHistoryView(ctx, e.exerciseId)) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, ex?.name || e.exerciseId), h('div', { class: 'd mono', style: 'margin-top:4px;line-height:1.5' }, setsLine(ex?.type || 'wr', e.sets))),
      h('span', { class: 'chev', html: icon('chev') })));
  }
  if (s.entries.length) out.append(card);
  return out;
}

function exerciseHistoryView(ctx, exId) {
  const ex = ctx.exs[exId];
  const type = ex?.type || 'wr';
  const out = h('div', {}, ...topbar(ex?.name || exId, ctx.nav));
  const rows = [];
  for (const s of ctx.sessions) for (const e of s.entries) if (e.exerciseId === exId) rows.push({ s, e });
  const work = rows.flatMap((r) => r.e.sets.filter((x) => !x.warm));
  const best = work.reduce((m, x) => ((x.w || 0) > (m?.w || 0) ? x : m), null);
  out.append(h('p', { class: 'sub' }, [ex?.muscle, `${rows.length} workouts`].filter(Boolean).join(' · ')));
  if (best && type !== 't') out.append(h('div', { class: 'stat3' },
    h('div', {}, h('b', { class: 'num' }, `${best.w || 0}`), h('span', {}, 'heaviest kg')),
    h('div', {}, h('b', { class: 'num' }, String(Math.max(...work.map((x) => x.r || 0)))), h('span', {}, 'most reps')),
    h('div', {}, h('b', { class: 'num' }, String(work.length)), h('span', {}, 'total sets'))));
  const byGym = new Map();
  for (const r of rows) { const g = ctx.gname[r.s.gymId] || 'Gym'; if (!byGym.has(g)) byGym.set(g, []); byGym.get(g).push(r); }
  for (const [g, list] of byGym) {
    out.append(h('h2', {}, g), h('div', { class: 'card' }, ...list.slice(0, 40).map((r) => h('div', { class: 'row', style: 'align-items:flex-start' },
      h('div', { class: 'muted', style: 'width:64px;flex:none;font-size:14px' }, new Date(r.s.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), h('br'), new Date(r.s.start).getFullYear()),
      h('div', { class: 'grow mono', style: 'line-height:1.5' }, setsLine(type, r.e.sets))))));
  }
  if (!rows.length) out.append(h('div', { class: 'empty' }, 'No history yet.'));
  return out;
}
