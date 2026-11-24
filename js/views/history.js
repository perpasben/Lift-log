import * as db from '../db.js';
import { h, topbar, fmtDate, fmtDur } from '../ui.js';
import { icon } from '../icons.js';
import { rcOf } from '../theme.js';
import { muscleMapSection } from './musclemap.js';
import { fmtSet } from './workout.js';
import { stats } from '../logic/workout.js';
import { monthGrid, dayKey, exerciseSeries, metricsFor, niceRange } from '../logic/stats.js';

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout', mobility: 'Mobility', abs: 'Abs', farmer: "Farmer's walk" };
const label = (s) => NAMES[s.routineId] || (s.title || 'Workout').replace(/^.*?:\s*/, '');
let mode = 'calendar';
let q = '';
const today = new Date();
let cal = { y: today.getFullYear(), m: today.getMonth(), sel: dayKey(Date.now()) };
const colorOf = (s) => rcOf(s.routineId);
const chartSel = {};

const setsLine = (type, sets) => sets.map((s) => (s.warm ? `W ${fmtSet(type, s)}` : fmtSet(type, s))).join('  ·  ');

export async function historyView({ nav }) {
  const out = h('div', {}, ...topbar('History', nav));
  out.append(h('div', { class: 'seg' }, ...[['calendar', 'Calendar'], ['workouts', 'Workouts'], ['exercises', 'Exercises']].map(([id, l]) =>
    h('button', { 'aria-pressed': String(mode === id), onclick: () => { mode = id; nav.refresh(); } }, l))));
  const [sessions, gyms, exs] = await Promise.all([db.all('sessions'), db.all('gyms'), db.all('exercises')]);
  const ctx = { nav, sessions: sessions.sort((a, b) => b.start - a.start), gname: Object.fromEntries(gyms.map((g) => [g.id, g.name])), exs: Object.fromEntries(exs.map((e) => [e.id, e])) };
  out.append(mode === 'workouts' ? workouts(ctx) : mode === 'exercises' ? exercises(ctx) : calendar(ctx));
  if (mode === 'calendar') out.append(await muscleMapSection());
  return out;
}

