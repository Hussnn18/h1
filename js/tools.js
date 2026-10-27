/**
 * Day-to-day tools on top of a finished timetable: moving a lesson by hand,
 * finding a substitute for an absent teacher, and finding a free room.
 */
import { Board, buildLessons } from './solver.js';
import { indexData, courseLabel, sectionLabel } from './model.js';

/** Board holding every placement except `skipLessonId`. */
function boardFrom(data, placements, skipLessonId) {
  const lessons = new Map(buildLessons(data).map((l) => [l.id, l]));
  const board = new Board(data);
  for (const pl of placements) {
    if (pl.lessonId === skipLessonId) continue;
    const l = lessons.get(pl.lessonId);
    if (l) board.place(l, pl.day, pl.period, pl.roomId);
  }
  return { board, lessons };
}

/**
 * For a lesson being dragged, say for every (day, period) whether it may go there,
 * which room it would use, and if not, why.
 * @returns {(d: number, p: number) => { ok: boolean, roomId?: string, reason?: string }}
 */
export function moveChecker(data, placements, lessonId) {
  const ix = indexData(data);
  const { board, lessons } = boardFrom(data, placements, lessonId);
  const l = lessons.get(lessonId);
  const current = placements.find((pl) => pl.lessonId === lessonId);
  const teacher = l && ix.teacher.get(l.teacherId);
  return (d, p) => {
    if (!l) return { ok: false, reason: 'Unknown lesson.' };
    if (!l.starts[d] || !l.starts[d].includes(p)) {
      const crosses = p + l.length > board.P || (data.college.breaks || []).some((b) => p <= b && p + l.length - 1 > b);
      return { ok: false, reason: crosses ? 'Would run across a break or past the last period.' : `${teacher.name} is unavailable then.` };
    }
    if (!board.teacherFree(l, d, p)) {
      const other = [...board.blockers(l, d, p, '__none__')].map((id) => board.placed.get(id)).find((x) => x && x.lesson.teacherId === l.teacherId);
      return { ok: false, reason: `${teacher.name} is teaching ${other ? describe(ix, other.lesson) : 'another class'} then.` };
    }
    if (!board.sectionFree(l, d, p)) return { ok: false, reason: `${sectionLabel(ix.section.get(l.sectionId), l.course)} already has a class then.` };
    if (!board.dayCapsOk(l, d)) {
      const tooMany = (board.tDay.get(`${l.teacherId}|${d}`) || 0) + l.length > l.maxPerDay;
      return { ok: false, reason: tooMany ? `${teacher.name} would exceed ${l.maxPerDay} periods that day.` : `${courseLabel(l.course)} already happens that day.` };
    }
    const prefer = current && l.rooms.find((r) => r.id === current.roomId);
    const order = prefer ? [prefer, ...l.rooms.filter((r) => r !== prefer)] : l.rooms;
    const room = order.find((r) => board.roomFree(r.id, d, p, l.length));
    if (!room) return { ok: false, reason: `No ${l.course.roomType} room is free then.` };
    return { ok: true, roomId: room.id };
  };
}

function describe(ix, l) {
  return `${courseLabel(l.course)} (${sectionLabel(ix.section.get(l.sectionId), l.course)})`;
}

/**
 * Lessons an absent teacher has on `day`, each with colleagues who are free to cover it,
 * same department first, then whoever has the lightest day.
 */
export function substitutes(data, placements, teacherId, day) {
  const ix = indexData(data);
  const absent = ix.teacher.get(teacherId);
  const { board, lessons } = boardFrom(data, placements, null);
  const mine = placements
    .filter((pl) => pl.day === day && lessons.get(pl.lessonId) && lessons.get(pl.lessonId).teacherId === teacherId)
    .sort((a, b) => a.period - b.period);
  return mine.map((pl) => {
    const l = lessons.get(pl.lessonId);
    const options = data.teachers
      .filter((t) => t.id !== teacherId)
      .filter((t) => {
        for (let q = pl.period; q < pl.period + l.length; q++) {
          if (t.unavailable.includes(`${day}-${q}`) || board.teacher.has(`${t.id}|${day}|${q}`)) return false;
        }
        return (board.tDay.get(`${t.id}|${day}`) || 0) + l.length <= t.maxPerDay;
      })
      .map((t) => ({ teacher: t, load: board.tDay.get(`${t.id}|${day}`) || 0, sameDept: !!absent && t.dept === absent.dept }))
      .sort((a, b) => Number(b.sameDept) - Number(a.sameDept) || a.load - b.load || a.teacher.name.localeCompare(b.teacher.name));
    return { placement: pl, lesson: l, room: ix.room.get(pl.roomId), section: ix.section.get(l.sectionId), options };
  });
}

/** Rooms with nothing scheduled at (day, period), optionally of one type. */
export function freeRooms(data, placements, day, period, type = '') {
  const { board } = boardFrom(data, placements, null);
  return data.rooms
    .filter((r) => !type || r.type.toLowerCase() === type.toLowerCase())
    .filter((r) => !board.room.has(`${r.id}|${day}|${period}`))
    .sort((a, b) => a.capacity - b.capacity);
}
