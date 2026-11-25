import { h } from '../ui.js';
import { stats } from '../logic/workout.js';
import { trainingDaysPerWeek, strengthIndex, niceRange } from '../logic/stats.js';

const ns = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
const shortDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const RANGES = [['3 months', 91], ['6 months', 182], ['Year', 365], ['All', Infinity]];
let range = 1;

/** Workouts per week as bars: easy to read at a glance. */
function daysChart(weeks) {
  const W = 340, H = 150, L = 6, R = 6, T = 20, B = 24;
  const max = Math.max(4, ...weeks.map((w) => w.days));
  const gap = 6, bw = (W - L - R - gap * (weeks.length - 1)) / weeks.length;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Days trained in each of the last ${weeks.length} weeks` });
  svg.append(el('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, stroke: 'rgba(255,255,255,.12)', 'stroke-width': 1 }));
  weeks.forEach((w, i) => {
    const x = L + i * (bw + gap), hh = (w.days / max) * (H - T - B), last = i === weeks.length - 1;
    if (w.days) svg.append(el('rect', { x, y: H - B - hh, width: bw, height: hh, rx: 4, fill: last ? '#ff6b1f' : 'var(--ac2)', opacity: last ? 1 : 0.85 }));
    else svg.append(el('rect', { x, y: H - B - 3, width: bw, height: 3, rx: 1.5, fill: 'rgba(255,255,255,.12)' }));
    if (w.days) svg.append(el('text', { x: x + bw / 2, y: H - B - hh - 6, 'text-anchor': 'middle', class: 'ax', fill: last ? '#fff' : undefined }, String(w.days)));
    if (i % 4 === 0 || last) svg.append(el('text', { x: x + bw / 2, y: H - 6, 'text-anchor': i === 0 ? 'start' : last ? 'end' : 'middle', class: 'ax' }, last ? 'This week' : shortDate(w.start)));
  });
  return svg;
}

/** One line: 100 = where you started. */
function strengthChart(points) {
  const W = 340, H = 170, L = 34, R = 12, T = 14, B = 24;
  const ys = points.map((p) => p.v);
  const rng = niceRange(Math.min(100, ...ys), Math.max(100, ...ys));
  const t0 = points[0].t, t1 = points.at(-1).t;
  const x = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R));
  const y = (v) => T + (1 - (v - rng.lo) / (rng.hi - rng.lo)) * (H - T - B);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Overall strength over time, 100 is where you started' });
  for (const v of rng.ticks) {
    svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1 }));
    svg.append(el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, String(v)));
  }
  if (100 >= rng.lo && 100 <= rng.hi) svg.append(el('line', { x1: L, x2: W - R, y1: y(100), y2: y(100), stroke: 'rgba(255,255,255,.35)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
  svg.append(el('path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(''), fill: 'none', stroke: '#ff6b1f', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  const end = points.at(-1);
  svg.append(el('circle', { cx: x(end.t), cy: y(end.v), r: 4.5, fill: '#ff6b1f' }));
  // a few month labels along the bottom
  const months = []; let prev = -1;
  for (const p of points) { const d = new Date(p.t); if (d.getMonth() !== prev) { prev = d.getMonth(); months.push(p); } }
  const step = Math.ceil(months.length / 5);
  months.forEach((p, i) => { if (i % step === 0) svg.append(el('text', { x: Math.min(x(p.t), W - R - 14), y: H - 6, 'text-anchor': 'middle', class: 'ax' }, new Date(p.t).toLocaleDateString('en-GB', { month: 'short' }))); });
  return svg;
}

export function statsSection(sessions, exercises) {
  const lifting = sessions.filter((s) => s.entries?.length);
  const now = Date.now();
  const tot = lifting.reduce((a, s) => { const st = stats(s); return { sets: a.sets + st.sets, volume: a.volume + st.volume }; }, { sets: 0, volume: 0 });
  const tile = (value, unit) => h('div', {}, h('b', { class: 'num' }, value), h('span', {}, unit));
  const inTons = tot.volume >= 10000;
  const lifted = inTons ? (tot.volume / 1000).toFixed(tot.volume >= 100000 ? 0 : 1) : tot.volume.toLocaleString('en-GB');

  const weeks = trainingDaysPerWeek(lifting, now, 12);
  const totalDays = weeks.reduce((n, w) => n + w.days, 0);
  const avg = Math.round((totalDays / weeks.length) * 10) / 10;
  const consistency = h('div', { class: 'st-card' },
    h('div', { class: 'st-h' }, h('b', {}, 'Training days'), h('span', {}, 'last 12 weeks')),
    h('div', { class: 'st-big' }, h('b', { class: 'num' }, String(avg)), h('span', {}, 'days a week on average')),
    daysChart(weeks),
    h('p', { class: 'st-note' }, 'Each bar is one week: how many days you trained.'));

  const idx = strengthIndex(lifting, exercises, now);
  const body = h('div');
  const paintStrength = () => {
    if (!idx) { body.replaceChildren(h('p', { class: 'st-note', style: 'margin:14px 0 0' }, 'Your strength trend shows up once you have logged at least three exercises over a month or more.')); return; }
    const [, days] = RANGES[range];
    const pts = idx.points.filter((p) => days === Infinity || p.t >= now - days * 86400000);
    const win = pts.length >= 2 ? pts : idx.points.slice(-2);
    const change = Math.round((win.at(-1).v / win[0].v - 1) * 100);
    body.replaceChildren(
      h('div', { class: 'st-big' }, h('b', { class: `num ${change < 0 ? 'neg' : ''}` }, `${change > 0 ? '+' : ''}${change}%`), h('span', {}, days === Infinity ? 'stronger than when you started' : `in the last ${RANGES[range][0].toLowerCase()}`)),
      strengthChart(win),
      h('p', { class: 'st-note' }, `Based on your ${idx.lifts} most-logged lifts compared with when you first did them. The dashed line is where you started (100).`));
  };
  const chips = h('div', { class: 'chips', style: 'margin:12px 0 0' }, ...RANGES.map(([l], i) => h('button', { class: `chip ${i === range ? 'ac1' : ''}`, 'aria-pressed': String(i === range), onclick: (ev) => { range = i; [...ev.currentTarget.parentNode.children].forEach((b, j) => { b.classList.toggle('ac1', j === i); b.setAttribute('aria-pressed', String(j === i)); }); paintStrength(); } }, l)));
  paintStrength();
  const strength = h('div', { class: 'st-card' }, h('div', { class: 'st-h' }, h('b', {}, 'Overall strength')), idx ? chips : null, body);

  return h('div', {}, h('h2', {}, 'Statistics'),
    h('div', { class: 'st-tiles' }, tile(String(lifting.length), lifting.length === 1 ? 'workout' : 'workouts'), tile(tot.sets.toLocaleString('en-GB'), tot.sets === 1 ? 'set' : 'sets'), tile(lifted, inTons ? 'tonnes lifted' : 'kg lifted')),
    consistency, strength);
}
