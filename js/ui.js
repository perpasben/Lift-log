import { icon } from './icons.js';

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

const layer = () => document.getElementById('layer');

export function toast(msg, ms = 2400) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  layer().append(t);
  setTimeout(() => t.remove(), ms);
}

export function sheet(build) {
  const scrim = h('div', { class: 'scrim' });
  const box = h('div', { class: 'sheet', role: 'dialog' }, h('div', { class: 'grab' }));
  const close = () => { scrim.remove(); box.remove(); };
  scrim.addEventListener('click', close);
  box.append(...[].concat(build(close)));
  layer().append(scrim, box);
  return close;
}

export function confirmSheet({ title, body, ok = 'Confirm', danger = false }) {
  return new Promise((res) => {
    let settled = false;
    const done = (v, close) => { if (!settled) { settled = true; res(v); } close?.(); };
    sheet((close) => [
      h('h3', {}, title), h('p', { class: 'muted' }, body),
      h('div', { style: 'display:grid;gap:10px;margin-top:16px' },
        h('button', { class: `btn block ${danger ? 'danger' : 'pri'}`, onclick: () => done(true, close) }, ok),
        h('button', { class: 'btn block', onclick: () => done(false, close) }, 'Cancel')),
    ]);
  });
}

export const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtDur = (a, b) => { const m = Math.round((b - a) / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };
export const kg = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)} kg`;

export function topbar(title, nav) {
  const back = nav.canBack() ? h('button', { class: 'back', 'aria-label': 'Back', html: icon('back'), onclick: () => nav.back() }) : null;
  return [h('div', { class: 'top' }, back), h('h1', {}, title)];
}
