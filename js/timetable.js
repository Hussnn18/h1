/**
 * Timetables screen: one grid per class, teacher or room, with hand moves
 * (click a lesson, then a green slot, or drag it), locking, printing and CSV export.
 */
import { el, options, toast, download, hueFor, slug, openDialog } from './dom.js';
import { app, save, placements, lockedSet } from './state.js';
import { indexData, courseLabel, sectionLabel } from './model.js';
import { validate } from './validate.js';
import { moveChecker } from './tools.js';

const KINDS = [['section', 'Class'], ['teacher', 'Teacher'], ['room', 'Room']];

function entities(kind) {
  const d = app.data;
  return kind === 'section' ? d.sections : kind === 'teacher' ? d.teachers : d.rooms;
}

function belongs(kind, id, pl, c) {
  if (kind === 'section') return c.sectionId === id;
  if (kind === 'teacher') return c.teacherId === id;
  return pl.roomId === id;
}

export function renderTimetables() {
  const d = app.data;
  const pls = placements();
  if (!pls.length) {
    return el('div', { class: 'card', style: { textAlign: 'center', padding: '3rem 1rem' } },
      el('h1', {}, 'No timetable yet'),
      el('p', { class: 'muted' }, 'Enter your rooms, teachers, classes and subjects, then generate.'),
      el('button', { type: 'button', class: 'btn primary big', onclick: () => { app.ui.tab = 'generate'; app.render(); } }, 'Go to Generate'));
  }
  const ix = indexData(d);
  const kind = app.ui.view;
  const list = entities(kind);
  if (!list.some((x) => x.id === app.ui.viewId)) app.ui.viewId = list[0] ? list[0].id : '';
  const current = list.find((x) => x.id === app.ui.viewId);
  const v = validate(d, pls);
  const locked = lockedSet();

  const byDept = new Map();
  for (const x of list) {
    const k = x.dept || (kind === 'room' ? 'Shared' : 'Other');
    if (!byDept.has(k)) byDept.set(k, []);
    byDept.get(k).push(x);
  }
  const picker = el('select', { 'aria-label': 'Which timetable', onchange: (e) => { app.ui.viewId = e.target.value; app.ui.selected = null; app.render(); } },
    [...byDept.entries()].sort().map(([dept, xs]) => el('optgroup', { label: dept }, options(xs.map((x) => [x.id, x.name]), app.ui.viewId))));

  const status = v.hard.length
    ? el('button', { type: 'button', class: 'pill bad', onclick: () => issuesDialog(v) }, `${v.hard.length} problem${v.hard.length > 1 ? 's' : ''}: view`)
    : el('span', { class: 'pill ok', title: 'Checked independently of the generator' }, '✓ 0 clashes');
  const missing = v.missing.length
    ? el('button', { type: 'button', class: 'pill warn', onclick: () => issuesDialog(v) }, `${v.missing.length} subject${v.missing.length > 1 ? 's' : ''} not fully placed`)
    : null;

  const toolbar = el('div', { class: 'tt-toolbar no-print' },
    el('div', { class: 'seg', role: 'group', 'aria-label': 'View by' }, KINDS.map(([k, label]) => el('button', {
      type: 'button', 'aria-pressed': String(kind === k),
      onclick: () => { app.ui.view = k; app.ui.viewId = ''; app.ui.selected = null; app.render(); },
    }, label))),
    picker,
    status, missing,
    el('span', { class: 'spacer' }),
    el('button', { type: 'button', class: 'btn', onclick: () => window.print() }, 'Print'),
    el('button', { type: 'button', class: 'btn', onclick: printAll }, `Print all ${{ section: 'classes', teacher: 'teachers', room: 'rooms' }[kind]}`),
    el('button', { type: 'button', class: 'btn', onclick: exportCsv }, 'Download CSV'));

  const sel = app.ui.selected && pls.find((p) => p.lessonId === app.ui.selected);
  const selCourse = sel && ix.course.get(sel.courseId);
  const hint = sel && selCourse
    ? el('div', { class: 'notice info move-hint no-print row' },
      el('span', {}, el('strong', {}, `Moving ${courseLabel(selCourse)} ${selCourse.subject}`),
        ` · ${sectionLabel(ix.section.get(selCourse.sectionId), selCourse)} · ${(ix.teacher.get(selCourse.teacherId) || {}).name || ''}. `,
        'Green slots are free for the class, the teacher and a suitable room. Hover a red slot to see why not.'),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn', onclick: () => toggleLock(sel.lessonId) }, locked.has(sel.lessonId) ? 'Unlock' : 'Lock here'),
      el('button', { type: 'button', class: 'btn', onclick: () => { app.ui.selected = null; app.render(); } }, 'Cancel (Esc)'))
    : el('p', { class: 'muted small no-print' }, 'Tip: click any class to move it, then click a green slot (or drag it there). Moved classes are locked 🔒 so regenerating keeps them.');

  const sheets = app.ui.printAll ? list.map((x) => sheet(kind, x, ix, pls, locked)) : current ? [sheet(kind, current, ix, pls, locked)] : [];
  const wrap = el('div', {}, toolbar, hint, sheets);
  if (sel && !app.ui.printAll) queueMicrotask(() => highlight(wrap, sel.lessonId));
  return wrap;
}

