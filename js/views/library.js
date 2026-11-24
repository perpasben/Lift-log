import * as db from '../db.js';
import { h, topbar, toast } from '../ui.js';
import { icon } from '../icons.js';
import { searchExercises, availableAt, akey } from '../logic/substitution.js';
import { pickExercise, editExercise } from './picker.js';
import { confirmSheet, sheet } from '../ui.js';

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
      h('span', { class: 'chev', html: icon('chev') })))),
    h('button', { class: 'btn block', style: 'margin-top:14px', onclick: newGym }, 'Add gym'));

  async function newGym() {
    const name = h('input', { class: 'search', placeholder: 'Gym name', autocapitalize: 'words', style: 'margin:10px 0' });
    const { EQUIPMENT } = await import('../seed.js');
    sheet((close) => [h('h3', {}, 'New gym'), name, h('button', { class: 'btn pri block', onclick: async () => {
      const n = name.value.trim(); if (!n) return;
      const id = `gym-${Date.now().toString(36)}`;
      await db.put('gyms', { id, name: n, increment: 2.5, maxDumbbell: null, equipment: EQUIPMENT.map(([key, label]) => ({ key, label, on: false })) });
      close(); nav.push(() => gymView(id, nav));
    } }, 'Create')]);
  }
}

async function exercises(body) {
  const [list, gyms] = [await db.all('exercises'), await db.all('gyms')];
  const input = h('input', { class: 'search', type: 'search', placeholder: 'Search in English or Spanish', value: q, autocomplete: 'off', autocapitalize: 'off' });
  const res = h('div', { class: 'card' });
  const paint = () => {
    const found = searchExercises(list, q).slice(0, 80);
    res.replaceChildren(...(found.length ? found.map((e) => h('button', { class: 'row', onclick: async () => { if (await editExercise(e)) paintAll(); } }, h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 'd' }, [e.muscle, e.aliases[0]].filter(Boolean).join(' · '))))) : [h('div', { class: 'empty' }, 'No matches')]));
  };
  const paintAll = async () => { list.splice(0, list.length, ...(await db.all('exercises'))); paint(); };
  input.addEventListener('input', () => { q = input.value; paint(); });
  body.append(input, res, h('button', { class: 'btn block', style: 'margin-top:14px', onclick: async () => { if (await editExercise(null, q)) paintAll(); } }, 'New exercise'));
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
  const [slotsRaw, asg, exs] = await Promise.all([db.all('slots'), db.all('assignments'), db.all('exercises')]);
  const { SLOTS } = await import('../seed.js');
  const order = SLOTS.map((x) => x.id);
  const slots = [...slotsRaw].sort((a, b) => (order.indexOf(a.id) + 1 || 999) - (order.indexOf(b.id) + 1 || 999));
  const exName = Object.fromEntries(exs.map((x) => [x.id, x]));
  const mine = Object.fromEntries(asg.filter((a) => a.gymId === g.id).map((a) => [a.slotId, a.exerciseId]));
  out.append(h('h2', {}, 'Movements'), h('div', { class: 'card' }, ...slots.map((sl) => {
    const ex = exName[mine[sl.id]];
    const missing = ex && !availableAt(ex, g);
    return h('button', { class: 'row', onclick: async () => {
      const pick = await pickExercise({ gym: g, title: sl.name, allowClear: true });
      if (pick === undefined) return;
      if (pick === null) await db.del('assignments', akey(sl.id, g.id));
      else await db.put('assignments', { id: akey(sl.id, g.id), slotId: sl.id, gymId: g.id, exerciseId: pick });
      nav.refresh();
    } },
      h('div', { class: 'grow' }, h('div', { class: 'd', style: 'margin:0 0 2px' }, sl.name), h('div', { class: `t ${ex ? '' : 'ac'}` }, ex ? ex.name : 'Not set'), missing ? h('div', { class: 'd ac' }, 'Equipment not marked at this gym') : null),
      h('span', { class: 'chev', html: icon('chev') }));
  })));
  out.append(h('h2', {}, 'Equipment'), h('div', { class: 'card' }, ...g.equipment.map((e) =>
    h('div', { class: 'row' }, h('div', { class: 'grow t' }, e.label),
      h('button', { class: 'sw', role: 'switch', 'aria-checked': String(e.on), 'aria-label': e.label, onclick: async (ev) => { e.on = !e.on; ev.currentTarget.setAttribute('aria-checked', String(e.on)); await save(); } })))));
  const sessions = await db.all('sessions');
  const used = sessions.filter((x) => x.gymId === g.id).length;
  out.append(h('h2', {}, 'Gym'), h('div', { class: 'card' },
    h('button', { class: 'row', onclick: () => {
      const name = h('input', { class: 'search', value: g.name, style: 'margin:10px 0', autocapitalize: 'words' });
      sheet((close) => [h('h3', {}, 'Rename gym'), name, h('button', { class: 'btn pri block', onclick: async () => { if (name.value.trim()) { g.name = name.value.trim(); await save(); close(); nav.refresh(); } } }, 'Save')]);
    } }, h('div', { class: 'grow t' }, 'Rename')),
    h('button', { class: 'row', onclick: async () => {
      if (used) return toast(`Can\u2019t delete: ${used} workouts were logged here`);
      if (!(await confirmSheet({ title: `Delete ${g.name}?`, body: 'Its movement assignments are removed too.', ok: 'Delete', danger: true }))) return;
      for (const a of asg.filter((x) => x.gymId === g.id)) await db.del('assignments', a.id);
      await db.del('gyms', g.id); nav.back();
    } }, h('div', { class: 'grow t', style: 'color:var(--bad)' }, 'Delete gym'))));
  return out;
}
