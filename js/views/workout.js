import * as db from '../db.js';
import { h, sheet, toast, confirmSheet, kg } from '../ui.js';
import { icon } from '../icons.js';
import { getActive, saveActive, clearActive } from '../active.js';
import { startRest } from '../rest.js';
import { pickExercise } from './picker.js';
import { nextActiveSet, personalRecord, lastFor, lastPreferGym, addedDefaults, makeSets, suggestionFor, entryOf, restDue, routineChanges, toSession, stats, uid } from '../logic/workout.js';
import { howTo } from '../howto.js';
import { exercisePhoto, pickPhoto } from '../photos.js';
import { alternativesFor, KIND_LABEL } from '../alternatives.js';
import { unfinished, buildPending } from '../logic/carryover.js';
import { akey } from '../logic/substitution.js';
import { summaryView } from './summary.js';

const NAMES = { push: 'Push', pull: 'Pull', leg: 'Leg', extra: 'Extra workout' };
const num = (v) => (v.trim() === '' ? null : Number(v.replace(',', '.')));
const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); const h2 = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h2 ? `${h2}:` : ''}${String(m).padStart(h2 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`; };

export function fmtSet(type, s) {
  if (type === 't') return `${s.t ?? 0}s`;
  if (type === 'rr') return `×${s.r}`;
  if (type === 'bw') return `${s.w ? `+${s.w}` : 'BW'}×${s.r}`;
  return `${s.w ?? 0}×${s.r}`;
}

export async function workoutView({ nav }) {
  const w = getActive();
  const root = h('div');
  if (!w) { root.append(h('div', { class: 'empty' }, 'No workout in progress.')); return root; }
  const [gym, exList, sessions, settings, allGyms] = await Promise.all([db.get('gyms', w.gymId), db.all('exercises'), db.all('sessions'), db.kvGet('settings', { restSec: 90 }), db.all('gyms')]);
  const ctx = { gymNames: Object.fromEntries(allGyms.map((g) => [g.id, g.name])), w, gym, exs: Object.fromEntries(exList.map((x) => [x.id, x])), sessions, settings, nav };
  const persist = () => saveActive();
  ctx.persist = persist;

  const elapsed = h('span', { class: 'num' }, mmss(Date.now() - w.start));
  const tick = setInterval(() => { if (!elapsed.isConnected) return clearInterval(tick); elapsed.textContent = mmss(Date.now() - w.start); }, 1000);

  const blocksEl = h('div');
  const paintAll = () => blocksEl.replaceChildren(...w.blocks.map((b) => blockEl(ctx, b)));
  ctx.paintAll = paintAll;
  // the one highlighted set: the next undone set of the first unfinished exercise
  ctx.nextSet = () => nextActiveSet(w);
  paintAll();

  root.append(
    h('div', { class: 'wk-top' },
      h('button', { class: 'ibtn', 'aria-label': 'Back to home (workout keeps running)', html: icon('back'), onclick: () => nav.back() }),
      h('div', { class: 'ttl' }, h('b', {}, NAMES[w.routineId] || 'Workout'), h('span', {}, gym?.name, ' · ', elapsed)),
      h('button', { class: 'ibtn go', 'aria-label': 'Finish workout', html: icon('check'), onclick: () => finish(ctx) })),
    blocksEl,
    h('button', { class: 'btn block', onclick: async () => {
      const id = await pickExercise({ gym, title: 'Add exercise' });
      if (!id) return;
      await refreshExs(ctx);
      const type = ctx.exs[id]?.type || 'wr';
      const last = lastPreferGym(sessions, id, gym.id);
      const d = addedDefaults(last, { increment: gym.increment, type });
      const b = { id: uid('b'), label: 'Added', kind: 'added', rounds: d.sets.length, entryIds: [] };
      const e = { id: uid(), blockId: b.id, slotId: null, exerciseId: id, baseExerciseId: id, repMin: d.repMin, repMax: d.repMax, skipped: false, sets: d.sets };
      b.entryIds.push(e.id); w.blocks.push(b); w.entries.push(e); persist(); paintAll();
    } }, h('span', { html: icon('plus') }), 'Add exercise'),
    h('button', { class: 'btn block danger', style: 'margin-top:10px', onclick: async () => {
      if (!(await confirmSheet({ title: 'Discard this workout?', body: 'Nothing from it is saved.', ok: 'Discard', danger: true }))) return;
      await clearActive(); ctx.nav.tab('train');
    } }, 'Discard workout'));
  return root;
}

async function refreshExs(ctx) { ctx.exs = Object.fromEntries((await db.all('exercises')).map((x) => [x.id, x])); }

function blockEl(ctx, b) {
  const { w } = ctx;
  const el = h('section', { class: `blk ${b.kind === 'superset' && b.entryIds.length > 1 ? 'ss' : ''}` });
  const paint = () => {
    const es = b.entryIds.map((id) => entryOf(w, id));
    const shown = es.some((e) => !e.exerciseId || e.skipped || e.sets.length);
    const label = !shown ? null : b.kind === 'carry' ? h('div', { class: 'blk-h' }, 'Carried over from last time')
      : b.kind === 'added' ? h('div', { class: 'blk-h' }, 'Added today')
        : b.kind === 'warmup' ? h('div', { class: 'blk-h' }, 'Warm-up')
          : null;
    el.replaceChildren(...[label, ...es.map((e) => entryEl(ctx, e, paint))].filter(Boolean));
  };
  paint();
  return el;
}

function entryEl(ctx, e, repaint) {
  const { w, gym, exs, sessions, settings } = ctx;
  const ex = exs[e.exerciseId];
  const type = ex?.type || 'wr';
  const card = h('div', { class: 'ex' });

  if (e.skipped) {
    card.append(h('div', { class: 'skipped' }, h('div', { class: 'grow' }, ex?.name || 'Skipped movement', h('span', { class: 'pill-note' }, 'Skipped')),
      h('button', { class: 'chip', onclick: () => { e.skipped = false; ctx.persist(); repaint(); } }, 'Restore')));
    return card;
  }

  // every set removed: the exercise leaves the workout (nothing is saved or carried for it)
  if (e.exerciseId && !e.sets.length) return null;

  // an exercise left without sets disappears, so the whole list is repainted (the highlighted set moves on)
  function afterRemove() { ctx.persist(); if (e.sets.length) repaint(); else ctx.paintAll(); }

  const choose = async (title) => {
    const id = await pickExercise({ gym, title });
    if (!id) return;
    await refreshExs(ctx);
    swapTo(id);
  };
  const swapTo = (id) => {
    e.exerciseId = id;
    const t = ctx.exs[id]?.type || 'wr';
    const last = lastPreferGym(sessions, id, gym.id);
    const done = e.sets.filter((s) => s.done);
    const fresh = makeSets(Math.max(0, e.sets.length - done.length), { type: t, last, repMin: e.repMin, repMax: e.repMax, increment: gym.increment });
    e.sets = [...done, ...fresh];
    ctx.persist(); repaint();
  };

  if (!e.exerciseId) {
    card.append(h('div', { class: 'ex-h' }, h('div', { class: 'grow' }, h('div', { class: 'nm' }, 'No exercise for this movement here'))),
      h('div', { class: 'nopick' }, 'This gym has nothing assigned to this slot yet.',
        h('div', { class: 'btns' }, h('button', { class: 'btn pri', onclick: () => choose('Choose exercise') }, 'Choose'), h('button', { class: 'btn', onclick: () => { e.skipped = true; ctx.persist(); repaint(); } }, 'Skip'))));
    return card;
  }

  const workSets = e.sets.some((x) => !x.warm) ? e.sets.filter((x) => !x.warm) : e.sets;
  const doneN = workSets.filter((x) => x.done).length;
  const head = h('div', { class: 'ex-h' }, h('div', { class: 'grow' }, h('div', { class: 'nm' }, ex?.name || e.exerciseId),
    h('div', { class: 'meta' }, e.repMax ? (e.repMin === e.repMax ? `${e.repMax} reps` : `${e.repMin}\u2013${e.repMax} reps`) : `${workSets.length} sets`)),
  h('div', { class: 'prog', 'aria-label': `${doneN} of ${workSets.length} sets done` }, h('b', { class: 'num' }, String(doneN), h('small', {}, `/${workSets.length}`)), h('div', { class: 'segs' }, ...workSets.map((x) => h('i', { class: x.done ? 'on' : '' })))),
  h('button', { class: 'more', 'aria-label': 'Exercise options', html: icon('more'), onclick: () => menu() }));
  // the exercise photo (own, or by muscle group) sits behind the title and fades to black into the sets
  const pic = exercisePhoto(ex);
  if (pic) card.append(h('div', { class: 'ex-hero', style: `background-image:url(${pic})` }, head)); else card.append(head);

  const rec = type === 'wr' ? personalRecord(sessions, e.exerciseId, gym.id, e.sets) : null;
  if (rec) card.append(h('div', { class: 'pr' }, h('i', { html: icon('trophy') }), h('span', {}, 'New personal record'), h('b', { class: 'num' }, `${Number.isInteger(rec.w) ? rec.w : rec.w.toFixed(1)} kg \u00d7 ${rec.r}`)));

  const nxt = ctx.nextSet();
  const activeIdx = nxt && nxt.id === e.id ? nxt.i : -1;
  let work = 0;
  e.sets.forEach((s, i) => {
    if (!s.warm) work++;
    const dot = h('button', { class: 'dot', 'aria-label': `Mark set ${i + 1} done` }, s.done ? '' : s.warm ? 'W' : String(work));
    if (s.done) dot.innerHTML = icon('check');
    const row = h('div', { class: `set ${s.done ? 'done' : ''} ${i === activeIdx ? 'active' : ''}`, 'data-n': s.warm ? 'W' : String(work).padStart(2, '0') }, dot, h('div', { class: 'sp' }));
    const field = (key, unit, ph) => [h('input', { class: 'in', inputmode: 'decimal', value: s[key] ?? '', placeholder: ph, 'aria-label': unit, onfocus: (ev) => ev.target.select(), oninput: (ev) => { s[key] = num(ev.target.value); ctx.persist(); } }), h('span', { class: 'unit' }, unit)];
    if (type === 'wr') row.append(...field('w', 'kg', '0'), ...field('r', 'reps', '0'));
    else if (type === 'bw') row.append(h('span', { class: 'unit' }, '+'), ...field('w', 'kg', '0'), ...field('r', 'reps', '0'));
    else if (type === 't') row.append(...field('t', 'sec', '0'));
    else row.append(...field('r', 'reps', '0'));
    dot.addEventListener('click', () => {
      s.done = !s.done; s.at = Date.now();
      w.lastDone = s.done ? { id: e.id, i } : { id: e.id, i: i - 1 }; // the highlight follows the last tick
      ctx.persist();
      if (s.done && restDue(w, e, i)) startRest(settings.restSec);
      ctx.paintAll();
    });
    card.append(swipeable(row, [
      { label: s.warm ? 'Work set' : 'Warm-up', fn: () => { s.warm = !s.warm; ctx.persist(); repaint(); } },
      { label: 'Delete', cls: 'del', fn: () => { e.sets.splice(i, 1); afterRemove(); } }]));
  });
  card.append(h('div', { class: 'setbar' },
    h('button', { class: 'addset', onclick: () => { const t = e.sets[e.sets.length - 1]; e.sets.push({ w: t?.w ?? null, r: t?.r ?? e.repMin, t: t?.t ?? null, warm: false, done: false }); ctx.persist(); repaint(); } }, h('span', { html: icon('plus') }), 'Add set'),
    h('button', { class: 'rmset', 'aria-label': 'Remove last set', html: icon('minus'), onclick: () => { e.sets.pop(); afterRemove(); } })));

  function menu() {
    sheet((close) => {
      const item = (label, fn, danger) => h('button', { class: 'row', style: danger ? 'color:var(--bad)' : '', onclick: () => { close(); fn(); } }, h('div', { class: 'grow t' }, label));
      const how = howTo(ex);
      const alts = alternativesFor(e.exerciseId, ctx.exs, gym);
      const savePhoto = async (url) => {
        const rec = { ...(await db.get('exercises', e.exerciseId)) };
        if (url) rec.photo = url; else delete rec.photo;
        await db.put('exercises', rec);
        ctx.exs[e.exerciseId] = rec;
        repaint();
      };
      const head = [h('div', { class: 'menu-h' }, h('h3', {}, ex?.name || 'Exercise'),
          h('button', { class: 'cam', 'aria-label': ex?.photo ? 'Change photo' : 'Add photo', html: icon('camera'), onclick: async () => { const u = await pickPhoto(700); if (!u) return; close(); await savePhoto(u); } })),
        h('p', { class: 'how' }, how || 'No description yet. Edit the exercise in Library to add your own notes.')];
      return [ex?.photo ? h('div', { class: 'menu-hero', style: `background-image:url(${ex.photo})` }, ...head) : h('div', {}, ...head),
        alts.length ? h('div', { class: 'alt-box' },
          h('div', { class: 'alt-h' }, `Swap ${ex?.name} for`),
          ...alts.map((a) => h('button', { class: 'row', onclick: () => { close(); swapTo(a.id); } },
            h('div', { class: 'grow t' }, ctx.exs[a.id].name), h('span', { class: 'chip' }, KIND_LABEL[a.kind])))) : null,
        h('div', { class: 'card', style: 'margin-top:12px' },
        item('Other exercise\u2026', () => choose('Swap exercise')),
        ex?.photo ? item('Remove photo', () => savePhoto(null)) : null,
        item('Add warm-up set', () => { e.sets.unshift({ w: null, r: e.repMin, t: null, warm: true, done: false }); ctx.persist(); repaint(); }),
        item('Remove last set', () => { e.sets.pop(); afterRemove(); }),
        item('Skip this exercise', () => { e.skipped = true; ctx.persist(); repaint(); }, true))].filter(Boolean);
    });
  }
  return card;
}

/* ---------- swipe to reveal actions ---------- */
let openRow = null;
function swipeable(row, actions) {
  const W = actions.length * 78;
  const wrap = h('div', { class: 'swipe' });
  wrap.append(h('div', { class: 'swipe-act' }, ...actions.map((a) => h('button', { class: `sa ${a.cls || ''}`, onclick: a.fn }, a.label))), row);
  let x = 0, sx = 0, sy = 0, base = 0, mode = null, pid = null, opened = false, swipedAt = 0;
  const move = (v, anim) => {
    x = v; row.style.transition = anim ? 'transform .2s ease' : 'none'; row.style.transform = `translateX(${v}px)`;
    // the red/grey action buttons live behind the row: only show them while it is slid open (no colour bleeding at the rounded edges)
    if (v < -2) wrap.classList.add('revealed');
    else if (anim) setTimeout(() => { if (x >= -2) wrap.classList.remove('revealed'); }, 230);
    else wrap.classList.remove('revealed');
  };
  const api = { close() { opened = false; move(0, true); if (openRow === api) openRow = null; } };
  row.style.touchAction = 'pan-y';
  row.addEventListener('pointerdown', (e) => { if (openRow && openRow !== api) openRow.close(); sx = e.clientX; sy = e.clientY; base = opened ? -W : 0; mode = null; pid = e.pointerId; });
  row.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!mode) { if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.4) { mode = 'h'; try { row.setPointerCapture(pid); } catch {} } else if (Math.abs(dy) > 8) mode = 'v'; }
    if (mode === 'h') move(Math.min(0, Math.max(-W - 24, base + dx)));
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    if (mode === 'h') { swipedAt = Date.now(); opened = x < -W / 2.5; move(opened ? -W : 0, true); openRow = opened ? api : null; }
    pid = null; mode = null;
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('click', (ev) => { if (Date.now() - swipedAt < 350) { ev.stopPropagation(); ev.preventDefault(); return; } if (opened) { ev.stopPropagation(); ev.preventDefault(); api.close(); } }, true);
  return wrap;
}

/* ---------- finishing ---------- */

function chooseDecisions(w, list) {
  return new Promise((res) => {
    const dec = Object.fromEntries(list.map((u) => [u.entry.id, 'carry']));
    const opts = [['carry', w.routineId === 'extra' ? 'Next extra' : 'Next workout'], ['extra', 'Extra workout'], ['drop', 'Drop']];
    let settled = false;
    const done = (v, close) => { if (!settled) { settled = true; res(v); } close(); };
    sheet((close) => [
      h('h3', {}, `${list.length} exercise${list.length > 1 ? 's' : ''} not finished`),
      h('p', { class: 'muted', style: 'margin:0 0 6px' }, 'Choose what happens to each one.'),
      ...list.map((u) => h('div', { class: 'dec' }, h('div', { class: 'nm' }, u.name, h('span', { class: 'muted' }, ` · ${u.left} set${u.left > 1 ? 's' : ''} left`)),
        h('div', { class: 'seg' }, ...opts.map(([v, l]) => h('button', { 'aria-pressed': String(dec[u.entry.id] === v), onclick: (ev) => { dec[u.entry.id] = v; [...ev.currentTarget.parentNode.children].forEach((b) => b.setAttribute('aria-pressed', String(b === ev.currentTarget))); } }, l))))),
      h('div', { style: 'display:grid;gap:10px;margin-top:14px' },
        h('button', { class: 'btn pri block', onclick: () => done({ dec }, close) }, 'Finish workout'),
        h('button', { class: 'btn block', onclick: () => done({ markAll: true }, close) }, 'Mark all as done'),
        h('button', { class: 'btn block', onclick: () => done(null, close) }, 'Keep training')),
    ]);
    new MutationObserver((_, ob) => { if (!document.querySelector('.sheet')) { ob.disconnect(); if (!settled) { settled = true; res(null); } } }).observe(document.getElementById('layer'), { childList: true });
  });
}

function askUpdateRoutine(gym, ch, exs) {
  return new Promise((res) => {
    let settled = false;
    const done = (v, close) => { if (!settled) { settled = true; res(v); } close(); };
    const nm = (id) => exs[id]?.name || id;
    sheet((close) => [
      h('h3', {}, 'Update the routine?'),
      h('p', { class: 'muted' }, `Changes you made today at ${gym.name}:`),
      h('div', { class: 'card', style: 'margin:10px 0 16px' },
        ...ch.swaps.map((s) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, nm(s.to)), h('div', { class: 'd' }, s.from ? `instead of ${nm(s.from)}` : 'new for this movement')))),
        ...ch.added.map((a) => h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, nm(a.exerciseId)), h('div', { class: 'd' }, 'added as a new block'))))),
      h('div', { style: 'display:grid;gap:10px' },
        h('button', { class: 'btn pri block', onclick: () => done(true, close) }, 'Update routine'),
        h('button', { class: 'btn block', onclick: () => done(false, close) }, 'Just today')),
    ]);
    new MutationObserver((_, ob) => { if (!document.querySelector('.sheet')) { ob.disconnect(); if (!settled) { settled = true; res(false); } } }).observe(document.getElementById('layer'), { childList: true });
  });
}

async function finish(ctx) {
  const { w, gym, exs } = ctx;
  const nameOf = (e) => exs[e.exerciseId]?.name || 'Exercise';
  const anyDone = () => w.entries.some((e) => !e.skipped && e.sets.some((s) => s.done));
  if (!anyDone() && !unfinished(w).length) { await clearActive(); return ctx.nav.tab('train'); }

  let decisions = {};
  const open = unfinished(w).map((u) => ({ ...u, name: nameOf(u.entry) }));
  if (open.length) {
    const r = await chooseDecisions(w, open);
    if (!r) return;
    if (r.markAll) { open.forEach((u) => u.entry.sets.forEach((s) => { if (!s.warm) s.done = true; })); ctx.persist(); open.length = 0; }
    else decisions = r.dec;
  }
  if (!anyDone()) {
    if (!(await confirmSheet({ title: 'Nothing logged', body: 'No set was marked done. Discard this workout?', ok: 'Discard', danger: true }))) return;
    await clearActive(); return ctx.nav.tab('train');
  }

  const end = Date.now();
  const session = toSession(w, end);
  const pend = buildPending(w, decisions, end);
  const ch = w.routineId === 'extra' ? { swaps: [], added: [] } : routineChanges(w);
  if (ch.swaps.length || ch.added.length) {
    if (await askUpdateRoutine(gym, ch, exs)) await applyRoutineChanges(w, gym, ch, exs);
  }

  await db.put('sessions', session);
  for (const e of w.entries) if (e.pendingId) await db.del('pending', e.pendingId);
  if (pend.length) await db.putMany('pending', pend);
  const settings = await db.kvGet('settings', {});
  await db.kvSet('settings', { ...settings, lastGymId: gym.id });
  await clearActive();

  // the workout's data leaves the screen, then the summary takes its place
  const st = stats(session);
  const screen = document.getElementById('view')?.firstElementChild;
  if (screen && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { screen.classList.add('wk-out'); await new Promise((r) => setTimeout(r, 280)); }
  ctx.nav.replace(summaryView({ session, st, gym, exs, routineId: w.routineId, pend }), 'rise');
}

async function applyRoutineChanges(w, gym, ch, exs) {
  for (const s of ch.swaps) await db.put('assignments', { id: akey(s.slotId, gym.id), slotId: s.slotId, gymId: gym.id, exerciseId: s.to });
  if (!ch.added.length) return;
  const routine = await db.get('routines', w.routineId);
  if (!routine) return;
  for (const a of ch.added) {
    const slotId = `slot-${a.exerciseId}`;
    await db.put('slots', { id: slotId, name: exs[a.exerciseId]?.name || a.exerciseId });
    await db.put('assignments', { id: akey(slotId, gym.id), slotId, gymId: gym.id, exerciseId: a.exerciseId });
    (routine.gymBlocks?.[gym.id] || routine.blocks).push({ id: uid('rb'), label: '+', kind: 'superset', rounds: a.sets, restSec: null, items: [{ slotId, repMin: a.repMin, repMax: a.repMax }] });
  }
  await db.put('routines', routine);
}