function sheet(kind, entity, ix, pls, locked) {
  const d = app.data;
  const { days, periods, breaks } = d.college;
  const P = periods.length;
  const mine = pls.filter((pl) => {
    const c = ix.course.get(pl.courseId);
    return c && belongs(kind, entity.id, pl, c);
  });
  const cover = new Map();
  for (const pl of mine) {
    const c = ix.course.get(pl.courseId);
    for (let q = pl.period; q < pl.period + c.length; q++) {
      const k = `${pl.day}|${q}`;
      if (!cover.has(k)) cover.set(k, []);
      cover.get(k).push(pl);
    }
  }
  const isBreak = (p) => breaks.includes(p) && p < P - 1;

  const head = el('tr', {}, el('th', { class: 'day', scope: 'col' }, ''), periods.flatMap((per, p) => [
    el('th', { scope: 'col' }, `P${p + 1}`, el('span', { class: 'time' }, `${per.start}–${per.end}`)),
    isBreak(p) ? el('th', { class: 'brk', 'aria-hidden': 'true' }) : null,
  ]));

  const body = days.map((dayName, day) => {
    const cells = [el('th', { class: 'day', scope: 'row' }, dayName)];
    let p = 0;
    while (p < P) {
      const here = cover.get(`${day}|${p}`) || [];
      let span = 1;
      if (here.length && here.every((pl) => pl.period === p)) {
        const L = ix.course.get(here[0].courseId).length;
        const same = (q) => {
          const s = cover.get(`${day}|${q}`) || [];
          return s.length === here.length && s.every((x) => here.includes(x));
        };
        if (here.every((pl) => ix.course.get(pl.courseId).length === L)) {
          let ok = true;
          for (let q = p + 1; q < p + L; q++) if (!same(q)) ok = false;
          if (ok) span = L;
        }
      }
      cells.push(el('td', {
        class: 'slot', colspan: span > 1 ? span : null, dataset: { day, period: p },
        'aria-label': `${dayName} period ${p + 1}${here.length ? '' : ', free'}`,
      }, here.length ? el('div', { class: 'cell-stack' }, here.map((pl) => lessonCard(kind, pl, ix, locked, pl.period !== p, here.length > 1))) : null));
      const end = p + span - 1;
      if (isBreak(end)) {
        cells.push(day === 0
          ? el('td', { class: 'brk', rowspan: days.length, 'aria-hidden': 'true' }, el('span', {}, breakLabel(d.college, end)))
          : null);
      }
      p += span;
    }
    return el('tr', {}, cells);
  });

  const legend = [...new Map(mine.map((pl) => [ix.course.get(pl.courseId).code || ix.course.get(pl.courseId).subject, ix.course.get(pl.courseId)])).values()]
    .sort((a, b) => courseLabel(a).localeCompare(courseLabel(b)))
    .map((c) => el('span', {}, el('span', { class: 'sw', style: `--h:${hueFor(courseLabel(c))}` }), `${courseLabel(c)} ${c.subject}`));

  return el('section', { class: 'tt-sheet', 'aria-labelledby': `tt-${entity.id}` },
    el('div', { class: 'tt-title' },
      el('h2', { id: `tt-${entity.id}` }, entity.name),
      el('span', { class: 'muted small' }, subtitle(kind, entity, mine, ix)),
      el('span', { class: 'muted small' }, d.college.name)),
    el('div', { class: 'tt-scroll' }, el('table', { class: 'tt' }, el('thead', {}, head), el('tbody', {}, body))),
    el('div', { class: 'legend' }, legend));
}

