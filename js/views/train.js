import * as db from '../db.js';
import { h, toast, topbar } from '../ui.js';
import { nextRoutine, pendingFor } from '../logic/carryover.js';

export async function trainView({ nav }) {
  const [sessions, routines, gyms, pending, settings] = await Promise.all([db.all('sessions'), db.all('routines'), db.all('gyms'), db.all('pending'), db.kvGet('settings', {})]);
  const next = nextRoutine(sessions);
  const routine = routines.find((r) => r.id === next);
  const gym = gyms.find((g) => g.id === settings.lastGymId) || gyms[0];
  const carried = pendingFor(pending, next).length;
  const extra = pendingFor(pending, 'extra').length;
  const items = routine.blocks.reduce((n, b) => n + b.items.length, 0);

  return h('div', { style: 'padding-top:18px' },
    h('div', { class: 'hero' },
      h('div', { class: 'kick' }, 'Up next'),
      h('div', { class: 'big' }, routine.name),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, `${items} exercises`),
        h('span', { class: 'chip' }, gym?.name),
        carried ? h('span', { class: 'chip ac' }, `${carried} carried over`) : null),
      h('button', { class: 'btn pri block', onclick: () => toast('Live logging arrives in phase 3') }, 'Start workout')),
    h('h2', {}, 'Other'),
    h('div', { class: 'card' },
      h('button', { class: 'row', onclick: () => toast('Extra Workout arrives in phase 4') }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Extra workout'), h('div', { class: 'd' }, extra ? `${extra} parked` : 'Nothing parked')), ),
      h('button', { class: 'row', onclick: () => toast('Mobility & abs arrive in phase 4') }, h('div', { class: 'grow' }, h('div', { class: 't' }, 'Mobility, abs, farmer’s walk')))),
    h('p', { class: 'muted', style: 'margin-top:22px;font-size:14px' }, sessions.length ? `${sessions.length} workouts logged.` : 'No workouts yet. Import your StrengthLog history in Settings.'));
}
