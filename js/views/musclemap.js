import * as db from '../db.js';
import { h } from '../ui.js';
import { muscleLoad, heat, MUSCLE_LABEL } from '../logic/stats.js';

// Original body artwork, drawn as flat shapes. Right-hand paths are mirrored for the left side.
const BASE = {
  head: '<circle cx="100" cy="25" r="15.5"/>',
  neck: '<path d="M92 38h16v17H92z"/>',
  torso: '<path d="M64 62Q100 52 136 62Q141 100 133 140Q129 176 127 206Q125 224 119 232H81Q75 224 73 206Q71 176 67 140Q59 100 64 62Z"/>',
};
const SIDE_BASE = [ // right side only, mirrored
  '<path d="M139 63Q158 65 161 90Q165 124 161 142Q167 168 169 192Q173 203 168 211Q162 213 158 205Q154 172 148 148Q141 122 139 100Z"/>',
  '<path d="M102 230H132Q137 268 129 304Q127 345 123 392L130 413H102L106 392Q102 345 103 304Z"/>',
];
// Muscles: [key, right-side path]. "center" paths are not mirrored.
const FRONT = [
  ['shoulders', 'M123 65Q143 60 153 76Q156 91 149 99Q133 93 123 85Z'],
  ['chest', 'M102 71Q119 65 126 79Q130 92 126 105Q113 113 102 106Z'],
  ['biceps', 'M147 101Q158 103 160 125L156 140Q148 133 144 121Q143 108 147 101Z'],
  ['abs', 'M103 113h13q2 0 2 2v13q0 2-2 2h-13zM103 132h13q2 0 2 2v13q0 2-2 2h-13zM103 151h13q2 0 2 2v13q0 2-2 2h-13zM121 113Q129 132 126 172L120 170Q123 142 119 115Z'],
  ['quads', 'M103 238Q126 233 131 252Q135 282 127 306Q118 313 108 305Q102 282 103 238Z'],
  ['calves', 'M108 318Q122 316 124 332Q124 362 118 392H108Q104 360 108 318Z'],
];
const BACK = [
  ['back', 'M102 56Q111 59 123 68Q120 82 112 92Q106 100 102 108ZM128 90Q134 108 130 142Q125 166 118 174L108 168Q111 140 116 114Q121 100 128 90ZM102 114Q108 130 106 160L102 168ZM102 176Q113 176 117 192L113 204L102 206Z'],
  ['rearDelts', 'M124 65Q143 60 153 76Q156 91 149 99Q134 93 125 84Z'],
  ['triceps', 'M147 101Q158 103 160 125L156 140Q148 133 144 121Q143 108 147 101Z'],
  ['glutes', 'M102 210Q126 204 132 222Q132 242 117 250Q104 250 102 238Z'],
  ['hamstrings', 'M103 256Q127 252 130 266Q131 292 123 316Q113 321 107 309Q102 282 103 256Z'],
  ['calves', 'M108 324Q125 320 126 338Q125 364 119 390H109Q104 358 108 324Z'],
];
const RANGES = [['7 days', { days: 7 }], ['14 days', { days: 14 }], ['Last 4 workouts', { workouts: 4 }]];
let rangeIdx = 0;

function figure(regions, counts, x0) {
  const mirror = 'transform="translate(200 0) scale(-1 1)"';
  const paths = regions.map(([key, d]) => {
    const fill = heat(counts[key] || 0);
    const a = `class="mm" data-m="${key}" fill="${fill}"`;
    return `<path ${a} d="${d}"/><path ${a} d="${d}" ${mirror}/>`;
  }).join('');
  const base = `<g fill="#1f1c1a">${Object.values(BASE).join('')}${SIDE_BASE.map((p) => `<g>${p}</g><g ${mirror}>${p}</g>`).join('')}</g>`;
  return `<g transform="translate(${x0} 0)">${base}${paths}</g>`;
}

export async function muscleMapSection() {
  const [sessions, exList, settings] = await Promise.all([db.all('sessions'), db.all('exercises'), db.kvGet('settings', {})]);
  rangeIdx = Math.min(settings.mapRange ?? rangeIdx, RANGES.length - 1);
  const exs = Object.fromEntries(exList.map((e) => [e.id, e]));
  const box = h('div');
  const paint = () => {
    const [, range] = RANGES[rangeIdx];
    const { counts, sessions: n } = muscleLoad(sessions, exs, range);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const readout = h('div', { class: 'mm-read' }, n ? `${total} sets across ${n} workout${n > 1 ? 's' : ''}. Tap a muscle.` : 'Nothing trained in this period.');
    const svg = h('div', { class: 'mm-svg', html: `<svg viewBox="0 0 410 420" role="img" aria-label="Muscle map, front and back">${figure(FRONT, counts, 0)}${figure(BACK, counts, 210)}</svg>` });
    svg.querySelectorAll('.mm').forEach((p) => p.addEventListener('click', () => { const k = p.dataset.m; readout.replaceChildren(h('b', {}, MUSCLE_LABEL[k]), ` · ${counts[k] || 0} sets`); }));
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = rows[0]?.[1] || 1;
    box.replaceChildren(
      h('div', { class: 'chips', style: 'margin:0 0 10px' }, ...RANGES.map(([l], i) => h('button', { class: `chip ${i === rangeIdx ? 'ac' : ''}`, 'aria-pressed': String(i === rangeIdx), onclick: async () => { rangeIdx = i; await db.kvSet('settings', { ...(await db.kvGet('settings', {})), mapRange: i }); paint(); } }, l))),
      h('div', { class: 'card', style: 'padding:14px 10px 8px' }, svg, h('div', { class: 'mm-lab' }, h('span', {}, 'Front'), h('span', {}, 'Back')), readout,
        h('div', { class: 'mm-leg' }, h('span', {}, '0'), h('i', {}), h('span', {}, '10+ sets'))),
      rows.length ? h('div', { class: 'card', style: 'margin-top:10px' }, ...rows.map(([k, c]) => h('div', { class: 'row', style: 'min-height:44px;padding:10px 16px' }, h('div', { class: 't', style: 'width:96px' }, MUSCLE_LABEL[k]), h('div', { class: 'mm-bar' }, h('i', { style: `width:${Math.max(6, (c / max) * 100)}%` })), h('div', { class: 'muted mono', style: 'width:52px;text-align:right' }, `${c} sets`)))) : null);
  };
  paint();
  return h('div', {}, h('h2', {}, 'Muscles trained'), box);
}