function breakLabel(college, p) {
  const a = college.periods[p];
  const b = college.periods[p + 1];
  return a && b && a.end !== b.start ? `BREAK ${a.end}–${b.start}` : 'BREAK';
}

function subtitle(kind, entity, mine, ix) {
  const periods = mine.reduce((a, pl) => a + ix.course.get(pl.courseId).length, 0);
  const total = app.data.college.days.length * app.data.college.periods.length;
  if (kind === 'section') return `${entity.dept || 'No department'} · ${entity.size} students · ${periods} periods a week`;
  if (kind === 'teacher') return `${entity.dept || 'No department'} · teaches ${periods} periods a week · max ${entity.maxPerDay} a day`;
  return `${entity.type} · ${entity.capacity} seats · ${entity.dept || 'shared'} · in use ${periods} of ${total} periods`;
}

function lessonCard(kind, pl, ix, locked, continuation, crowded) {
  const c = ix.course.get(pl.courseId);
  const s = ix.section.get(c.sectionId);
  const t = ix.teacher.get(c.teacherId);
  const r = ix.room.get(pl.roomId);
  const meta = kind === 'section' ? [c.batch, t && t.name, r && r.name]
    : kind === 'teacher' ? [sectionLabel(s, c), r && r.name]
      : [sectionLabel(s, c), t && t.name];
  const classes = ['lesson'];
  if (locked.has(pl.lessonId)) classes.push('locked');
  if (app.ui.selected === pl.lessonId) classes.push('selected');
  if (continuation || crowded) classes.push('compact');
  if (app.ui.flash === pl.lessonId) classes.push('flash');
  return el('button', {
    type: 'button', class: classes.join(' '), style: `--h:${hueFor(courseLabel(c))}`, draggable: 'true', dataset: { lesson: pl.lessonId },
    title: `${c.subject} (${courseLabel(c)})\n${sectionLabel(s, c)} · ${t ? t.name : 'no teacher'} · ${r ? r.name : 'no room'}${locked.has(pl.lessonId) ? '\nLocked: kept when regenerating' : ''}`,
    onclick: (e) => {
      e.stopPropagation();
      app.ui.selected = app.ui.selected === pl.lessonId ? null : pl.lessonId;
      app.render();
    },
    ondragstart: (e) => {
      e.dataTransfer.setData('text/plain', pl.lessonId);
      e.dataTransfer.effectAllowed = 'move';
      app.ui.selected = pl.lessonId;
      highlight(e.currentTarget.closest('main'), pl.lessonId);
    },
    ondragend: () => {
      if (app.ui.selected === pl.lessonId) {
        app.ui.selected = null;
        clearHighlight(document.getElementById('main'));
      }
    },
  },
  el('span', { class: 'code' }, el('span', {}, courseLabel(c), continuation ? ' (cont.)' : '')),
  el('span', { class: 'nm' }, c.subject),
  el('span', { class: 'meta' }, meta.filter(Boolean).join(' · ')));
}

/** Colour every slot green (allowed) or red (with the reason as a tooltip) for the lesson being moved. */
function highlight(root, lessonId) {
  if (!root) return;
  const check = moveChecker(app.data, placements(), lessonId);
  for (const td of root.querySelectorAll('td.slot')) {
    const day = Number(td.dataset.day);
    const period = Number(td.dataset.period);
    const res = check(day, period);
    const own = td.querySelector(`[data-lesson="${CSS.escape(lessonId)}"]`);
    td.classList.toggle('drop-ok', res.ok && !own);
    td.classList.toggle('drop-no', !res.ok && !own);
    td.title = own ? '' : res.ok ? `Move here (${(app.data.rooms.find((r) => r.id === res.roomId) || {}).name})` : res.reason;
    td.onclick = () => {
      if (own) return;
      if (res.ok) moveTo(lessonId, day, period, res.roomId);
      else toast(res.reason);
    };
    td.ondragover = (e) => { if (res.ok && !own) { e.preventDefault(); td.classList.add('drop-hover'); } };
    td.ondragleave = () => td.classList.remove('drop-hover');
    td.ondrop = (e) => { e.preventDefault(); if (res.ok && !own) moveTo(lessonId, day, period, res.roomId); };
  }
}

