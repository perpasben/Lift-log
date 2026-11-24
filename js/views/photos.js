import { h, topbar, toast } from '../ui.js';
import { PHOTO_SLOTS, photos, setPhoto, pickPhoto } from '../photos.js';

export async function photosView({ nav }) {
  const out = h('div', {}, ...topbar('Photos', nav));
  out.append(h('p', { class: 'sub' }, 'Pictures for the home card. A day without its own picture uses the default one. They stay on this device.'));
  const card = h('div', { class: 'card' });
  const paint = () => {
    const p = photos();
    card.replaceChildren(...PHOTO_SLOTS.map(([key, label]) => {
      const thumb = h('div', { class: 'ph-thumb', style: p[key] ? `background-image:url(${p[key]})` : '' });
      return h('div', { class: 'row' }, thumb, h('div', { class: 'grow' }, h('div', { class: 't' }, label), h('div', { class: 'd' }, p[key] ? 'Set' : key === 'def' ? 'Not set' : 'Uses the default')),
        h('button', { class: 'chip ac1', onclick: async () => { const url = await pickPhoto(1000); if (!url) return; await setPhoto(key, url); paint(); toast('Photo saved'); } }, p[key] ? 'Change' : 'Choose'),
        p[key] ? h('button', { class: 'chip', onclick: async () => { await setPhoto(key, null); paint(); } }, 'Remove') : null);
    }));
  };
  paint();
  out.append(card);
  return out;
}
