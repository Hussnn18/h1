/**
 * Data-entry screens: college week, rooms, teachers, classes and subjects.
 * Each list is an editable table with "Add", "Delete" and "Paste from Excel".
 */
import { el, options, openDialog, closeDialog, toast } from './dom.js';
import { app, changed } from './state.js';
import { uid, departments, roomTypes, batchCount } from './model.js';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pageHead(title, text, ...actions) {
  return el('div', { class: 'page-head' },
    el('div', {}, el('h1', {}, title), el('p', {}, text)),
    actions.length ? el('div', { class: 'row' }, actions) : null);
}

function datalist(id, values) {
  return el('datalist', { id }, values.map((v) => el('option', { value: v })));
}

/** Text/number input bound to obj[key]. */
function bound(obj, key, attrs = {}, parse = (v) => v) {
  return el('input', {
    ...attrs,
    value: obj[key] ?? '',
    onchange: (e) => {
      obj[key] = parse(e.target.value);
      changed(attrs.rerender);
    },
  });
}

const int = (min) => (v) => Math.max(min, parseInt(v, 10) || min);

function tableCard({ id, caption, head, rows, emptyText, foot }) {
  return el('div', {},
    el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-labelledby': `${id}-cap` },
      el('table', { class: 'edit' },
        el('caption', { id: `${id}-cap`, class: 'sr-only', style: { position: 'absolute', left: '-9999px' } }, caption),
        el('thead', {}, el('tr', {}, head.map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, rows.length ? rows : el('tr', { class: 'empty' }, el('td', { colspan: head.length }, emptyText))))),
    el('div', { class: 'table-foot' }, foot));
}

function delButton(label, onclick) {
  return el('button', { type: 'button', class: 'btn ghost icon danger', 'aria-label': label, title: label, onclick }, '✕');
}

/* ------------------------------------------------------------------ setup */

export function renderSetup() {
  const c = app.data.college;
  const periodRows = c.periods.map((per, i) => el('tr', {},
    el('td', { class: 'nowrap' }, `Period ${i + 1}`),
    el('td', {}, bound(per, 'start', { type: 'time', 'aria-label': `Period ${i + 1} start` })),
    el('td', {}, bound(per, 'end', { type: 'time', 'aria-label': `Period ${i + 1} end` })),
    el('td', {}, i < c.periods.length - 1
      ? el('label', { class: 'check' },
        el('input', {
          type: 'checkbox', checked: c.breaks.includes(i),
          onchange: (e) => {
            c.breaks = e.target.checked ? [...c.breaks, i].sort((a, b) => a - b) : c.breaks.filter((b) => b !== i);
            changed();
          },
        }), 'Break after')
      : el('span', { class: 'muted small' }, 'End of day')),
    el('td', {}, delButton(`Remove period ${i + 1}`, () => {
      c.periods.splice(i, 1);
      c.breaks = c.breaks.filter((b) => b < c.periods.length - 1).map((b) => (b > i ? b - 1 : b));
      changed(true);
    }))));

  const quick = { count: c.periods.length || 8, start: (c.periods[0] && c.periods[0].start) || '09:00', minutes: 50, lunchAfter: 4, lunchMinutes: 40 };
  const quickForm = el('div', { class: 'row' },
    el('label', { class: 'field' }, 'Periods a day', bound(quick, 'count', { type: 'number', min: 1, max: 14 }, int(1))),
    el('label', { class: 'field' }, 'First starts', bound(quick, 'start', { type: 'time' })),
    el('label', { class: 'field' }, 'Minutes each', bound(quick, 'minutes', { type: 'number', min: 10, max: 180 }, int(10))),
    el('label', { class: 'field' }, 'Lunch after period', bound(quick, 'lunchAfter', { type: 'number', min: 0, max: 14 }, int(0))),
    el('label', { class: 'field' }, 'Lunch minutes', bound(quick, 'lunchMinutes', { type: 'number', min: 0, max: 120 }, int(0))),
    el('button', {
      type: 'button', class: 'btn', style: { alignSelf: 'end' },
      onclick: () => {
        let t = toMinutes(quick.start);
        c.periods = [];
        for (let i = 0; i < quick.count; i++) {
          c.periods.push({ start: fromMinutes(t), end: fromMinutes(t + quick.minutes) });
          t += quick.minutes;
          if (i + 1 === quick.lunchAfter) t += quick.lunchMinutes;
        }
        c.breaks = quick.lunchAfter > 0 && quick.lunchAfter < quick.count ? [quick.lunchAfter - 1] : [];
        changed(true);
        toast(`Built ${quick.count} periods.`);
      },
    }, 'Build periods'));

  return el('div', {},
    pageHead('College and teaching week', 'Set the days and periods once. Everything else (rooms, teachers, classes, subjects) builds on this.'),
    el('div', { class: 'grid-2' },
      el('div', { class: 'card' },
        el('h2', {}, 'College'),
        el('label', { class: 'field' }, 'College name', bound(c, 'name', { type: 'text', rerender: false })),
        el('h3', { style: { marginTop: '1rem' } }, 'Teaching days'),
        el('div', { class: 'row' }, WEEK.map((d) => el('label', { class: 'check' },
          el('input', {
            type: 'checkbox', checked: c.days.includes(d),
            onchange: (e) => {
              const set = new Set(c.days);
              if (e.target.checked) set.add(d);
              else set.delete(d);
              c.days = WEEK.filter((x) => set.has(x));
              changed();
            },
          }), d))),
        el('p', { class: 'muted small', style: { marginTop: '.75rem' } },
          'Changing days or periods after generating may leave classes outside the new week; the Timetables screen will flag them.')),
      el('div', { class: 'card' },
        el('h2', {}, 'Quick fill'),
        el('p', { class: 'muted small' }, 'Build the whole day in one go, then fine-tune times below.'),
        quickForm)),
    el('div', { class: 'card' },
      el('h2', {}, 'Periods'),
      el('p', { class: 'muted small' }, 'Tick "Break after" for lunch or tea. No lab or double period will run across a break.'),
      tableCard({
        id: 'periods', caption: 'Periods of the teaching day', head: ['', 'Starts', 'Ends', 'Break', ''], rows: periodRows,
        emptyText: 'No periods yet. Use Quick fill above.',
        foot: el('button', {
          type: 'button', class: 'btn',
          onclick: () => {
            const last = c.periods[c.periods.length - 1];
            const start = last ? last.end : '09:00';
            c.periods.push({ start, end: fromMinutes(toMinutes(start) + 50) });
            changed(true);
          },
        }, '+ Add period'),
      })));
}

