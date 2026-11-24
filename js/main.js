import * as db from './db.js';
import { CATALOG, SLOTS, ROUTINES, seedGyms, seedAssignments, SETTINGS_DEFAULT } from './seed.js';
import { h } from './ui.js';
import { icon } from './icons.js';
import { trainView } from './views/train.js';
import { historyView } from './views/history.js';
import { libraryView } from './views/library.js';
import { settingsView } from './views/settings.js';
import { loadActive } from './active.js';
import { initRest } from './rest.js';

const TABS = [['train', 'Train', trainView], ['history', 'History', historyView], ['library', 'Library', libraryView], ['settings', 'Settings', settingsView]];

const state = { tab: 'train', stack: [] };
export const nav = {
  canBack: () => state.stack.length > 1,
  push(view) { state.stack.push(view); render(); },
  back() { if (state.stack.length > 1) { state.stack.pop(); render(); } },
  refresh: () => render(),
  tab: (id) => selectTab(id),
};

async function seed() {
  if (await db.kvGet('seeded')) return;
  await db.putMany('exercises', CATALOG);
  await db.putMany('slots', SLOTS);
  await db.putMany('routines', ROUTINES);
  await db.putMany('gyms', seedGyms());
  await db.putMany('assignments', seedAssignments());
  await db.kvSet('settings', SETTINGS_DEFAULT);
  await db.kvSet('seeded', true);
}

function selectTab(id) {
  state.tab = id;
  state.stack = [TABS.find((t) => t[0] === id)[2]];
  render();
}

async function render() {
  const view = document.getElementById('view');
  const top = state.stack[state.stack.length - 1];
  const el = await top({ nav });
  view.replaceChildren(el);
  view.scrollTop = 0;
  const tabs = document.getElementById('tabs');
  tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { 'aria-current': String(id === state.tab), onclick: () => selectTab(id), html: `${icon(id)}<span>${label}</span>` })));
}

async function boot() {
  await seed();
  await loadActive();
  selectTab('train');
  initRest();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
}
// iOS ignores user-scalable=no in some modes: block pinch and double-tap zoom explicitly.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
let lastTouch = 0;
document.addEventListener('touchend', (e) => { const n = Date.now(); if (n - lastTouch < 350 && !e.target.closest('input,textarea')) e.preventDefault(); lastTouch = n; }, { passive: false });

boot();
