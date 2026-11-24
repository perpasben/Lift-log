// A second accent so the app is not all orange: orange stays for actions (Start, checks, tabs);
// this one colours information (week ring, insights, muscle map, selected chips).
import { setHeatRamp } from './logic/stats.js';

export const PRESETS = {
  teal: { hex: '#3fc0b3', mid: [63, 192, 179], top: [181, 238, 231] },
  sand: { hex: '#e3cfa6', mid: [227, 207, 166], top: [248, 239, 218] },
  ice: { hex: '#8cc4e8', mid: [140, 196, 232], top: [214, 237, 251] },
  orange: { hex: '#ff6b1f', mid: [255, 107, 31], top: [255, 192, 138] },
};
export const DEFAULT_ACCENT = 'teal';

export function accent2() {
  let key = DEFAULT_ACCENT;
  try { key = globalThis.localStorage?.getItem('accent2') || DEFAULT_ACCENT; } catch { /* storage unavailable */ }
  return PRESETS[key] || PRESETS[DEFAULT_ACCENT];
}

export function applyAccent2() {
  const a = accent2();
  const root = document.documentElement.style;
  root.setProperty('--ac2', a.hex);
  root.setProperty('--ac2-d', `rgba(${a.mid.join(',')}, .16)`);
  root.setProperty('--ac2-hi', `rgb(${a.top.join(',')})`);
  setHeatRamp(a.mid, a.top);
}
