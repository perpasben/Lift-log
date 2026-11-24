import { h } from '../ui.js';
import { muscleLoad, trainingTip, TIP_GROUPS, weeklyCounts, progressInsight, heat } from '../logic/stats.js';

const GROUP = { chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const date = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function countUp(el, to) {
  if (reduced()) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / 700); el.textContent = Math.round(to * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function slide(label, sub, text, visual) {
  const el = h('div', { class: 'slide' }, h('div', { class: 'ins-h' }, h('b', {}, label), h('span', {}, sub)), text, visual);
  return el;
}

/* 1. balance of the last two weeks */
function balanceSlide(counts, nextId) {
  const groups = Object.entries(TIP_GROUPS).map(([k, keys]) => [k, keys.reduce((n, m) => n + (counts[m] || 0), 0)]);
  const total = groups.reduce((n, g) => n + g[1], 0);
  const max = Math.max(10, ...groups.map((g) => g[1]));
  const sentence = trainingTip(counts, nextId) || (total < 8 ? 'Not enough recent training to compare yet.' : 'Nicely balanced. Every muscle group got work.');
  return slide('Balance', 'last 2 weeks', h('p', { class: 'ins-t' }, sentence),
    h('div', { class: 'bars' }, ...groups.map(([k, n], i) => h('div', { class: 'bar', style: `--w:${n ? Math.max(5, (n / max) * 100) : 0}%;--i:${i}` },
      h('span', {}, GROUP[k]), h('div', { class: 'bar-t' }, h('i', { style: `background:${heat(n)}` })), h('b', { class: 'num' }, String(n))))));
}

/* 2. consistency over six weeks */
function consistencySlide(sessions) {
  const w = weeklyCounts(sessions, Date.now(), 6);
  const now = w.at(-1), avg = w.reduce((a, b) => a + b, 0) / w.length;
  const max = Math.max(4, ...w), AREA = 60, goal = 4;
  const big = h('span', { class: 'big num' }, reduced() ? String(now) : '0');
  const el = slide('Consistency', 'last 6 weeks',
    h('p', { class: 'ins-t' }, big, `workout${now === 1 ? '' : 's'} in the last 7 days. You average ${fmtNum(Math.round(avg * 10) / 10)} a week.`),
    h('div', { class: 'wk', style: `--g:${(goal / max) * AREA}px` },
      h('div', { class: 'goal' }, h('span', {}, `goal ${goal}`)),
      ...w.map((n, i) => h('div', { class: `col ${i === w.length - 1 ? 'now' : ''}` },
        h('b', { class: 'num' }, String(n)), h('i', { style: `--h:${(n / max) * AREA}px;--i:${i}` }), h('span', {}, i === w.length - 1 ? 'Now' : `${w.length - 1 - i}w`)))));
  el._in = () => countUp(big, now);
  if (!reduced()) el._out = () => { big.textContent = '0'; };
  return el;
}

/* 3. progress on one lift */
function sparkline(series) {
  const W = 300, H = 52, P = 6;
  const vals = series.map((p) => p.v);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i) => P + (series.length === 1 ? (W - 2 * P) / 2 : (i / (series.length - 1)) * (W - 2 * P));
  const y = (v) => (hi === lo ? H / 2 : H - P - ((v - lo) / span) * (H - 2 * P));
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  const last = series.length - 1;
  return h('div', { class: 'spark', html: `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" pathLength="1" class="spark-l" fill="none" stroke="#ff6b1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${series.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === last ? 3.6 : 2.2}" class="spark-d" style="--i:${i}" fill="${i === last ? '#ff6b1f' : '#7a4a2c'}"/>`).join('')}</svg>` });
}

function progressSlide(ins, exercises, gymName) {
  if (!ins) return slide('Progress', 'last 4 months', h('p', { class: 'ins-t' }, 'Progress notes show up once you have logged the same lift in four or more workouts.'), null);
  const name = exercises[ins.exerciseId]?.name || 'This lift';
  const where = gymName ? ` at ${gymName}` : '';
  let text;
  if (ins.kind === 'stall') {
    const top = ins.repsMode ? `${ins.r || ins.w} reps` : `${fmtNum(ins.w)} kg × ${ins.r}`;
    text = `${name}${where} has stayed at ${top} for ${ins.k} workouts. ${ins.repsMode ? 'Time to add weight or a rep?' : `Time to add ${fmtNum(ins.increment)} kg?`}`;
  } else {
    text = ins.repsMode ? `${name}${where} went from ${ins.from} to ${ins.to} reps since ${date(ins.since)}.` : `${name}${where} went from ${fmtNum(ins.from)} to ${fmtNum(ins.to)} kg since ${date(ins.since)}.`;
  }
  return slide('Progress', ins.kind === 'stall' ? 'plateau' : 'gain', h('p', { class: 'ins-t' }, text), sparkline(ins.series));
}

/** Swipeable insights built only from the user's own workouts. */
export function insightsCarousel({ sessions, exercises, gyms, nextId }) {
  const counts = muscleLoad(sessions, exercises, { days: 14 }).counts;
  const ins = progressInsight(sessions, exercises, gyms);
  const gymName = ins ? gyms.find((g) => g.id === ins.gymId)?.name : '';
  const slides = [balanceSlide(counts, nextId), consistencySlide(sessions), progressSlide(ins, exercises, gyms.length > 1 ? gymName : '')];
  const track = h('div', { class: 'car-track' }, ...slides);
  const dots = slides.map((_, i) => h('button', { class: 'car-dot', 'aria-label': `Insight ${i + 1} of ${slides.length}`, onclick: () => track.scrollTo({ left: i * track.clientWidth, behavior: reduced() ? 'auto' : 'smooth' }) }));
  let cur = -1;
  const show = (i) => {
    if (i === cur) return;
    cur = i;
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
    slides.forEach((s, j) => { if (j === i) { s.classList.add('live'); s._in?.(); } else if (s.classList.contains('live')) { s.classList.remove('live'); s._out?.(); } });
  };
  track.addEventListener('scroll', () => show(Math.round(track.scrollLeft / (track.clientWidth || 1))), { passive: true });
  const root = h('div', { class: 'car', role: 'region', 'aria-label': 'Insights from your workouts' }, track, h('div', { class: 'car-dots' }, ...dots));
  setTimeout(() => show(0), 90); // after the first paint so the entrance animation plays
  return root;
}
