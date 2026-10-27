/** Tiny DOM helpers: element builder, modal dialog, toast, file download. */

/** el('button', { class: 'btn', onclick }, 'Save') */
export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'value') value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected') node[k] = !!v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : String(kid));
  }
  if (value !== undefined) node.value = value;
  return node;
}

export function options(list, selected) {
  return list.map(([value, label]) => el('option', { value, selected: value === selected }, label));
}

const dlg = () => document.getElementById('dlg');

/** Open the shared modal dialog. `actions` are buttons for the footer. */
export function openDialog({ title, body, actions = [], wide = false, onClose = null }) {
  const d = dlg();
  const parts = [
    el('div', { class: 'dlg-head' },
      el('h2', { id: 'dlg-title' }, title),
      el('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
    el('div', { class: 'dlg-body' }, body),
  ];
  if (actions.length) parts.push(el('div', { class: 'dlg-foot' }, actions));
  d.replaceChildren(...parts);
  d.style.width = wide ? 'min(980px, calc(100vw - 2rem))' : '';
  d.onclose = onClose;
  d.returnValue = '';
  d.showModal();
  return d;
}

export function closeDialog() {
  const d = dlg();
  if (d.open) d.close();
}

let toastTimer = 0;
export function toast(message, ms = 3200) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Stable pastel hue per subject code, so a subject keeps its colour everywhere. */
export function hueFor(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h * 137) % 360;
}

export function slug(s) {
  return String(s || 'timetable').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'timetable';
}
