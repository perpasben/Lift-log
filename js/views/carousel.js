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

// Compact slide: label + sentence on the left, a tiny animated graphic on the right.
function slide(label, parts, visual) {
  const el = h('div', { class: 'slide' }, h('p', { class: 'ins-t' }, ...parts), visual ? h('div', { class: 'mini' }, visual) : null);
  el._label = label;
  return el;
}

const miniBars = (vals, max, colors, h0 = 30) => h('div', { class: 'mb' }, ...vals.map((v, i) => h('i', { style: `--h:${Math.max(v ? 3 : 1, (v / max) * h0)}px;--i:${i};background:${colors[i]}` })));

/* 1. balance of the last two weeks */
function balanceSlide(counts, nextId) {
  const groups = Object.entries(TIP_GROUPS).map(([k, keys]) => [k, keys.reduce((n, m) => n + (counts[m] || 0), 0)]);
  const total = groups.reduce((n, g) => n + g[1], 0);
  const sentence = trainingTip(counts, nextId) || (total < 8 ? 'Not enough recent training to compare yet.' : 'Nicely balanced. Every muscle group got work.');
  const el = slide('Balance', [sentence], miniBars(groups.map((g) => g[1]), Math.max(10, ...groups.map((g) => g[1])), groups.map((g) => heat(g[1]))));
  el.title = groups.map(([k, n]) => `${GROUP[k]} ${n}`).join(', ');
  return el;
}

/* 2. consistency over six weeks */
function consistencySlide(sessions) {
  const w = weeklyCounts(sessions, Date.now(), 6);
  const now = w.at(-1), avg = Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10;
  const big = h('b', { class: 'num cnt' }, reduced() ? String(now) : '0');
  const el = slide('Consistency', [big, ` workout${now === 1 ? '' : 's'} in the last 7 days, ${fmtNum(avg)} a week on average.`],
    miniBars(w, Math.max(4, ...w), w.map((_, i) => (i === w.length - 1 ? '#ff6b1f' : '#4a453e'))));
  el._in = () => countUp(big, now);
  if (!reduced()) el._out = () => { big.textContent = '0'; };
  return el;
}

/* 3. progress on one lift */
function sparkline(series) {
  const W = 56, H = 30, P = 4;
  const vals = series.map((p) => p.v);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = (i) => P + (series.length === 1 ? (W - 2 * P) / 2 : (i / (series.length - 1)) * (W - 2 * P));
  const y = (v) => (hi === lo ? H / 2 : H - P - ((v - lo) / span) * (H - 2 * P));
  const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  const last = series.length - 1;
  return h('div', { class: 'spark', html: `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" pathLength="1" class="spark-l" fill="none" stroke="#ff6b1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(last).toFixed(1)}" cy="${y(vals[last]).toFixed(1)}" r="3" class="spark-d" fill="#ff6b1f"/></svg>` });
}

function progressSlide(ins, exercises, gymName) {
  if (!ins) return slide('Progress', ['Notes appear once you log the same lift in four or more workouts.'], null);
  const name = exercises[ins.exerciseId]?.name || 'This lift';
  const where = gymName ? ` at ${gymName}` : '';
  let text;
  if (ins.kind === 'stall') {
    const top = ins.repsMode ? `${ins.r || ins.w} reps` : `${fmtNum(ins.w)} kg \u00d7 ${ins.r}`;
    text = `${name}${where} has stayed at ${top} for ${ins.k} workouts. ${ins.repsMode ? 'Add weight or a rep?' : `Try +${fmtNum(ins.increment)} kg?`}`;
  } else {
    text = ins.repsMode ? `${name}${where}: ${ins.from} to ${ins.to} reps since ${date(ins.since)}.` : `${name}${where}: ${fmtNum(ins.from)} to ${fmtNum(ins.to)} kg since ${date(ins.since)}.`;
  }
  return slide('Progress', [text], sparkline(ins.series));
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
    lab.textContent = slides[i]._label;
    slides.forEach((s, j) => { if (j === i) { s.classList.add('live'); s._in?.(); } else if (s.classList.contains('live')) { s.classList.remove('live'); s._out?.(); } });
  };
  track.addEventListener('scroll', () => show(Math.round(track.scrollLeft / (track.clientWidth || 1))), { passive: true });
  const lab = h('span', { class: 'car-lab' }, slides[0]._label);
  const root = h('div', { class: 'car', role: 'region', 'aria-label': 'Insights from your workouts' }, track, h('div', { class: 'car-foot' }, lab, h('div', { class: 'car-dots' }, ...dots), h('span')));
  setTimeout(() => show(0), 90); // after the first paint so the entrance animation plays
  return root;
}
