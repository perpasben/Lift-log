import * as db from '../db.js';
import { h, sheet, toast, confirmSheet, topbar } from '../ui.js';
import { icon } from '../icons.js';
import { CIRCUITS } from '../seed.js';
import { howTo, HOWTO } from '../howto.js';
import { circuitState, remaining, fmt } from '../logic/timer.js';
import { uid } from '../logic/workout.js';

const KEY = 'circuit';
const load = () => db.kvGet(KEY, null);
const save = (c) => db.kvSet(KEY, c);
const cue = (name) => howTo({ name }) || HOWTO[name] || '';

let wake = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wake) wake = await navigator.wakeLock.request('screen');
    if (!on && wake) { await wake.release(); wake = null; }
  } catch { wake = null; }
}

export async function extrasView({ nav }) {
  const cur = await load();
  const out = h('div', {}, ...topbar('Extras', nav));
  out.append(h('p', { class: 'sub' }, 'Circuits with timers. No weights are logged.'));
  out.append(h('div', { class: 'card' }, ...CIRCUITS.map((c) => h('button', { class: 'row', onclick: () => open(c, nav) },
    h('div', { class: 'grow' }, h('div', { class: 't' }, c.name), h('div', { class: 'd' }, cur?.id === c.id ? 'In progress — tap to resume' : c.blurb)),
    h('span', { class: 'chev', html: icon('chev') })))));
  return out;
}

async function open(c, nav) {
  const cur = await load();
  if (cur && cur.id !== c.id) {
    if (!(await confirmSheet({ title: 'Another circuit is running', body: 'Starting this one discards the other.', ok: 'Start new', danger: true }))) return;
    await save(null);
  }
  nav.push(c.kind === 'interval' ? () => intervalView(c, nav) : () => stepsView(c, nav));
}

async function finishCircuit(c, state, nav) {
  const settings = await db.kvGet('settings', {});
  const end = Date.now();
  await db.put('sessions', { id: uid('c'), routineId: c.id, gymId: settings.lastGymId || 'big', start: state.start, end, entries: [] });
  await save(null);
  await keepAwake(false);
  const m = Math.max(1, Math.round((end - state.start) / 60000));
  sheet((close) => [h('h3', {}, `${c.name} done`), h('p', { class: 'muted' }, `${m} min logged.`), h('button', { class: 'btn pri block', onclick: close }, 'Done')]);
  nav.tab('train');
}

/* ---------- checklist circuits (mobility, farmer's walk) ---------- */
function unitsOf(c) {
  const u = [];
  c.steps.forEach((s, si) => {
    const base = { step: si, name: s.name, reps: s.reps, seconds: s.seconds, meters: s.meters };
    if (s.perSide) { u.push({ ...base, side: 'Left', done: false }); u.push({ ...base, side: 'Right', done: false }); } else u.push({ ...base, done: false });
  });
  return u;
}

async function stepsView(c, nav) {
  let state = await load();
  if (!state || state.id !== c.id) { state = { id: c.id, start: Date.now(), units: unitsOf(c) }; await save(state); }
  const out = h('div', {}, ...topbar(c.name, nav));
  const list = h('div');
  const prog = h('p', { class: 'sub' });
  const paint = () => {
    const done = state.units.filter((u) => u.done).length;
    prog.textContent = `${done} of ${state.units.length} done`;
    list.replaceChildren(h('div', { class: 'card' }, ...state.units.map((u, i) => unitRow(u, i))));
  };
  const unitRow = (u, i) => {
    const what = u.reps ? `${u.reps} reps` : u.seconds ? `${u.seconds} s` : `${u.meters} m`;
    const dot = h('button', { class: 'dot', 'aria-label': 'Mark done', onclick: () => { u.done = !u.done; u.endAt = null; save(state); paint(); } }, u.done ? '' : String(i + 1));
    if (u.done) dot.innerHTML = icon('check');
    const timerBtn = u.seconds && !u.done ? h('button', { class: 'chip ac', onclick: () => { u.endAt = Date.now() + u.seconds * 1000; save(state); paint(); } }, u.endAt ? 'Restart' : `Start ${u.seconds}s`) : null;
    const left = u.endAt ? remaining({ endAt: u.endAt }, Date.now()) : 0;
    return h('div', { class: `row ${u.done ? 'is-done' : ''}`, style: 'align-items:flex-start' }, dot,
      h('div', { class: 'grow' }, h('div', { class: 't' }, u.name, u.side ? h('span', { class: 'pill-note' }, u.side) : null),
        h('div', { class: 'd' }, what, u.endAt && left > 0 ? h('span', { class: 'ac mono', 'data-end': u.endAt }, ` · ${fmt(left)}`) : null),
        !u.side || u.side === 'Left' ? h('div', { class: 'how', style: 'font-size:13px;margin-top:4px' }, cue(u.name)) : null),
      timerBtn);
  };
  const tick = setInterval(() => {
    if (!out.isConnected) return clearInterval(tick);
    let changed = false;
    for (const u of state.units) if (u.endAt && !u.done && Date.now() >= u.endAt) { u.done = true; u.endAt = null; changed = true; }
    if (changed) { save(state); paint(); return; }
    list.querySelectorAll('[data-end]').forEach((el) => { el.textContent = ` · ${fmt(remaining({ endAt: +el.dataset.end }, Date.now()))}`; });
  }, 500);
  paint();
  out.append(prog, list,
    h('button', { class: 'btn pri block', style: 'margin-top:16px', onclick: async () => {
      if (state.units.some((u) => !u.done) && !(await confirmSheet({ title: 'Finish with items left?', body: 'Unchecked items are simply skipped.', ok: 'Finish' }))) return;
      finishCircuit(c, state, nav);
    } }, 'Finish'),
    h('button', { class: 'btn block danger', style: 'margin-top:10px', onclick: async () => { if (await confirmSheet({ title: 'Discard this circuit?', body: 'Nothing is saved.', ok: 'Discard', danger: true })) { await save(null); nav.back(); } } }, 'Discard'));
  return out;
}

