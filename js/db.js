// Tiny IndexedDB wrapper: one object store per collection, keyPath "id".
const NAME = 'liftlog';
const VERSION = 1;
export const STORES = ['gyms', 'exercises', 'slots', 'routines', 'assignments', 'sessions', 'pending', 'kv'];

let _db;
export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(NAME, VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}

const wrap = (rq) => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });

export async function all(store) {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, id) {
  const db = await open();
  return wrap(db.transaction(store).objectStore(store).get(id));
}
export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return new Promise((res, rej) => { tx.oncomplete = () => res(value); tx.onerror = () => rej(tx.error); });
}
export async function putMany(store, values) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  values.forEach((v) => os.put(v));
  return new Promise((res, rej) => { tx.oncomplete = () => res(values.length); tx.onerror = () => rej(tx.error); });
}
export async function del(store, id) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export async function clear(store) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

// key/value helpers on the "kv" store
export const kvGet = async (k, d) => (await get('kv', k))?.v ?? d;
export const kvSet = (k, v) => put('kv', { id: k, v });

export async function exportAll(version) {
  const data = {};
  for (const s of STORES) data[s] = await all(s);
  return { app: 'liftlog', schema: 1, version, exportedAt: new Date().toISOString(), data };
}
export async function importAll(obj) {
  if (!obj || obj.app !== 'liftlog' || !obj.data) throw new Error('Not a LiftLog backup file');
  for (const s of STORES) {
    await clear(s);
    if (obj.data[s]?.length) await putMany(s, obj.data[s]);
  }
}
