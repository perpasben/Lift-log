import * as db from '../db.js';
import { h, sheet } from '../ui.js';
import { icon } from '../icons.js';
import { muscleLoad, mapHeat, groupLoad, plannedGroups, periodRange, PERIODS, fmtSets, MUSCLE_LABEL } from '../logic/stats.js';
import { accent2 } from '../theme.js';

import { MM } from '../mmdata.js';

const [vx, , vw] = MM.viewBox.split(' ').map(Number);
const lab = (v) => (((MM.center[v] - vx) / vw) * 100).toFixed(1);
const DAY = 86400000;
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const isoDay = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function figures(counts, light) {
  const muscles = Object.entries(MM.muscles).map(([key, d]) => `<path class="mm" data-m="${key}" fill="${mapHeat(counts[key] || 0, light)}" d="${d}"/>`);
  return `<path fill="#16161a" d="${MM.sil}"/><path fill="#25252b" d="${MM.inert}"/>${muscles.join('')}`;
}

export async function muscleMapSection() {
  const [sessions, exList, settings, routines, asgList, gyms] = await Promise.all([db.all('sessions'), db.all('exercises'), db.kvGet('settings', {}), db.all('routines'), db.all('assignments'), db.all('gyms')]);
  const exs = Object.fromEntries(exList.map((e) => [e.id, e]));
  const expected = plannedGroups(routines, Object.fromEntries(asgList.map((a) => [a.id, a.exerciseId])), exs, gyms);
  let period = PERIODS.some(([id]) => id === settings.mapPeriod) ? settings.mapPeriod : 'd7';
  let custom = settings.mapCustom || null;
  if (period === 'custom' && !custom) period = 'd7';
  const light = accent2().hex;
  const box = h('div');
  const label = h('span', {});
  const save = async () => db.kvSet('settings', { ...(await db.kvGet('settings', {})), mapPeriod: period, mapCustom: custom });
  const periodLabel = () => (period === 'custom' && custom ? `${shortDate(custom.from)} \u2013 ${shortDate(custom.to)}` : PERIODS.find(([id]) => id === period)[1]);

  const paint = () => {
    label.textContent = periodLabel();
    const { counts, sessions: n, sets: total } = muscleLoad(sessions, exs, periodRange(period, Date.now(), custom));
    const readout = h('div', { class: 'mm-read' }, n ? `${total} sets across ${n} workout${n > 1 ? 's' : ''}. Tap a muscle.` : 'Nothing trained in this period.');
    const svg = h('div', { class: 'mm-svg', html: `<svg viewBox="${MM.viewBox}" role="img" aria-label="Muscle map, front and back">${figures(counts, light)}</svg>` });
    svg.querySelectorAll('.mm').forEach((p) => p.addEventListener('click', () => { const k = p.dataset.m; readout.replaceChildren(h('b', {}, MUSCLE_LABEL[k]), ` \u00b7 ${fmtSets(counts[k] || 0)} set${(counts[k] || 0) === 1 ? '' : 's'}`); }));
    const rows = groupLoad(counts, expected);
    const max = rows[0]?.total || 1;
    box.replaceChildren(
      h('div', { class: 'mm-fig' }, svg, h('div', { class: 'mm-lab' }, h('span', { style: `left:${lab('front')}%` }, 'Front'), h('span', { style: `left:${lab('back')}%` }, 'Back')), readout,
        h('div', { class: 'mm-leg' }, h('span', {}, '0'), h('i', {}), h('span', {}, '10+ sets'))),
      rows.length ? h('div', { class: 'card plain', style: 'margin-top:10px' }, ...rows.map((g) => h('div', { class: 'row', style: 'min-height:44px;padding:10px 2px' }, h('div', { class: 't', style: 'width:96px' }, g.name), h('div', { class: 'mm-bar' }, g.total > 0 ? h('i', { style: `width:${Math.max(6, (g.total / max) * 100)}%;background:${mapHeat(g.top, light)}` }) : null), h('div', { class: `muted mono ${g.total > 0 ? '' : 'zero'}`, style: 'width:78px;white-space:nowrap;text-align:right' }, `${fmtSets(g.total)} set${g.total === 1 ? '' : 's'}`)))) : null,
      rows.length ? h('p', { class: 'mm-note' }, 'A set counts for every muscle the exercise works, weighted by how much: dips give chest the most, then triceps and shoulders.') : null);
  };

  const askCustom = () => sheet((close) => {
    const to = h('input', { type: 'date', value: custom?.to || isoDay(Date.now()), max: isoDay(Date.now()) });
    const from = h('input', { type: 'date', value: custom?.from || isoDay(Date.now() - 30 * DAY), max: isoDay(Date.now()) });
    const err = h('p', { class: 'mm-err' }, '');
    return [h('h3', {}, 'Custom period'),
      h('div', { class: 'mm-dates' }, h('label', {}, h('span', {}, 'From'), from), h('label', {}, h('span', {}, 'To'), to)), err,
      h('button', { class: 'btn pri block', style: 'margin-top:16px', onclick: async () => {
        if (!from.value || !to.value) { err.textContent = 'Pick both dates.'; return; }
        if (from.value > to.value) { err.textContent = 'The start date is after the end date.'; return; }
        custom = { from: from.value, to: to.value }; period = 'custom'; await save(); close(); paint();
      } }, 'Apply')];
  });
  const choose = () => sheet((close) => [h('h3', {}, 'Period'),
    h('div', { class: 'card', style: 'margin-top:12px' }, ...PERIODS.map(([id, text]) => h('button', { class: 'row', 'aria-pressed': String(id === period), onclick: async () => {
      close();
      if (id === 'custom') { askCustom(); return; }
      period = id; await save(); paint();
    } }, h('div', { class: 'grow t' }, id === 'custom' && period === 'custom' && custom ? `Custom period \u00b7 ${periodLabel()}` : text), id === period ? h('span', { class: 'sel-ok', html: icon('check') }) : null)))]);

  paint();
  const picker = h('button', { class: 'mm-sel', 'aria-haspopup': 'dialog', onclick: choose }, label, h('span', { class: 'mm-chev', html: icon('chev') }));
  return h('div', {}, h('div', { class: 'mm-head' }, h('h2', {}, 'Muscles trained'), picker), box);
}
