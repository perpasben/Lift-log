import * as db from '../db.js';
import { h } from '../ui.js';
import { muscleLoad, mapHeat, groupLoad, fmtSets, MUSCLE_LABEL } from '../logic/stats.js';
import { accent2 } from '../theme.js';

import { MM } from '../mmdata.js';

const [vx, , vw] = MM.viewBox.split(' ').map(Number);
const lab = (v) => (((MM.center[v] - vx) / vw) * 100).toFixed(1);
const RANGES = [['7 days', { days: 7 }], ['14 days', { days: 14 }], ['Last 4 workouts', { workouts: 4 }]];
let rangeIdx = 0;

function figures(counts, light) {
  const muscles = Object.entries(MM.muscles).map(([key, d]) => `<path class="mm" data-m="${key}" fill="${mapHeat(counts[key] || 0, light)}" d="${d}"/>`);
  return `<path fill="#16161a" d="${MM.sil}"/><path fill="#25252b" d="${MM.inert}"/>${muscles.join('')}`;
}

export async function muscleMapSection() {
  const [sessions, exList, settings] = await Promise.all([db.all('sessions'), db.all('exercises'), db.kvGet('settings', {})]);
  rangeIdx = Math.min(settings.mapRange ?? rangeIdx, RANGES.length - 1);
  const exs = Object.fromEntries(exList.map((e) => [e.id, e]));
  const box = h('div');
  const light = accent2().hex;
  const paint = () => {
    const [, range] = RANGES[rangeIdx];
    const { counts, sessions: n, sets: total } = muscleLoad(sessions, exs, range);
    const readout = h('div', { class: 'mm-read' }, n ? `${total} sets across ${n} workout${n > 1 ? 's' : ''}. Tap a muscle.` : 'Nothing trained in this period.');
    const svg = h('div', { class: 'mm-svg', html: `<svg viewBox="${MM.viewBox}" role="img" aria-label="Muscle map, front and back">${figures(counts, light)}</svg>` });
    svg.querySelectorAll('.mm').forEach((p) => p.addEventListener('click', () => { const k = p.dataset.m; readout.replaceChildren(h('b', {}, MUSCLE_LABEL[k]), ` · ${fmtSets(counts[k] || 0)} set${(counts[k] || 0) === 1 ? '' : 's'}`); }));
    const rows = groupLoad(counts);
    const max = rows[0]?.total || 1;
    box.replaceChildren(
      h('div', { class: 'chips', style: 'margin:0 0 10px' }, ...RANGES.map(([l], i) => h('button', { class: `chip ${i === rangeIdx ? 'ac1' : ''}`, 'aria-pressed': String(i === rangeIdx), onclick: async () => { rangeIdx = i; await db.kvSet('settings', { ...(await db.kvGet('settings', {})), mapRange: i }); paint(); } }, l))),
      h('div', { class: 'mm-fig' }, svg, h('div', { class: 'mm-lab' }, h('span', { style: `left:${lab('front')}%` }, 'Front'), h('span', { style: `left:${lab('back')}%` }, 'Back')), readout,
        h('div', { class: 'mm-leg' }, h('span', {}, '0'), h('i', {}), h('span', {}, '10+ sets'))),
      rows.length ? h('div', { class: 'card plain', style: 'margin-top:10px' }, ...rows.map((g) => h('div', { class: 'row', style: 'min-height:44px;padding:10px 2px' }, h('div', { class: 't', style: 'width:96px' }, g.name), h('div', { class: 'mm-bar' }, h('i', { style: `width:${Math.max(6, (g.total / max) * 100)}%;background:${mapHeat(g.top, light)}` })), h('div', { class: 'muted mono', style: 'width:64px;white-space:nowrap;text-align:right' }, `${fmtSets(g.total)} set${g.total === 1 ? '' : 's'}`)))) : null,
      rows.length ? h('p', { class: 'mm-note' }, 'A set counts for every muscle the exercise works, weighted by how much: dips give chest the most, then triceps and shoulders.') : null);
  };
  paint();
  return h('div', {}, h('h2', {}, 'Muscles trained'), box);
}
