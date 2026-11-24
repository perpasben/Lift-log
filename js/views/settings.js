import * as db from '../db.js';
import { VERSION, BUILD } from '../version.js';
import { h, topbar, toast, confirmSheet, sheet } from '../ui.js';
import { migrate } from '../migrate.js';
import { parseCsv, csvToSessions, slug } from '../logic/csv.js';

const pickFile = (accept) => new Promise((res) => {
  const i = h('input', { type: 'file', accept, style: 'display:none' });
  i.addEventListener('change', () => res(i.files[0] || null));
  document.body.append(i); i.click(); setTimeout(() => i.remove(), 60000);
});

async function swInfo() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.active) return null;
  return new Promise((res) => {
    const on = (e) => { if (e.data?.type === 'VERSION') { navigator.serviceWorker.removeEventListener('message', on); res(e.data); } };
    navigator.serviceWorker.addEventListener('message', on);
    reg.active.postMessage('GET_VERSION');
    setTimeout(() => res(null), 1200);
  });
}

async function checkUpdate(statusEl) {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return toast('Updates work once installed from the web');
  statusEl.textContent = 'Checking…';
  await reg.update().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  if (reg.waiting) {
    statusEl.textContent = 'Update ready';
    sheet((close) => [h('h3', {}, 'Update ready'), h('p', { class: 'muted' }, 'A newer version has been downloaded.'),
      h('button', { class: 'btn pri block', onclick: () => { navigator.serviceWorker.addEventListener('controllerchange', () => location.reload()); reg.waiting.postMessage('SKIP_WAITING'); } }, 'Reload now')]);
  } else statusEl.textContent = 'You are on the latest version';
}

async function exportData() {
  const data = await db.exportAll(`${VERSION}+${BUILD}`);
  const name = `liftlog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(file), download: name });
  document.body.append(a); a.click(); a.remove();
}

async function importBackup(nav) {
  const f = await pickFile('.json,application/json');
  if (!f) return;
  let obj;
  try { obj = JSON.parse(await f.text()); } catch { return toast('That file is not valid JSON'); }
  if (!(await confirmSheet({ title: 'Replace all data?', body: 'Everything currently on this device is replaced by the backup.', ok: 'Replace', danger: true }))) return;
  try { await db.importAll(obj); await migrate(); toast('Backup restored'); nav.refresh(); } catch (e) { toast(e.message); }
}

async function importCsv(nav) {
  const f = await pickFile('.csv,text/csv');
  if (!f) return;
  const gyms = await db.all('gyms');
  const gymId = await new Promise((res) => sheet((close) => [h('h3', {}, 'Which gym is this history from?'),
    h('div', { class: 'card', style: 'margin-top:12px' }, ...gyms.map((g) => h('button', { class: 'row', onclick: () => { close(); res(g.id); } }, h('div', { class: 't' }, g.name))))]));
  const { sessions, exerciseNames } = csvToSessions(parseCsv(await f.text()), gymId);
  const catalog = await db.all('exercises');
  const ids = new Set(catalog.map((e) => e.id));
  const fresh = [];
  for (const n of exerciseNames) if (!ids.has(slug(n))) fresh.push({ id: slug(n), name: n, aliases: [], muscle: '', equipment: [], type: 'wr', builtin: false });
  if (fresh.length) await db.putMany('exercises', fresh);
  for (const s of sessions) { s.entries.forEach((e) => { e.exerciseId = slug(e.exerciseName); delete e.exerciseName; }); }
  await db.putMany('sessions', sessions);
  toast(`Imported ${sessions.length} workouts${fresh.length ? `, ${fresh.length} new exercises` : ''}`, 3500);
  nav.refresh();
}

function diag() {
  const p = h('div', { style: 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom);padding-top:env(safe-area-inset-top)' });
  document.body.append(p);
  const cs = getComputedStyle(p);
  const r = `window ${innerWidth}\u00d7${innerHeight} \u00b7 screen ${screen.width}\u00d7${screen.height} \u00b7 safe top ${cs.paddingTop} bottom ${cs.paddingBottom} \u00b7 standalone ${navigator.standalone ?? matchMedia('(display-mode: standalone)').matches}`;
  p.remove();
  return r;
}

export async function settingsView({ nav }) {
  const settings = await db.kvGet('settings', { restSec: 90 });
  const info = await swInfo();
  const status = h('span', { class: 'muted' }, '');
  const mismatch = info && (info.version !== VERSION || info.build !== BUILD);
  const rest = h('span', { class: 'v mono' }, `${settings.restSec} s`);
  const bump = (d) => async () => { settings.restSec = Math.min(300, Math.max(15, settings.restSec + d)); await db.kvSet('settings', settings); rest.textContent = `${settings.restSec} s`; };
  const row = (t, d, fn) => h('button', { class: 'row', onclick: fn }, h('div', { class: 'grow' }, h('div', { class: 't' }, t), d ? h('div', { class: 'd' }, d) : null));

  return h('div', {}, ...topbar('Settings', nav),
    h('h2', {}, 'Training'),
    h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'grow t' }, 'Default rest'),
      h('div', { class: 'step' }, h('button', { 'aria-label': 'Less', onclick: bump(-15) }, '−'), rest, h('button', { 'aria-label': 'More', onclick: bump(15) }, '+')))),
    h('h2', {}, 'Data'),
    h('div', { class: 'card' },
      row('Export backup', 'All data as one JSON file', exportData),
      row('Import backup', 'Replaces everything on this device', () => importBackup(nav)),
      row('Import StrengthLog CSV', 'Adds your past workouts', () => importCsv(nav))),
    h('h2', {}, 'About'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('div', { class: 'grow t' }, 'Version'), h('span', { class: 'mono muted' }, `${VERSION} · ${BUILD === '__BUILD__' ? 'dev' : BUILD}`)),
      info ? h('div', { class: 'row' }, h('div', { class: 'grow t' }, 'Service worker'), h('span', { class: `mono ${mismatch ? 'ac' : 'muted'}` }, `${info.version} · ${info.build}`)) : null,
      row('Check for updates', null, () => checkUpdate(status)),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Display'), h('div', { class: 'd mono', id: 'diag' }, diag()))),
      h('div', { class: 'row' }, status)));
}
