/**
 * App state shared by every screen, and saving it in the browser.
 * The college (including its last timetable) is one JSON object in localStorage.
 */
import { normalize } from './model.js';

const KEY = 'clashfree.v1';

export const app = {
  data: null,
  ui: { tab: 'setup', view: 'section', viewId: '', subjectFilter: '', selected: null, printAll: false, budget: 'quick' },
  /** Replaced by app.js: re-render the current screen, or only the header and steps. */
  render: () => {},
  renderChrome: () => {},
};

export function loadSaved() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function save() {
  const state = document.getElementById('save-state');
  try {
    localStorage.setItem(KEY, JSON.stringify(app.data));
    if (state) state.textContent = 'Saved in this browser';
  } catch {
    if (state) state.textContent = 'Not saved: browser storage is blocked. Use Export.';
  }
}

/** Call after any edit. `rerender` redraws the current screen (needed when rows are added or removed). */
export function changed(rerender = false) {
  save();
  if (rerender) app.render();
  else app.renderChrome();
}

export function setData(data) {
  app.data = normalize(data);
  app.ui.viewId = '';
  app.ui.subjectFilter = '';
  app.ui.selected = null;
  save();
}

export function placements() {
  return (app.data.timetable && app.data.timetable.placements) || [];
}

export function lockedSet() {
  return new Set((app.data.timetable && app.data.timetable.locked) || []);
}