function toMinutes(t) {
  const [h, m] = String(t || '09:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fromMinutes(n) {
  const h = Math.floor(n / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ rooms */

export function renderRooms() {
  const d = app.data;
  const rows = d.rooms.map((r) => el('tr', {},
    el('td', {}, bound(r, 'name', { type: 'text', 'aria-label': 'Room name' })),
    el('td', {}, bound(r, 'type', { type: 'text', list: 'dl-roomtypes', 'aria-label': 'Room type' })),
    el('td', { class: 'narrow' }, bound(r, 'capacity', { type: 'number', min: 1, 'aria-label': 'Capacity' }, int(1))),
    el('td', {}, bound(r, 'dept', { type: 'text', list: 'dl-depts', placeholder: 'Shared by all', 'aria-label': 'Department' })),
    el('td', {}, delButton(`Delete ${r.name}`, () => {
      d.rooms = d.rooms.filter((x) => x !== r);
      d.courses.forEach((c) => { if (c.fixedRoomId === r.id) c.fixedRoomId = ''; });
      changed(true);
    }))));
  return el('div', {},
    pageHead('Rooms', 'Every room and lab that can be timetabled. Leave Department empty for shared spaces (seminar halls, central labs) that any department may book.'),
    datalist('dl-roomtypes', roomTypes(d)), datalist('dl-depts', departments(d)),
    tableCard({
      id: 'rooms', caption: 'Rooms', head: ['Name', 'Type', 'Seats', 'Department', ''], rows,
      emptyText: 'No rooms yet. Add one, or paste a list from Excel.',
      foot: [
        el('button', { type: 'button', class: 'btn primary', onclick: () => { d.rooms.push({ id: uid('r'), name: `Room ${d.rooms.length + 1}`, type: 'Classroom', capacity: 60, dept: '' }); changed(true); } }, '+ Add room'),
        pasteButton('rooms'),
        el('span', { class: 'muted small' }, `${d.rooms.length} rooms · types: ${[...new Set(d.rooms.map((r) => r.type))].join(', ') || 'none'}`),
      ],
    }));
}

/* --------------------------------------------------------------- teachers */

export function renderTeachers() {
  const d = app.data;
  const P = d.college.periods.length;
  const D = d.college.days.length;
  const load = new Map();
  for (const c of d.courses) load.set(c.teacherId, (load.get(c.teacherId) || 0) + c.sessions * c.length);
  const rows = d.teachers.map((t) => {
    const blocked = t.unavailable.length;
    const need = load.get(t.id) || 0;
    const cap = Math.min(D * P - blocked, t.maxPerDay * D);
    return el('tr', {},
      el('td', {}, bound(t, 'name', { type: 'text', 'aria-label': 'Teacher name' })),
      el('td', {}, bound(t, 'dept', { type: 'text', list: 'dl-depts', 'aria-label': 'Department' })),
      el('td', { class: 'narrow' }, bound(t, 'maxPerDay', { type: 'number', min: 1, max: P || 12, 'aria-label': 'Max periods per day' }, int(1))),
      el('td', {}, el('button', { type: 'button', class: 'btn', onclick: () => availabilityDialog(t) },
        blocked ? `${blocked} period${blocked > 1 ? 's' : ''} blocked` : 'Available all week')),
      el('td', { class: 'nowrap' },
        el('span', { class: `pill ${need > cap ? 'bad' : need > cap * 0.9 ? 'warn' : ''}` }, `${need} / ${cap}`)),
      el('td', {}, delButton(`Delete ${t.name}`, () => {
        const used = d.courses.filter((c) => c.teacherId === t.id).length;
        if (used && !confirm(`${t.name} teaches ${used} subject(s). Delete anyway? Those subjects will need a new teacher.`)) return;
        d.teachers = d.teachers.filter((x) => x !== t);
        d.courses.forEach((c) => { if (c.teacherId === t.id) c.teacherId = ''; });
        changed(true);
      })));
  });
  return el('div', {},
    pageHead('Teachers', 'Who teaches, their daily limit, and when they cannot teach (meetings, part-time days, other campus). "Load" shows periods assigned per week against what they can take.'),
    datalist('dl-depts', departments(d)),
    tableCard({
      id: 'teachers', caption: 'Teachers', head: ['Name', 'Department', 'Max periods a day', 'Availability', 'Load / week', ''], rows,
      emptyText: 'No teachers yet. Add one, or paste a list from Excel.',
      foot: [
        el('button', { type: 'button', class: 'btn primary', onclick: () => { d.teachers.push({ id: uid('t'), name: `Teacher ${d.teachers.length + 1}`, dept: '', maxPerDay: 5, unavailable: [] }); changed(true); } }, '+ Add teacher'),
        pasteButton('teachers'),
      ],
    }));
}

function availabilityDialog(t) {
  const c = app.data.college;
  const set = new Set(t.unavailable);
  const cell = (d, p) => el('button', {
    type: 'button', class: 'cell', 'aria-pressed': String(set.has(`${d}-${p}`)),
    'aria-label': `${c.days[d]} period ${p + 1}`,
    onclick: (e) => {
      const k = `${d}-${p}`;
      if (set.has(k)) set.delete(k);
      else set.add(k);
      e.currentTarget.setAttribute('aria-pressed', String(set.has(k)));
      e.currentTarget.textContent = set.has(k) ? 'Off' : 'Free';
    },
  }, set.has(`${d}-${p}`) ? 'Off' : 'Free');
  const table = el('table', { class: 'avail' },
    el('thead', {}, el('tr', {}, el('th', {}, ''), c.periods.map((per, p) => el('th', {}, `P${p + 1}`, el('br'), el('span', { class: 'muted' }, per.start))))),
    el('tbody', {}, c.days.map((day, d) => el('tr', {},
      el('th', {}, el('button', {
        type: 'button', class: 'dayhead', title: 'Toggle the whole day',
        onclick: (e) => {
          const keys = c.periods.map((_, p) => `${d}-${p}`);
          const allOff = keys.every((k) => set.has(k));
          keys.forEach((k) => (allOff ? set.delete(k) : set.add(k)));
          e.currentTarget.closest('tr').querySelectorAll('button.cell').forEach((b, p) => {
            b.setAttribute('aria-pressed', String(set.has(keys[p])));
            b.textContent = set.has(keys[p]) ? 'Off' : 'Free';
          });
        },
      }, day)),
      c.periods.map((_, p) => el('td', {}, cell(d, p)))))));
  openDialog({
    title: `When can ${t.name} teach?`,
    wide: true,
    body: el('div', {}, el('p', { class: 'muted small' }, 'Click a period to mark it Off. Click a day name to toggle the whole day.'), el('div', { class: 'tt-scroll' }, table)),
    actions: [
      el('button', { type: 'button', class: 'btn', onclick: () => { set.clear(); closeDialog(); t.unavailable = []; changed(true); } }, 'Clear all'),
      el('button', { type: 'button', class: 'btn primary', autofocus: true, onclick: () => { t.unavailable = [...set]; closeDialog(); changed(true); } }, 'Save'),
    ],
  });
}

/* ---------------------------------------------------------------- classes */

export function renderSections() {
  const d = app.data;
  const need = new Map();
  for (const c of d.courses) {
    if (!c.batch) need.set(c.sectionId, (need.get(c.sectionId) || 0) + c.sessions * c.length);
  }
  const slots = d.college.days.length * d.college.periods.length;
  const rows = d.sections.map((s) => {
    const n = need.get(s.id) || 0;
    const subjects = d.courses.filter((c) => c.sectionId === s.id).length;
    const batches = batchCount(d, s.id);
    return el('tr', {},
      el('td', {}, bound(s, 'name', { type: 'text', 'aria-label': 'Class name' })),
      el('td', {}, bound(s, 'dept', { type: 'text', list: 'dl-depts', 'aria-label': 'Department' })),
      el('td', { class: 'narrow' }, bound(s, 'size', { type: 'number', min: 1, 'aria-label': 'Students' }, int(1))),
      el('td', { class: 'nowrap' }, `${subjects} subject${subjects === 1 ? '' : 's'}`, batches > 1 ? el('span', { class: 'muted small' }, ` · ${batches} lab batches`) : ''),
      el('td', { class: 'nowrap' }, el('span', { class: `pill ${n > slots ? 'bad' : ''}` }, `${n} / ${slots}`)),
      el('td', {}, el('button', { type: 'button', class: 'btn ghost', onclick: () => { app.ui.subjectFilter = s.id; app.ui.tab = 'subjects'; app.render(); } }, 'Subjects →')),
      el('td', {}, delButton(`Delete ${s.name}`, () => {
        const used = d.courses.filter((c) => c.sectionId === s.id).length;
        if (used && !confirm(`${s.name} has ${used} subject(s). Delete the class and its subjects?`)) return;
        d.sections = d.sections.filter((x) => x !== s);
        d.courses = d.courses.filter((c) => c.sectionId !== s.id);
        changed(true);
      })));
  });
  return el('div', {},
    pageHead('Classes', 'Each group of students that shares one timetable: a section, batch or year. Students decides which rooms are big enough.'),
    datalist('dl-depts', departments(d)),
    tableCard({
      id: 'sections', caption: 'Classes', head: ['Class', 'Department', 'Students', 'Subjects', 'Periods / week', '', ''], rows,
      emptyText: 'No classes yet.',
      foot: [
        el('button', { type: 'button', class: 'btn primary', onclick: () => { d.sections.push({ id: uid('s'), name: `Class ${d.sections.length + 1}`, dept: '', size: 60 }); changed(true); } }, '+ Add class'),
        pasteButton('sections'),
      ],
    }));
}

/* --------------------------------------------------------------- subjects */

export function renderSubjects() {
  const d = app.data;
  const filter = app.ui.subjectFilter;
  const sectionOpts = d.sections.map((s) => [s.id, s.name]);
  const teacherOpts = [['', '— choose —'], ...[...d.teachers].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.id, `${t.name}${t.dept ? ` (${t.dept})` : ''}`])];
  const typeOpts = roomTypes(d).map((t) => [t, t]);
  const list = d.courses.filter((c) => !filter || c.sectionId === filter);

  const rows = list.map((c) => el('tr', {},
    el('td', { class: 'narrow' }, el('select', { 'aria-label': 'Class', onchange: (e) => { c.sectionId = e.target.value; changed(); } }, options([['', '— choose —'], ...sectionOpts], c.sectionId))),
    el('td', { class: 'narrow' }, bound(c, 'batch', { type: 'text', list: 'dl-batches', placeholder: 'Whole', size: 5, 'aria-label': 'Batch' }, (v) => v.trim())),
    el('td', { class: 'narrow' }, bound(c, 'code', { type: 'text', 'aria-label': 'Code', size: 8 })),
    el('td', { class: 'wide' }, bound(c, 'subject', { type: 'text', 'aria-label': 'Subject' })),
    el('td', { class: 'wide' }, el('select', { 'aria-label': 'Teacher', onchange: (e) => { c.teacherId = e.target.value; changed(); } }, options(teacherOpts, c.teacherId))),
    el('td', { class: 'narrow' }, bound(c, 'sessions', { type: 'number', min: 1, max: 14, 'aria-label': 'Sessions per week' }, int(1))),
    el('td', { class: 'narrow' }, bound(c, 'length', { type: 'number', min: 1, max: 6, 'aria-label': 'Periods per session' }, int(1))),
    el('td', {}, el('select', { 'aria-label': 'Room type', onchange: (e) => { c.roomType = e.target.value; changed(); } }, options(typeOpts, c.roomType))),
    el('td', {}, el('select', { 'aria-label': 'Fixed room', onchange: (e) => { c.fixedRoomId = e.target.value; changed(); } },
      options([['', 'Any suitable'], ...d.rooms.map((r) => [r.id, r.name])], c.fixedRoomId))),
    el('td', { class: 'nowrap' },
      el('button', { type: 'button', class: 'btn ghost icon', title: 'Duplicate', 'aria-label': `Duplicate ${c.code || c.subject}`, onclick: () => { d.courses.splice(d.courses.indexOf(c) + 1, 0, { ...c, id: uid('c') }); changed(true); } }, '⧉'),
      delButton(`Delete ${c.code || c.subject}`, () => { d.courses = d.courses.filter((x) => x !== c); changed(true); }))));

  const total = list.reduce((a, c) => a + c.sessions * c.length, 0);
  return el('div', {},
    pageHead('Subjects', 'What each class studies, who teaches it, how often, and in what kind of room. A lab of 2 periods = 1 session × 2 periods. To split a class for labs, add the lab once per batch (G1, G2) with its own teacher: both halves can be in different labs at the same time.'),
    datalist('dl-batches', ['G1', 'G2', 'G3']),
    el('div', { class: 'row', style: { marginBottom: '.75rem' } },
      el('label', { class: 'field' }, 'Show',
        el('select', { onchange: (e) => { app.ui.subjectFilter = e.target.value; app.render(); } }, options([['', `All classes (${d.courses.length} rows)`], ...sectionOpts], filter))),
      el('span', { class: 'muted small', style: { alignSelf: 'end' } }, `${list.length} rows · ${total} periods a week`)),
    tableCard({
      id: 'subjects', caption: 'Subjects', head: ['Class', 'Batch', 'Code', 'Subject', 'Teacher', 'Sessions / week', 'Periods each', 'Room type', 'Room', ''], rows,
      emptyText: d.sections.length ? 'No subjects yet.' : 'Add classes first, then their subjects.',
      foot: [
        el('button', {
          type: 'button', class: 'btn primary', disabled: !d.sections.length,
          onclick: () => {
            d.courses.push({ id: uid('c'), sectionId: filter || d.sections[0].id, batch: '', subject: 'New subject', code: '', teacherId: '', sessions: 3, length: 1, roomType: 'Classroom', fixedRoomId: '' });
            changed(true);
          },
        }, '+ Add subject'),
        pasteButton('courses'),
      ],
    }));
}

/* ------------------------------------------------------- paste from Excel */

const PASTE = {
  rooms: { title: 'Paste rooms', numberCol: 2, cols: ['Name', 'Type', 'Seats', 'Department (blank = shared)'], example: 'CR-101\tClassroom\t70\tCSE\nSeminar Hall\tSeminar Hall\t200\t' },
  teachers: { title: 'Paste teachers', numberCol: 2, cols: ['Name', 'Department', 'Max periods a day'], example: 'Dr. A. Sharma\tCSE\t5\nMs. B. Kaur\tECE\t4' },
  sections: { title: 'Paste classes', numberCol: 2, cols: ['Class', 'Department', 'Students'], example: 'CSE-3A\tCSE\t64\nECE-3A\tECE\t60' },
  courses: { title: 'Paste subjects', numberCol: 5, cols: ['Class', 'Batch (blank = whole)', 'Code', 'Subject', 'Teacher', 'Sessions / week', 'Periods each', 'Room type'], example: 'CSE-3A\t\tCS-301\tData Structures\tDr. A. Sharma\t4\t1\tClassroom\nCSE-3A\tG1\tCS-311\tDS Lab\tMs. B. Kaur\t1\t2\tComputer Lab' },
};

function pasteButton(kind) {
  return el('button', { type: 'button', class: 'btn', onclick: () => pasteDialog(kind) }, 'Paste from Excel');
}

export function parseTable(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  return lines.map((line) => (line.includes('\t') ? line.split('\t') : parseCsvLine(line)).map((v) => v.trim()));
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function pasteDialog(kind) {
  const spec = PASTE[kind];
  const area = el('textarea', { 'aria-label': 'Rows to paste', placeholder: spec.example, autofocus: true });
  const replace = el('input', { type: 'checkbox' });
  openDialog({
    title: spec.title,
    wide: true,
    body: el('div', {},
      el('p', {}, 'Copy the rows from Excel or Google Sheets and paste them here. Columns, in this order:'),
      el('p', {}, spec.cols.map((c, i) => el('span', { class: 'tag' }, `${i + 1}. ${c}`))),
      el('p', { class: 'muted small' }, 'A header row is skipped automatically. Comma-separated (CSV) text works too. Sample files are in the samples/csv folder of the project.'),
      area,
      el('label', { class: 'check', style: { marginTop: '.6rem' } }, replace, 'Replace the current list instead of adding to it')),
    actions: [
      el('button', { type: 'button', class: 'btn', onclick: () => closeDialog() }, 'Cancel'),
      el('button', {
        type: 'button', class: 'btn primary',
        onclick: () => {
          const rows = parseTable(area.value);
          // A header row has words where a number belongs (seats, max periods, students, sessions).
          if (rows.length && !/^\d+$/.test(rows[0][spec.numberCol] || '')) rows.shift();
          if (!rows.length) { toast('Nothing to add: paste some rows first.'); return; }
          const note = importRows(kind, rows, replace.checked);
          closeDialog();
          changed(true);
          toast(note, 5000);
        },
      }, 'Add rows'),
    ],
  });
}

function importRows(kind, rows, replace) {
  const d = app.data;
  const num = (v, f) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : f);
  if (kind === 'rooms') {
    const add = rows.map(([name, type, cap, dept]) => ({ id: uid('r'), name: name || 'Room', type: type || 'Classroom', capacity: num(cap, 60), dept: dept || '' }));
    d.rooms = replace ? add : [...d.rooms, ...add];
    return `Added ${add.length} rooms.`;
  }
  if (kind === 'teachers') {
    const add = rows.map(([name, dept, max]) => ({ id: uid('t'), name: name || 'Teacher', dept: dept || '', maxPerDay: num(max, 5), unavailable: [] }));
    d.teachers = replace ? add : [...d.teachers, ...add];
    return `Added ${add.length} teachers.`;
  }
  if (kind === 'sections') {
    const add = rows.map(([name, dept, size]) => ({ id: uid('s'), name: name || 'Class', dept: dept || '', size: num(size, 60) }));
    d.sections = replace ? add : [...d.sections, ...add];
    return `Added ${add.length} classes.`;
  }
  // Subjects refer to classes and teachers by name; missing ones are created so nothing is lost.
  const byName = (list, name) => list.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
  let newSections = 0;
  let newTeachers = 0;
  const add = rows.map(([sec, batch, code, subject, teacher, sessions, length, roomType]) => {
    let s = byName(d.sections, sec);
    if (!s && sec) { s = { id: uid('s'), name: sec, dept: '', size: 60 }; d.sections.push(s); newSections++; }
    let t = byName(d.teachers, teacher);
    if (!t && teacher) { t = { id: uid('t'), name: teacher, dept: s ? s.dept : '', maxPerDay: 5, unavailable: [] }; d.teachers.push(t); newTeachers++; }
    return {
      id: uid('c'), sectionId: s ? s.id : '', batch: batch || '', code: code || '', subject: subject || code || 'Subject',
      teacherId: t ? t.id : '', sessions: num(sessions, 3), length: Math.max(1, num(length, 1)), roomType: roomType || 'Classroom', fixedRoomId: '',
    };
  });
  d.courses = replace ? add : [...d.courses, ...add];
  return `Added ${add.length} subjects${newSections ? `, ${newSections} new classes` : ''}${newTeachers ? `, ${newTeachers} new teachers` : ''}.`;
}