/* ---------- interval circuit (abs 40/20) ---------- */
async function intervalView(c, nav) {
  let state = await load();
  const total = c.rounds * c.items.length;
  const out = h('div', { class: 'iv' }, ...topbar(c.name, nav));
  const stage = h('div', { class: 'iv-stage' });
  const controls = h('div', { class: 'iv-ctl' });
  out.append(stage, controls);

  const startNow = async () => {
    state = { id: c.id, start: Date.now(), startAt: Date.now() + 5000, pausedAt: null };
    await save(state); keepAwake(true); paint();
  };
  const effNow = () => (state.pausedAt ?? Date.now());
  const paint = () => {
    if (!state || state.id !== c.id) {
      stage.className = 'iv-stage idle';
      stage.replaceChildren(h('div', { class: 'iv-big' }, `${c.rounds} × ${c.items.length}`),
        h('div', { class: 'muted' }, `${c.work} s work · ${c.rest} s rest`),
        h('div', { class: 'card', style: 'margin-top:18px;text-align:left' }, ...c.items.map((n, i) => h('div', { class: 'row' }, h('div', { class: 'muted mono', style: 'width:22px' }, String(i + 1)), h('div', { class: 'grow t' }, n)))));
      controls.replaceChildren(h('button', { class: 'btn pri block', onclick: startNow }, 'Start (5 s to get ready)'));
      return;
    }
    controls.replaceChildren(
      h('button', { class: 'btn', style: 'flex:1', onclick: () => { if (state.pausedAt) { state.startAt += Date.now() - state.pausedAt; state.pausedAt = null; keepAwake(true); } else { state.pausedAt = Date.now(); } save(state); paint(); } }, state.pausedAt ? 'Resume' : 'Pause'),
      h('button', { class: 'btn', style: 'flex:1', onclick: () => { const cs = circuitState(state.startAt, effNow(), c.work, c.rest, total); if (!cs.finished && effNow() >= state.startAt) { state.startAt -= cs.left * 1000; save(state); } tick(); } }, 'Skip'),
      h('button', { class: 'btn danger', style: 'flex:1', onclick: async () => { if (await confirmSheet({ title: 'Stop the circuit?', body: 'Nothing is saved.', ok: 'Stop', danger: true })) { await save(null); await keepAwake(false); state = null; paint(); } } }, 'Stop'));
  };
  const tick = () => {
    if (!state || state.id !== c.id) return;
    const now = effNow();
    if (now < state.startAt) {
      stage.className = 'iv-stage ready';
      stage.replaceChildren(h('div', { class: 'iv-phase' }, 'Get ready'), h('div', { class: 'iv-big num' }, String(Math.ceil((state.startAt - now) / 1000))), h('div', { class: 'iv-name' }, c.items[0]));
      return;
    }
    const cs = circuitState(state.startAt, now, c.work, c.rest, total);
    if (cs.finished) { clearInterval(timer); finishCircuit(c, state, nav); return; }
    const name = c.items[cs.index % c.items.length];
    const nextName = cs.index + 1 < total ? c.items[(cs.index + 1) % c.items.length] : 'the end';
    stage.className = `iv-stage ${cs.phase}`;
    stage.replaceChildren(
      h('div', { class: 'iv-phase' }, state.pausedAt ? 'Paused' : cs.phase === 'work' ? 'Work' : 'Rest'),
      h('div', { class: 'iv-big num' }, String(cs.left)),
      h('div', { class: 'iv-name' }, cs.phase === 'work' ? name : `Next: ${nextName}`),
      h('div', { class: 'muted' }, `Round ${Math.floor(cs.index / c.items.length) + 1} of ${c.rounds} · exercise ${(cs.index % c.items.length) + 1} of ${c.items.length}`),
      h('div', { class: 'how', style: 'margin-top:12px' }, cue(cs.phase === 'work' ? name : nextName)));
  };
  const timer = setInterval(() => { if (!out.isConnected) { clearInterval(timer); return; } tick(); }, 250);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); if (state && !state.pausedAt) keepAwake(true); } });
  paint(); tick();
  return out;
}
