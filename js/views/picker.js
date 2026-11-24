import * as db from '../db.js';
import { h, sheet, toast } from '../ui.js';
import { searchExercises, availableAt } from '../logic/substitution.js';
import { slug } from '../logic/csv.js';
import { EQUIPMENT } from '../seed.js';

export const MUSCLES = ['Chest', 'Shoulders', 'Rear delts', 'Rotator cuff', 'Triceps', 'Back', 'Biceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Full body', 'Mobility'];
const TYPES = [['wr', 'Weight + reps'], ['bw', 'Bodyweight (+ extra kg)'], ['rr', 'Reps only'], ['t', 'Time']];

/**
 * Bottom sheet to pick an exercise. Resolves to an exercise id, null (cleared) or undefined (dismissed).
 * opts: { gym, title, allowClear, clearLabel }
 */
export async function pickExercise({ gym, title = 'Choose exercise', allowClear = false, clearLabel = 'Leave unassigned' } = {}) {
  let list = await db.all('exercises');
  return new Promise((resolve) => {
    let q = '';
    let settled = false;
    const finish = (v, close) => { if (!settled) { settled = true; resolve(v); } close(); };
    const close = sheet((closeSheet) => {
      const input = h('input', { class: 'search', type: 'search', placeholder: 'Search in English or Spanish', autocomplete: 'off', autocapitalize: 'off', style: 'margin:8px 0 10px' });
      const res = h('div', { class: 'card' });
      const paint = () => {
        const found = searchExercises(list, q, gym).slice(0, 60);
        res.replaceChildren(
          ...(allowClear && !q ? [h('button', { class: 'row', onclick: () => finish(null, closeSheet) }, h('div', { class: 'grow t muted' }, clearLabel))] : []),
          ...found.map((e) => {
            const ok = !gym || availableAt(e, gym);
            return h('button', { class: 'row', onclick: () => finish(e.id, closeSheet) },
              h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 'd' }, [e.muscle, ok ? null : 'Needs equipment this gym lacks'].filter(Boolean).join(' · '))));
          }),
          ...(!found.length ? [h('div', { class: 'empty' }, 'No matches')] : []),
          h('button', { class: 'row', onclick: async () => { const id = await editExercise(null, q); if (id) { list = await db.all('exercises'); finish(id, closeSheet); } } },
            h('div', { class: 'grow t ac' }, q ? `Create “${q}”` : 'Create new exercise')));
      };
      input.addEventListener('input', () => { q = input.value; paint(); });
      paint();
      // sheet dismissed via scrim should resolve undefined
      new MutationObserver((_, ob) => { if (!input.isConnected) { ob.disconnect(); if (!settled) { settled = true; resolve(undefined); } } }).observe(document.getElementById('layer'), { childList: true });
      return [h('h3', {}, title), input, res];
    });
    void close;
  });
}

/** Create or edit an exercise in a sheet. Resolves to the saved id or null. */
export function editExercise(ex, presetName = '') {
  const e = ex ? { ...ex, equipment: [...(ex.equipment || [])], aliases: [...(ex.aliases || [])] } : { name: presetName, aliases: [], muscle: '', equipment: [], type: 'wr', builtin: false };
  return new Promise((resolve) => {
    let done = false;
    sheet((close) => {
      const name = h('input', { class: 'search', value: e.name, placeholder: 'Name (English)', autocapitalize: 'words', style: 'margin:10px 0' });
      const alias = h('input', { class: 'search', value: e.aliases.join(', '), placeholder: 'Spanish aliases, comma separated', style: 'margin:0 0 10px' });
      const muscle = h('select', { class: 'search', style: 'margin:0 0 10px' }, h('option', { value: '' }, 'Muscle group'), ...MUSCLES.map((m) => h('option', { value: m, selected: e.muscle === m }, m)));
      const type = h('select', { class: 'search', style: 'margin:0 0 10px' }, ...TYPES.map(([v, l]) => h('option', { value: v, selected: e.type === v }, l)));
      const notes = h('textarea', { class: 'search', rows: 3, placeholder: 'How to do it / your notes', style: 'height:auto;padding:12px 16px;margin:0 0 10px;resize:none' }, e.notes || '');
      const eq = h('div', { class: 'chips', style: 'margin-bottom:16px' }, ...EQUIPMENT.map(([k, l]) => {
        const b = h('button', { class: `chip ${e.equipment.includes(k) ? 'ac' : ''}`, onclick: () => { const i = e.equipment.indexOf(k); i < 0 ? e.equipment.push(k) : e.equipment.splice(i, 1); b.classList.toggle('ac'); } }, l);
        return b;
      }));
      const save = async () => {
        const n = name.value.trim();
        if (!n) return toast('Give it a name');
        const all = await db.all('exercises');
        let id = e.id;
        if (!id) { id = slug(n) || `ex-${Date.now()}`; while (all.some((x) => x.id === id)) id += '-2'; }
        await db.put('exercises', { ...e, id, name: n, aliases: alias.value.split(',').map((x) => x.trim()).filter(Boolean), muscle: muscle.value, type: type.value, notes: notes.value.trim() });
        done = true; close(); resolve(id);
      };
      return [h('h3', {}, ex ? 'Edit exercise' : 'New exercise'), name, alias, muscle, type, notes, h('div', { class: 'muted', style: 'font-size:13px;margin-bottom:8px' }, 'Equipment needed'), eq,
        h('button', { class: 'btn pri block', onclick: save }, 'Save')];
    });
    new MutationObserver((_, ob) => { if (!document.querySelector('.sheet')) { ob.disconnect(); if (!done) resolve(null); } }).observe(document.getElementById('layer'), { childList: true });
  });
}
