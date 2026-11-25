// Personal photos for the home card. Stored in IndexedDB as small JPEG data URLs,
// so they are part of the JSON backup and never leave the device.
import * as db from './db.js';

export const PHOTO_SLOTS = [['def', 'Default'], ['push', 'Push day'], ['pull', 'Pull day'], ['leg', 'Leg day']];
let cache = null;

export async function loadPhotos() { cache = await db.kvGet('photos', {}); return cache; }
export const photos = () => cache || {};
export async function setPhoto(key, dataUrl) {
  const all = { ...(await db.kvGet('photos', {})) };
  if (dataUrl) all[key] = dataUrl; else delete all[key];
  await db.kvSet('photos', all);
  cache = all;
}
/** photo for a routine card: its own, else the default one */
export const heroPhoto = (routineId) => photos()[routineId] || photos().def || null;

/** Opens the photo library and resolves to a downscaled JPEG data URL (or null if cancelled). */
export function pickPhoto(maxSide = 1000) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
    document.body.append(input);
    input.click();
  });
}

/** the exercise's own photo, or null (no photo: the card looks as it always did) */
export const exercisePhoto = (ex) => ex?.photo || null;