function calendar(ctx) {
  const g = monthGrid(cal.y, cal.m, ctx.sessions);
  const title = new Date(cal.y, cal.m, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const go = (d) => { const n = new Date(cal.y, cal.m + d, 1); cal = { y: n.getFullYear(), m: n.getMonth(), sel: null }; ctx.nav.refresh(); };
  const dur = g.minutes >= 60 ? `${Math.floor(g.minutes / 60)} h ${g.minutes % 60} min` : `${g.minutes} min`;
  const dayList = h('div');
  const showDay = (key) => {
    const cell = g.weeks.flat().find((c) => c.key === key);
    dayList.replaceChildren(...(cell?.sessions.length ? [h('h2', {}, new Date(key + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('div', { class: 'card' }, ...cell.sessions.map((s) => h('button', { class: 'row', onclick: () => ctx.nav.push(() => sessionView(ctx, s.id)) },
        h('span', { class: 'cal-dot lg', style: `background:${colorOf(s)}` }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, label(s)), h('div', { class: 'd' }, `${ctx.gname[s.gymId] || ''} \u00b7 ${fmtDur(s.start, s.end)}`)),
        h('span', { class: 'chev', html: icon('chev') }))))] : []));
  };
  const grid = h('div', { class: 'cal' },
    ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => h('div', { class: 'cal-h' }, d)),
    ...g.weeks.flat().map((c) => h('button', { class: `cal-c ${c.inMonth ? '' : 'out'} ${c.key === dayKey(Date.now()) ? 'today' : ''}`, 'aria-pressed': String(c.key === cal.sel), 'aria-label': `${c.key}${c.sessions.length ? `, ${c.sessions.length} workouts` : ''}`,
      onclick: () => { cal.sel = c.key; grid.querySelectorAll('.cal-c').forEach((b) => b.setAttribute('aria-pressed', 'false')); grid.querySelector(`[aria-label^="${c.key}"]`).setAttribute('aria-pressed', 'true'); showDay(c.key); } },
      h('span', { class: 'n num' }, String(c.day)),
      h('span', { class: 'dots' }, ...c.sessions.slice(0, 3).map((s) => h('i', { class: 'cal-dot', style: `background:${colorOf(s)}` }))))));
  if (!cal.sel) cal.sel = g.weeks.flat().filter((c) => c.inMonth && c.sessions.length).at(-1)?.key || null;
  if (cal.sel) showDay(cal.sel);
  return h('div', {},
    h('div', { class: 'cal-nav' }, h('button', { class: 'ibtn', 'aria-label': 'Previous month', html: icon('back'), onclick: () => go(-1) }), h('div', { class: 'cal-t' }, h('b', {}, title), h('span', { class: 'muted' }, `${g.count} workouts \u00b7 ${dur}`)),
      h('button', { class: 'ibtn', 'aria-label': 'Next month', html: icon('chev'), onclick: () => go(1) })),
    grid,
    h('div', { class: 'cal-key' }, ...[['Push', rcOf('push')], ['Pull', rcOf('pull')], ['Leg', rcOf('leg')], ['Other', rcOf('extra')]].map(([n, c]) => h('span', {}, h('i', { class: 'cal-dot', style: `background:${c}` }), n))),
    dayList);
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
      h('span', { class: 'cal-dot lg', style: `background:${colorOf(s)}` }),
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
  if (rows.length) out.append(progress(ctx, exId, type, rows));
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

/* ---------- progress chart ---------- */
function progress(ctx, exId, type, rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.s.gymId, (counts.get(r.s.gymId) || 0) + 1);
  const gymIds = [...counts].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const metrics = metricsFor(type);
  const sel = chartSel[exId] ||= { gym: gymIds[0], metric: metrics[0][0] };
  if (!gymIds.includes(sel.gym)) sel.gym = gymIds[0];
  const box = h('div', { class: 'chart-box' });
  const paint = () => {
    const pts = exerciseSeries(ctx.sessions, exId, sel.gym, sel.metric);
    const chips = (items, key, fmt) => h('div', { class: 'chips', style: 'margin:0 0 10px' }, ...items.map(([v, l]) => h('button', { class: `chip ${sel[key] === v ? 'ac' : ''}`, 'aria-pressed': String(sel[key] === v), onclick: () => { sel[key] = v; paint(); } }, l)));
    box.replaceChildren(...[
      metrics.length > 1 ? chips(metrics, 'metric') : null,
      gymIds.length > 1 ? chips(gymIds.map((id) => [id, ctx.gname[id] || 'Gym']), 'gym') : null,
      lineChart(pts, sel.metric)].filter(Boolean));
  };
  paint();
  return h('div', {}, h('h2', {}, 'Progress'), box);
}

function lineChart(pts, metric) {
  const unit = metric === 'reps' ? 'reps' : metric === 'time' ? 's' : 'kg';
  if (!pts.length) return h('div', { class: 'empty' }, 'No data for this view.');
  const W = 340, H = 190, L = 40, R = 12, T = 14, B = 26;
  const ys = pts.map((p) => p.v);
  const rng = niceRange(Math.min(...ys), Math.max(...ys));
  const t0 = pts[0].t, t1 = pts.at(-1).t;
  const x = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - rng.lo) / (rng.hi - rng.lo)) * (H - T - B);
  const fmtV = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const fmtD = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `${metric} over time, ${pts.length} workouts` });
  for (const v of rng.ticks) {
    svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1 }));
    svg.append(el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, fmtV(v)));
  }
  svg.append(el('text', { x: L, y: H - 6, class: 'ax' }, fmtD(t0)));
  if (t1 !== t0) svg.append(el('text', { x: W - R, y: H - 6, 'text-anchor': 'end', class: 'ax' }, fmtD(t1)));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  if (pts.length > 1) {
    const defs = el('defs', {}); const g = el('linearGradient', { id: 'ag', x1: 0, y1: 0, x2: 0, y2: 1 });
    g.append(el('stop', { offset: '0%', 'stop-color': '#ff6b1f', 'stop-opacity': 0.28 }), el('stop', { offset: '100%', 'stop-color': '#ff6b1f', 'stop-opacity': 0 }));
    defs.append(g); svg.append(defs);
    svg.append(el('path', { d: `${d} L${x(t1).toFixed(1)} ${H - B} L${x(t0).toFixed(1)} ${H - B} Z`, fill: 'url(#ag)' }));
  }
  if (pts.length > 1) svg.append(el('path', { d, fill: 'none', stroke: '#ff6b1f', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  const cross = el('line', { y1: T, y2: H - B, stroke: 'rgba(255,255,255,.25)', 'stroke-width': 1, visibility: 'hidden' });
  svg.append(cross);
  const dots = pts.map((p) => { const c = el('circle', { cx: x(p.t), cy: y(p.v), r: pts.length > 40 ? 2.5 : 4, fill: '#ff6b1f', stroke: '#0d0d0f', 'stroke-width': 2 }); svg.append(c); return c; });
  const read = h('div', { class: 'chart-read' });
  const show = (i) => {
    const p = pts[i];
    dots.forEach((c, j) => c.setAttribute('r', j === i ? 6 : (pts.length > 40 ? 2.5 : 4)));
    cross.setAttribute('x1', x(p.t)); cross.setAttribute('x2', x(p.t)); cross.setAttribute('visibility', 'visible');
    read.replaceChildren(h('b', { class: 'num' }, `${fmtV(p.v)} ${unit}`), h('span', { class: 'muted' }, ` \u00b7 ${fmtD(p.t)}`));
  };
  const nearest = (clientX) => { const r = svg.getBoundingClientRect(); const vx = ((clientX - r.left) / r.width) * W; let best = 0; pts.forEach((p, i) => { if (Math.abs(x(p.t) - vx) < Math.abs(x(pts[best].t) - vx)) best = i; }); return best; };
  svg.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') show(nearest(e.clientX)); });
  svg.style.touchAction = 'pan-y';
  show(pts.length - 1);
  return h('div', {}, read, svg);
}
