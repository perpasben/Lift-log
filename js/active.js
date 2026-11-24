// The in-progress workout lives in memory and is persisted to IndexedDB on every change,
// so it survives the app being killed or the phone locking.
import * as db from './db.js';

let cur = null;
export const getActive = () => cur;
export async function loadActive() { cur = await db.kvGet('active', null); return cur; }
export const saveActive = () => db.kvSet('active', cur);
export async function setActive(w) { cur = w; await saveActive(); }
export async function clearActive() { cur = null; await db.kvSet('active', null); }
