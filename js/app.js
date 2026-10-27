/**
 * Entry point: loads the saved college (or a sample), draws the step bar and the current screen,
 * and handles import/export. Screens live in editors.js, generate.js, timetable.js and daily.js.
 *
 * URL options (handy for demos): ?sample=demo|small|large|impossible  &tab=<step>  &generate=1
 *                                &view=section|teacher|room  &id=<entity id>
 */
import { el, openDialog, closeDialog, toast, download, slug } from './dom.js';
import { app, loadSaved, save, setData } from './state.js';
import { emptyData, normalize } from './model.js';
import { precheck } from './solver.js';
import { validate } from './validate.js';
import { renderSetup, renderRooms, renderTeachers, renderSections, renderSubjects } from './editors.js';
import { renderGenerate, generate } from './generate.js';
import { renderTimetables } from './timetable.js';
import { renderDaily } from './daily.js';

const STEPS = [
  { id: 'setup', label: 'Week', render: renderSetup, done: (d) => d.college.days.length && d.college.periods.length },
  { id: 'rooms', label: 'Rooms', render: renderRooms, count: (d) => d.rooms.length },
  { id: 'teachers', label: 'Teachers', render: renderTeachers, count: (d) => d.teachers.length },
  { id: 'sections', label: 'Classes', render: renderSections, count: (d) => d.sections.length },
  { id: 'subjects', label: 'Subjects', render: renderSubjects, count: (d) => d.courses.length },
  { id: 'generate', label: 'Generate', render: renderGenerate, done: (d) => !!(d.timetable && d.timetable.placements.length) },
  { id: 'timetables', label: 'Timetables', render: renderTimetables },
  { id: 'daily', label: 'Daily tools', render: renderDaily },
];

const SAMPLES = [
  { id: 'demo', title: 'Engineering college (recommended)', text: '6 classes in 4 departments, 18 teachers, shared labs and seminar hall, split lab batches.', recommended: true },
  { id: 'small', title: 'Small college', text: '2 classes, 4 teachers, 3 rooms. Learn the app in two minutes.' },
  { id: 'large', title: 'Large institute', text: '20 classes, 52 teachers, 42 rooms, 440 lessons. Shows it scales.' },
  { id: 'impossible', title: 'Data with mistakes', text: 'Overloaded teacher, too-big class, 5-period lab: see the plain-language errors.' },
];

function renderChrome() {
  const d = app.data;
  document.getElementById('college-name').textContent = d.college.name;
  document.title = `${d.college.name} · ClashFree Timetables`;
  const nav = document.getElementById('steps');
  nav.replaceChildren(...STEPS.map((s, i) => {
    const count = s.count ? s.count(d) : null;
    const done = s.done ? s.done(d) : count > 0;
    return el('button', {
      type: 'button', class: `step ${done ? 'done' : ''}`, 'aria-current': app.ui.tab === s.id ? 'page' : null,
      onclick: () => setTab(s.id),
    },
    el('span', { class: 'num' }, done && app.ui.tab !== s.id ? '✓' : String(i + 1)),
    s.label,
    count != null ? el('span', { class: 'count' }, String(count)) : null);
  }));
}

function render() {
  renderChrome();
  const step = STEPS.find((s) => s.id === app.ui.tab) || STEPS[0];
  const main = document.getElementById('main');
  const scroll = window.scrollY;
  main.replaceChildren(step.render(), nextBar(step));
  window.scrollTo({ top: scroll });
}

/** "Back / Next" at the bottom of data screens, so a first-time admin just follows the steps. */
function nextBar(step) {
  const i = STEPS.indexOf(step);
  if (i >= 5) return el('span');
  const next = STEPS[i + 1];
  return el('div', { class: 'row no-print', style: { marginTop: '1.25rem' } },
    i > 0 ? el('button', { type: 'button', class: 'btn', onclick: () => setTab(STEPS[i - 1].id) }, `← ${STEPS[i - 1].label}`) : null,
    el('span', { class: 'spacer' }),
    el('button', { type: 'button', class: 'btn primary', onclick: () => setTab(next.id) }, `Next: ${next.label} →`));
}

