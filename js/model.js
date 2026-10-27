/**
 * Data model helpers shared by the solver, the validator and the UI.
 * Pure functions with no DOM access, so they also run in the Web Worker and in Node tests.
 *
 * A college is one JSON object:
 *   college:  { name, days: ["Mon", ...], periods: [{ start, end }], breaks: [periodIndex, ...] }
 *             a break after period index b means no lesson may run across b -> b+1 (e.g. lunch)
 *   rooms:    { id, name, type, capacity, dept }          dept "" = shared by all departments
 *   teachers: { id, name, dept, maxPerDay, unavailable: ["dayIndex-periodIndex", ...] }
 *   sections: { id, name, dept, size }
 *   courses:  { id, sectionId, batch, subject, code, teacherId, sessions, length, roomType, fixedRoomId }
 *             batch "" = whole section; "G1"/"G2" = half the section, so two batches can be in
 *             different labs at the same time
 */

export const DEFAULT_ROOM_TYPES = ['Classroom', 'Lab', 'Seminar Hall'];

export function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function emptyData() {
  return {
    version: 1,
    college: {
      name: 'My College',
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      periods: [
        { start: '09:00', end: '09:50' },
        { start: '09:50', end: '10:40' },
        { start: '10:40', end: '11:30' },
        { start: '11:30', end: '12:20' },
        { start: '13:00', end: '13:50' },
        { start: '13:50', end: '14:40' },
        { start: '14:40', end: '15:30' },
        { start: '15:30', end: '16:20' },
      ],
      breaks: [3],
    },
    rooms: [],
    teachers: [],
    sections: [],
    courses: [],
    timetable: null,
  };
}

/** Fill in missing fields and coerce numbers so older or hand-written files load safely. */
export function normalize(raw) {
  const base = emptyData();
  const data = { ...base, ...raw, college: { ...base.college, ...(raw && raw.college) } };
  data.college.breaks = (data.college.breaks || []).map(Number).filter((b) => Number.isInteger(b));
  data.rooms = (data.rooms || []).map((r) => ({
    id: r.id || uid('r'),
    name: String(r.name || '').trim(),
    type: String(r.type || 'Classroom').trim(),
    capacity: toInt(r.capacity, 60),
    dept: String(r.dept || '').trim(),
  }));
  data.teachers = (data.teachers || []).map((t) => ({
    id: t.id || uid('t'),
    name: String(t.name || '').trim(),
    dept: String(t.dept || '').trim(),
    maxPerDay: toInt(t.maxPerDay, 5),
    unavailable: Array.isArray(t.unavailable) ? t.unavailable.map(String) : [],
  }));
  data.sections = (data.sections || []).map((s) => ({
    id: s.id || uid('s'),
    name: String(s.name || '').trim(),
    dept: String(s.dept || '').trim(),
    size: toInt(s.size, 60),
  }));
  data.courses = (data.courses || []).map((c) => ({
    id: c.id || uid('c'),
    sectionId: c.sectionId || '',
    batch: String(c.batch || '').trim(),
    subject: String(c.subject || '').trim(),
    code: String(c.code || '').trim(),
    teacherId: c.teacherId || '',
    sessions: toInt(c.sessions, 1),
    length: Math.max(1, toInt(c.length, 1)),
    roomType: String(c.roomType || 'Classroom').trim(),
    fixedRoomId: c.fixedRoomId || '',
  }));
  data.timetable = raw && raw.timetable && Array.isArray(raw.timetable.placements) ? raw.timetable : null;
  return data;
}

function toInt(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function slotKey(d, p) {
  return `${d}-${p}`;
}

/** Can a lesson of `length` periods start at period p without crossing a break or the end of the day? */
export function fitsDay(college, p, length) {
  const P = college.periods.length;
  if (p < 0 || p + length > P) return false;
  for (const b of college.breaks || []) if (p <= b && p + length - 1 > b) return false;
  return true;
}

/** Longest run of periods with no break inside it: the biggest lab block that can exist. */
export function longestBlock(college) {
  let best = 0;
  for (let p = 0; p < college.periods.length; p++) {
    let len = 0;
    while (fitsDay(college, p, len + 1)) len++;
    best = Math.max(best, len);
  }
  return best;
}

export function sameType(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

export function indexData(data) {
  const byId = (list) => new Map(list.map((x) => [x.id, x]));
  return {
    course: byId(data.courses),
    teacher: byId(data.teachers),
    room: byId(data.rooms),
    section: byId(data.sections),
  };
}

/** Number of distinct batches a section is split into (1 if it is never split). */
export function batchCount(data, sectionId) {
  const set = new Set(data.courses.filter((c) => c.sectionId === sectionId && c.batch).map((c) => c.batch));
  return Math.max(1, set.size);
}

/** Students attending one lesson of the course: the whole section, or its share for a batch. */
export function groupSize(data, course, section) {
  if (!section) return 0;
  if (!course.batch) return section.size;
  return Math.ceil(section.size / batchCount(data, section.id));
}

/** Why a room cannot host this course, or "" if it can. */
export function roomProblem(room, course, section, size) {
  if (course.fixedRoomId) {
    if (room.id !== course.fixedRoomId) return 'not the fixed room';
  } else {
    if (!sameType(room.type, course.roomType)) return `is a ${room.type}, needs ${course.roomType}`;
    if (room.dept && section && room.dept !== section.dept) return `belongs to ${room.dept}`;
  }
  if (room.capacity < size) return `holds ${room.capacity}, needs ${size}`;
  return '';
}

export function allowedRooms(data, course, section) {
  const size = groupSize(data, course, section);
  return data.rooms.filter((r) => !roomProblem(r, course, section, size));
}

/** Maximum sessions of one course on a single day, so subjects spread across the week. */
export function courseDayCap(course, dayCount) {
  return Math.max(1, Math.ceil(course.sessions / Math.max(1, dayCount)));
}

/** Expand courses into individual lessons: a course with 4 sessions becomes 4 lessons. */
export function expandLessons(data) {
  const out = [];
  for (const c of data.courses) {
    for (let k = 0; k < c.sessions; k++) out.push({ id: `${c.id}#${k}`, courseId: c.id, length: c.length });
  }
  return out;
}

export function courseLabel(course) {
  return course.code || course.subject || 'Untitled';
}

export function sectionLabel(section, course) {
  if (!section) return '?';
  return course && course.batch ? `${section.name} (${course.batch})` : section.name;
}

export function periodLabel(college, p) {
  const per = college.periods[p];
  return per ? `P${p + 1} ${per.start}` : `P${p + 1}`;
}

export function departments(data) {
  const set = new Set();
  for (const list of [data.sections, data.teachers, data.rooms]) for (const x of list) if (x.dept) set.add(x.dept);
  return [...set].sort();
}

export function roomTypes(data) {
  const set = new Set(DEFAULT_ROOM_TYPES);
  for (const r of data.rooms) if (r.type) set.add(r.type);
  for (const c of data.courses) if (c.roomType) set.add(c.roomType);
  return [...set];
}