function clearHighlight(root) {
  for (const td of root.querySelectorAll('td.slot')) {
    td.classList.remove('drop-ok', 'drop-no', 'drop-hover');
    td.title = '';
    td.onclick = td.ondragover = td.ondragleave = td.ondrop = null;
  }
}

function moveTo(lessonId, day, period, roomId) {
  const tt = app.data.timetable;
  const pl = tt.placements.find((p) => p.lessonId === lessonId);
  if (!pl) return;
  Object.assign(pl, { day, period, roomId });
  tt.locked = [...new Set([...(tt.locked || []), lessonId])];
  save();
  app.ui.selected = null;
  app.ui.flash = lessonId;
  const c = app.data.courses.find((x) => x.id === pl.courseId);
  const room = app.data.rooms.find((r) => r.id === roomId);
  toast(`Moved ${courseLabel(c)} to ${app.data.college.days[day]} P${period + 1} in ${room ? room.name : '?'}. Locked 🔒.`);
  app.render();
  setTimeout(() => { app.ui.flash = null; }, 1300);
}

function toggleLock(lessonId) {
  const tt = app.data.timetable;
  const set = new Set(tt.locked || []);
  if (set.has(lessonId)) set.delete(lessonId);
  else set.add(lessonId);
  tt.locked = [...set];
  save();
  app.render();
}

function printAll() {
  app.ui.printAll = true;
  app.ui.selected = null;
  app.render();
  const done = () => {
    app.ui.printAll = false;
    app.render();
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
}

function issuesDialog(v) {
  openDialog({
    title: 'Timetable check',
    body: el('div', {},
      v.hard.length ? el('div', { class: 'notice bad' }, el('strong', {}, 'Problems'), el('ul', {}, v.hard.slice(0, 60).map((h) => el('li', {}, h.message)))) : el('div', { class: 'notice ok' }, 'No clashes.'),
      v.missing.length ? el('div', { class: 'notice warn' }, el('strong', {}, 'Not fully placed'), el('ul', {}, v.missing.map((m) => el('li', {}, m.message))),
        el('p', { class: 'small', style: { margin: '.5rem 0 0' } }, 'The Generate screen explains why each one did not fit.')) : null,
      v.soft.length ? el('div', { class: 'notice info' }, el('strong', {}, 'Worth a look'), el('ul', {}, v.soft.map((m) => el('li', {}, m.message)))) : null),
  });
}

function exportCsv() {
  const d = app.data;
  const ix = indexData(d);
  const locked = lockedSet();
  const rows = [['Day', 'Period', 'Start', 'End', 'Class', 'Batch', 'Code', 'Subject', 'Teacher', 'Room', 'Department', 'Locked']];
  const sorted = [...placements()].sort((a, b) => {
    const ca = ix.course.get(a.courseId);
    const cb = ix.course.get(b.courseId);
    const sa = ix.section.get(ca.sectionId);
    const sb = ix.section.get(cb.sectionId);
    return (sa ? sa.name : '').localeCompare(sb ? sb.name : '') || a.day - b.day || a.period - b.period;
  });
  for (const pl of sorted) {
    const c = ix.course.get(pl.courseId);
    if (!c) continue;
    const s = ix.section.get(c.sectionId);
    const t = ix.teacher.get(c.teacherId);
    const r = ix.room.get(pl.roomId);
    const first = d.college.periods[pl.period] || {};
    const last = d.college.periods[pl.period + c.length - 1] || {};
    rows.push([d.college.days[pl.day], pl.period + 1, first.start, last.end, s ? s.name : '', c.batch, c.code, c.subject, t ? t.name : '', r ? r.name : '', s ? s.dept : '', locked.has(pl.lessonId) ? 'yes' : '']);
  }
  const text = rows.map((r) => r.map((v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : v ?? '')).join(',')).join('\r\n');
  download(`${slug(d.college.name)}-timetable.csv`, '﻿' + text, 'text/csv');
  toast('CSV downloaded: opens in Excel.');
}
