import * as db from '../db.js';
import { h, topbar, toast } from '../ui.js';
import { icon } from '../icons.js';
import { searchExercises } from '../logic/substitution.js';

let mode = 'gyms';
let q = '';

export async function libraryView({ nav }) {
  const out = h('div', {}, ...topbar('Library', nav));
  const body = h('div');
  const seg = h('div', { class: 'seg' }, ...[['gyms', 'Gyms'], ['exercises', 'Exercises']].map(([id, label]) =>
    h('button', { 'aria-pressed': String(mode === id), onclick: () => { mode = id; nav.refresh(); } }, label)));
  out.append(seg, body);
  if (mode === 'gyms') await gyms(body, nav); else await exercises(body);
  return out;
}

async function gyms(body, nav) {
  const gs = await db.all('gyms');
  body.append(h('div', { class: 'card' }, ...gs.map((g) =>
    h('button', { class: 'row', onclick: () => nav.push(() => gymView(g.id, nav)) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, g.name), h('div', { class: 'd mono' }, `${g.equipment.filter((e) => e.on).length} equipment · steps of ${g.increment} kg`)),
      h('span', { class: 'chev', html: icon('chev') })))));
}

async function exercises(body) {
  const [list, gyms] = [await db.all('exercises'), await db.all('gyms')];
  const input = h('input', { class: 'search', type: 'search', placeholder: 'Search in English or Spanish', value: q, autocomplete: 'off', autocapitalize: 'off' });
  const res = h('div', { class: 'card' });
  const paint = () => {
    const found = searchExercises(list, q).slice(0, 80);
    res.replaceChildren(...(found.length ? found.map((e) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 'd' }, [e.muscle, e.aliases[0]].filter(Boolean).join(' · '))))) : [h('div', { class: 'empty' }, 'No matches')]));
  };
  input.addEventListener('input', () => { q = input.value; paint(); });
  body.append(input, res);
  paint();
}

async function gymView(id, nav) {
  const g = await db.get('gyms', id);
  const save = () => db.put('gyms', g);
  const out = h('div', {}, ...topbar(g.name, nav));
  const stepper = (label, key, step, fallback) => h('div', { class: 'row' }, h('div', { class: 'grow t' }, label),
    h('div', { class: 'step' },
      h('button', { 'aria-label': 'Decrease', onclick: async () => { g[key] = Math.max(0, +(((g[key] ?? fallback) - step)).toFixed(2)); await save(); nav.refresh(); } }, '−'),
      h('span', { class: 'v mono' }, g[key] == null ? '—' : `${g[key]} kg`),
      h('button', { 'aria-label': 'Increase', onclick: async () => { g[key] = +(((g[key] ?? fallback) + step)).toFixed(2); await save(); nav.refresh(); } }, '+')));
  out.append(h('h2', {}, 'Weights'), h('div', { class: 'card' }, stepper('Smallest jump', 'increment', 0.5, 2.5), stepper('Heaviest dumbbell', 'maxDumbbell', 2.5, 20)));
  if (g.note) out.append(h('p', { class: 'muted', style: 'font-size:14px;margin-top:10px' }, g.note));
  out.append(h('h2', {}, 'Equipment'), h('div', { class: 'card' }, ...g.equipment.map((e) =>
    h('div', { class: 'row' }, h('div', { class: 'grow t' }, e.label),
      h('button', { class: 'sw', role: 'switch', 'aria-checked': String(e.on), 'aria-label': e.label, onclick: async (ev) => { e.on = !e.on; ev.currentTarget.setAttribute('aria-checked', String(e.on)); await save(); } })))));
  return out;
}