function setTab(id) {
  app.ui.tab = id;
  app.ui.selected = null;
  render();
  window.scrollTo({ top: 0 });
  document.getElementById('main').focus({ preventScroll: true });
}

async function fetchSample(id) {
  const res = await fetch(`samples/${id}.json`);
  if (!res.ok) throw new Error(`Could not load sample ${id}`);
  return normalize(await res.json());
}

async function loadSample(id, { tab = 'subjects' } = {}) {
  try {
    setData(await fetchSample(id));
    closeDialog();
    app.ui.tab = tab;
    render();
    toast(`Loaded "${app.data.college.name}". Check the data, then Generate.`);
  } catch (e) {
    toast(e.message);
  }
}

function samplesDialog(first = false) {
  openDialog({
    title: first ? 'Welcome to ClashFree' : 'Load a sample college',
    wide: true,
    body: el('div', {},
      el('p', {}, first
        ? 'Build a clash-free timetable for any college in five steps: week, rooms, teachers, classes, subjects. Then press Generate.'
        : 'This replaces what is on screen. Export first if you want to keep it.'),
      el('div', { class: 'choice-grid' },
        SAMPLES.map((s) => el('button', { type: 'button', class: `choice ${s.recommended ? 'recommended' : ''}`, autofocus: !!s.recommended, onclick: () => loadSample(s.id) },
          el('strong', {}, s.title), el('span', {}, s.text))),
        el('button', {
          type: 'button', class: 'choice',
          onclick: () => { setData(emptyData()); closeDialog(); app.ui.tab = 'setup'; render(); },
        }, el('strong', {}, 'Start from scratch'), el('span', {}, 'An empty college with a default 5-day, 8-period week.')))),
  });
}

function exportJson() {
  download(`${slug(app.data.college.name)}.json`, JSON.stringify(app.data, null, 2), 'application/json');
  toast('Saved a copy of everything (data and timetable) as a file.');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = normalize(JSON.parse(reader.result));
      if (!data.college || !Array.isArray(data.courses)) throw new Error('bad file');
      setData(data);
      app.ui.tab = data.timetable ? 'timetables' : 'subjects';
      render();
      toast(`Imported "${data.college.name}".`);
    } catch {
      toast('That file is not a ClashFree export (JSON).');
    }
  };
  reader.readAsText(file);
}

async function start() {
  app.render = render;
  app.renderChrome = renderChrome;
  document.getElementById('btn-samples').onclick = () => samplesDialog(false);
  document.getElementById('btn-export').onclick = exportJson;
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').onclick = () => fileInput.click();
  fileInput.onchange = () => { if (fileInput.files[0]) importJson(fileInput.files[0]); fileInput.value = ''; };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.ui.selected && !document.getElementById('dlg').open) {
      app.ui.selected = null;
      render();
    }
  });

  const q = new URLSearchParams(location.search);
  const sample = q.get('sample');
  const saved = loadSaved();
  if (sample) {
    try { app.data = await fetchSample(sample); } catch { app.data = saved || emptyData(); }
    save();
  } else {
    app.data = saved || emptyData();
  }
  const tab = q.get('tab');
  if (tab && STEPS.some((s) => s.id === tab)) app.ui.tab = tab;
  else if (saved && !sample) app.ui.tab = saved.timetable ? 'timetables' : 'subjects';
  if (q.get('view')) app.ui.view = q.get('view');
  if (q.get('id')) app.ui.viewId = q.get('id');
  if (q.get('budget') === 'thorough') app.ui.budget = 'thorough';
  if (saved || sample) document.getElementById('save-state').textContent = 'Saved in this browser';
  render();

  if (q.get('generate') === '1') {
    const target = app.ui.tab;
    app.ui.tab = 'generate';
    await generate();
    if (target !== 'generate') { app.ui.tab = target; render(); }
  } else if (!saved && !sample) {
    samplesDialog(true);
  }
  // Expose for debugging in the console.
  window.clashfree = { app, validate, precheck };
}

start();
