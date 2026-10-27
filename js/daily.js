/**
 * Daily tools for the timetable office: cover for an absent teacher,
 * find a free room, and see teaching loads and room use.
 */
import { el, options } from './dom.js';
import { app, placements } from './state.js';
import { courseLabel, sectionLabel, roomTypes } from './model.js';
import { metrics } from './validate.js';
import { substitutes, freeRooms } from './tools.js';

const pick = { teacherId: '', day: 0, rDay: 0, rPeriod: 0, rType: '' };

export function renderDaily() {
  const d = app.data;
  const pls = placements();
  if (!pls.length) {
    return el('div', { class: 'card' }, el('h1', {}, 'Daily tools'), el('p', { class: 'muted' }, 'Generate a timetable first. Then you can find cover for absent teachers and free rooms here.'));
  }
  const { days, periods } = d.college;
  if (!d.teachers.some((t) => t.id === pick.teacherId)) {
    const busiest = Object.entries(metrics(d, pls).teacherLoad).sort((a, b) => b[1] - a[1])[0];
    pick.teacherId = busiest ? busiest[0] : '';
  }
  pick.day = Math.min(pick.day, days.length - 1);
  const rerender = () => app.render();

  const subs = pick.teacherId ? substitutes(d, pls, pick.teacherId, pick.day) : [];
  const absent = d.teachers.find((t) => t.id === pick.teacherId);
  const subCard = el('div', { class: 'card' },
    el('h2', {}, 'Teacher absent? Find cover'),
    el('p', { class: 'muted small' }, 'Lists each class the teacher has that day and who is free to take it: same department first, then the lightest day. Only teachers who are free, available and under their daily limit are shown.'),
    el('div', { class: 'row', style: { marginBottom: '.6rem' } },
      el('label', { class: 'field' }, 'Absent teacher', el('select', { onchange: (e) => { pick.teacherId = e.target.value; rerender(); } },
        options([...d.teachers].sort((a, b) => a.name.localeCompare(b.name)).map((t) => [t.id, `${t.name} (${t.dept})`]), pick.teacherId))),
      el('label', { class: 'field' }, 'Day', el('select', { onchange: (e) => { pick.day = Number(e.target.value); rerender(); } }, options(days.map((x, i) => [String(i), x]), String(pick.day))))),
    subs.length
      ? el('div', {}, subs.map((s) => el('div', { class: 'sub-row' },
        el('div', {},
          el('strong', {}, `P${s.placement.period + 1}${s.lesson.length > 1 ? `–${s.placement.period + s.lesson.length}` : ''} · ${periods[s.placement.period].start}`),
          el('div', { class: 'small muted' }, `${courseLabel(s.lesson.course)} · ${sectionLabel(s.section, s.lesson.course)} · ${s.room ? s.room.name : ''}`)),
        el('div', {}, s.options.length
          ? s.options.slice(0, 8).map((o, i) => el('span', { class: `tag ${i === 0 ? 'best' : ''}`, title: `${o.load} periods that day` }, `${o.teacher.name}${o.sameDept ? '' : ` (${o.teacher.dept})`} · ${o.load}/${o.teacher.maxPerDay}`))
          : el('span', { class: 'pill bad' }, 'Nobody is free: consider swapping the period')))))
      : el('div', { class: 'notice ok' }, `${absent ? absent.name : 'This teacher'} has no classes on ${days[pick.day]}.`));

  const types = ['', ...roomTypes(d).filter((t) => d.rooms.some((r) => r.type === t))];
  pick.rPeriod = Math.min(pick.rPeriod, periods.length - 1);
  pick.rDay = Math.min(pick.rDay, days.length - 1);
  const free = freeRooms(d, pls, pick.rDay, pick.rPeriod, pick.rType);
  const roomCard = el('div', { class: 'card' },
    el('h2', {}, 'Find a free room'),
    el('p', { class: 'muted small' }, 'For an extra class, a test or a meeting. Smallest rooms first.'),
    el('div', { class: 'row', style: { marginBottom: '.6rem' } },
      el('label', { class: 'field' }, 'Day', el('select', { onchange: (e) => { pick.rDay = Number(e.target.value); rerender(); } }, options(days.map((x, i) => [String(i), x]), String(pick.rDay)))),
      el('label', { class: 'field' }, 'Period', el('select', { onchange: (e) => { pick.rPeriod = Number(e.target.value); rerender(); } }, options(periods.map((p, i) => [String(i), `P${i + 1} ${p.start}`]), String(pick.rPeriod)))),
      el('label', { class: 'field' }, 'Type', el('select', { onchange: (e) => { pick.rType = e.target.value; rerender(); } }, options(types.map((t) => [t, t || 'Any type']), pick.rType)))),
    free.length
      ? el('div', {}, free.map((r) => el('span', { class: 'tag' }, `${r.name} · ${r.capacity} seats${r.dept ? ` · ${r.dept}` : ' · shared'}`)))
      : el('div', { class: 'notice warn' }, 'No free room of that type then.'));

  const m = metrics(d, pls);
  const slots = days.length * periods.length;
  const teacherRows = [...d.teachers].sort((a, b) => (m.teacherLoad[b.id] || 0) - (m.teacherLoad[a.id] || 0)).map((t) => {
    const load = m.teacherLoad[t.id] || 0;
    const cap = Math.min(slots - t.unavailable.length, t.maxPerDay * days.length);
    const pct = cap ? Math.round((load / cap) * 100) : 0;
    return el('tr', {}, el('td', {}, t.name), el('td', {}, t.dept), el('td', {}, String(load)),
      el('td', {}, el('div', { class: `bar ${pct > 85 ? 'hot' : ''}`, title: `${pct}% of what they can teach` }, el('span', { style: { width: `${Math.min(100, pct)}%` } }))));
  });
  const roomRows = [...d.rooms].sort((a, b) => (m.roomLoad[b.id] || 0) - (m.roomLoad[a.id] || 0)).map((r) => {
    const used = m.roomLoad[r.id] || 0;
    const pct = Math.round((used / slots) * 100);
    return el('tr', {}, el('td', {}, r.name), el('td', {}, r.type), el('td', {}, `${used} / ${slots}`),
      el('td', {}, el('div', { class: 'bar', title: `${pct}% of the week` }, el('span', { style: { width: `${pct}%` } }))));
  });
  const table = (id, caption, head, rows) => el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': caption, style: { maxHeight: '420px' } },
    el('table', { class: 'edit' }, el('thead', {}, el('tr', {}, head.map((h) => el('th', { scope: 'col' }, h)))), el('tbody', {}, rows)));

  return el('div', {},
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, 'Daily tools'), el('p', {}, 'Things the timetable office does every day once the timetable is out.'))),
    el('div', { class: 'grid-2' }, subCard, roomCard),
    el('div', { class: 'grid-2' },
      el('div', { class: 'card' }, el('h2', {}, 'Teaching load'), el('p', { class: 'muted small' }, 'Periods a week; the bar shows how close each teacher is to what they can take.'),
        table('load', 'Teaching load', ['Teacher', 'Dept', 'Periods', 'Load'], teacherRows)),
      el('div', { class: 'card' }, el('h2', {}, 'Room use'), el('p', { class: 'muted small' }, 'Booked periods out of the whole week. Empty rooms are space you could free up.'),
        table('rooms-use', 'Room use', ['Room', 'Type', 'Booked', 'Use'], roomRows))));
}
