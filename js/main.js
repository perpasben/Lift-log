import * as db from './db.js';
import { CATALOG, SLOTS, ROUTINES, seedGyms, seedAssignments, SETTINGS_DEFAULT } from './seed.js';
import { h } from './ui.js';
import { icon } from './icons.js';
import { trainView } from './views/train.js';
import { historyView } from './views/history.js';
import { libraryView } from './views/library.js';
import { settingsView } from './views/settings.js';
import { loadActive, getActive } from './active.js';
import { workoutView } from './views/workout.js';
import { initRest } from './rest.js';
import { migrate } from './migrate.js';

const TABS = [['train', 'Train', trainView], ['history', 'History', historyView], ['library', 'Library', libraryView], ['settings', 'Settings', settingsView]];

// Each tab keeps its own navigation stack, so switching tabs never loses your place.
const stacks = Object.fromEntries(TABS.map(([id, , view]) => [id, [{ view, scroll: 0 }]]));
const state = { tab: 'train' };
const cur = () => stacks[state.tab];
const scroller = () => document.getElementById('view');
const rememberScroll = () => { cur().at(-1).scroll = scroller().scrollTop; };
export const nav = {
  canBack: () => cur().length > 1,
  push(view) { rememberScroll(); cur().push({ view, scroll: 0 }); render(); },
  back() { if (cur().length > 1) { cur().pop(); render(); } },
  refresh() { rememberScroll(); render(); },
  /** Go to a tab and reset it to its first screen (used when a workout ends). */
  tab(id) { stacks[id].length = 1; stacks[id][0].scroll = 0; state.tab = id; render(); },
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
  if (id === state.tab) { // tapping the current tab pops back to its first screen
    if (cur().length > 1) { cur().length = 1; cur()[0].scroll = 0; render(); }
    return;
  }
  rememberScroll();
  state.tab = id;
  render();
}

let renderToken = 0;
async function render() {
  const token = ++renderToken;
  const entry = cur().at(-1);
  const el = await entry.view({ nav });
  if (token !== renderToken) return; // a newer navigation superseded this one
  const view = scroller();
  view.replaceChildren(el);
  view.scrollTop = entry.scroll;
  const tabs = document.getElementById('tabs');
  tabs.replaceChildren(...TABS.map(([id, label]) => h('button', { 'aria-current': String(id === state.tab), onclick: () => selectTab(id), html: `${icon(id)}<span>${label}</span>` })));
}

async function boot() {
  await seed();
  await migrate();
  await loadActive();
  if (getActive()) stacks.train.push({ view: workoutView, scroll: 0 }); // reopen the running workout
  render();
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
