/**
 * Timetable solver.
 *
 * 1. precheck() finds impossible inputs before solving (a teacher with more periods than the week has,
 *    a lab with no lab room big enough...) and explains them in plain language.
 * 2. solve() places lessons hardest-first. Every placement must pass the hard rules (no teacher, room or
 *    section clash, teacher availability, room type/capacity/department, no lesson across lunch, teacher
 *    daily limit, a subject at most once a day). Among legal slots it picks the one with the lowest
 *    penalty (gaps in a section's day, overloaded days, last-period classes, oversized rooms).
 * 3. A lesson that finds no slot may evict one or two blocking lessons and re-place them elsewhere.
 * 4. The whole run is repeated with randomised tie-breaks until the time budget ends; the best result wins
 *    (fewest unplaced lessons, then lowest penalty).
 */
import {
  indexData, fitsDay, longestBlock, groupSize, allowedRooms, roomProblem, courseDayCap, expandLessons,
  courseLabel, sectionLabel,
} from './model.js';
import { gapsIn, metrics, validate } from './validate.js';

/** Small seeded random generator so a given seed always gives the same timetable. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pre-computed facts about each lesson that the solver needs many times. */
export function buildLessons(data) {
  const ix = indexData(data);
  const { college } = data;
  const D = college.days.length;
  const P = college.periods.length;
  const teacherDemand = new Map();
  for (const c of data.courses) teacherDemand.set(c.teacherId, (teacherDemand.get(c.teacherId) || 0) + c.sessions * c.length);

  return expandLessons(data).map((l) => {
    const c = ix.course.get(l.courseId);
    const t = ix.teacher.get(c.teacherId);
    const s = ix.section.get(c.sectionId);
    const rooms = s ? allowedRooms(data, c, s) : [];
    const size = groupSize(data, c, s);
    const unavailable = new Set(t ? t.unavailable : []);
    const starts = [];
    for (let d = 0; d < D; d++) {
      const list = [];
      for (let p = 0; p < P; p++) {
        if (!fitsDay(college, p, c.length)) continue;
        let free = true;
        for (let q = p; q < p + c.length; q++) if (unavailable.has(`${d}-${q}`)) free = false;
        if (free) list.push(p);
      }
      starts.push(list);
    }
    const openSlots = starts.reduce((a, x) => a + x.length, 0);
    const demand = teacherDemand.get(c.teacherId) || 0;
    return {
      ...l,
      course: c,
      teacherId: c.teacherId,
      sectionId: c.sectionId,
      batch: c.batch,
      size,
      rooms,
      unavailable,
      starts,
      maxPerDay: t ? t.maxPerDay : 0,
      dayCap: courseDayCap(c, D),
      broken: !t ? 'it has no teacher' : !s ? 'it has no section' : !rooms.length ? 'no room fits it' : '',
      // Higher = harder = placed earlier.
      difficulty: c.length * 4 + (demand / Math.max(1, openSlots)) * 6 + 8 / Math.max(1, rooms.length) + (c.fixedRoomId ? 3 : 0),
    };
  });
}

/** Occupancy of teachers, rooms and sections for one (partial) timetable. */
export class Board {
  constructor(data) {
    this.data = data;
    this.D = data.college.days.length;
    this.P = data.college.periods.length;
    this.teacher = new Map();
    this.room = new Map();
    this.section = new Map();
    this.tDay = new Map();
    this.cDay = new Map();
    this.placed = new Map();
    this.locked = new Set();
  }

  dayCapsOk(l, d) {
    return (this.cDay.get(`${l.courseId}|${d}`) || 0) < l.dayCap && (this.tDay.get(`${l.teacherId}|${d}`) || 0) + l.length <= l.maxPerDay;
  }

  teacherFree(l, d, p) {
    for (let q = p; q < p + l.length; q++) if (this.teacher.has(`${l.teacherId}|${d}|${q}`)) return false;
    return true;
  }

  sectionFree(l, d, p) {
    for (let q = p; q < p + l.length; q++) {
      const list = this.section.get(`${l.sectionId}|${d}|${q}`);
      if (list) for (const e of list) if (!e.batch || !l.batch || e.batch === l.batch) return false;
    }
    return true;
  }

  roomFree(roomId, d, p, length) {
    for (let q = p; q < p + length; q++) if (this.room.has(`${roomId}|${d}|${q}`)) return false;
    return true;
  }

  /** Lessons that stop `l` from going to (d, p, roomId). */
  blockers(l, d, p, roomId) {
    const out = new Set();
    for (let q = p; q < p + l.length; q++) {
      const t = this.teacher.get(`${l.teacherId}|${d}|${q}`);
      if (t) out.add(t);
      const r = this.room.get(`${roomId}|${d}|${q}`);
      if (r) out.add(r);
      const list = this.section.get(`${l.sectionId}|${d}|${q}`);
      if (list) for (const e of list) if (!e.batch || !l.batch || e.batch === l.batch) out.add(e.id);
    }
    return out;
  }

  place(l, d, p, roomId, locked = false) {
    for (let q = p; q < p + l.length; q++) {
      this.teacher.set(`${l.teacherId}|${d}|${q}`, l.id);
      this.room.set(`${roomId}|${d}|${q}`, l.id);
      const k = `${l.sectionId}|${d}|${q}`;
      if (!this.section.has(k)) this.section.set(k, []);
      this.section.get(k).push({ id: l.id, batch: l.batch });
    }
    bump(this.tDay, `${l.teacherId}|${d}`, l.length);
    bump(this.cDay, `${l.courseId}|${d}`, 1);
    this.placed.set(l.id, { lesson: l, day: d, period: p, roomId });
    if (locked) this.locked.add(l.id);
  }

  remove(id) {
    const pl = this.placed.get(id);
    if (!pl) return null;
    const { lesson: l, day: d, period: p, roomId } = pl;
    for (let q = p; q < p + l.length; q++) {
      this.teacher.delete(`${l.teacherId}|${d}|${q}`);
      this.room.delete(`${roomId}|${d}|${q}`);
      const k = `${l.sectionId}|${d}|${q}`;
      const list = (this.section.get(k) || []).filter((e) => e.id !== id);
      if (list.length) this.section.set(k, list);
      else this.section.delete(k);
    }
    bump(this.tDay, `${l.teacherId}|${d}`, -l.length);
    bump(this.cDay, `${l.courseId}|${d}`, -1);
    this.placed.delete(id);
    this.locked.delete(id);
    return pl;
  }

  sectionDay(sectionId, d) {
    const occ = new Array(this.P).fill(false);
    for (let p = 0; p < this.P; p++) if (this.section.has(`${sectionId}|${d}|${p}`)) occ[p] = true;
    return occ;
  }

  /** Penalty for putting `l` at (d, p) ignoring the room. Lower is better. */
  slotPenalty(l, d, p) {
    const occ = this.sectionDay(l.sectionId, d);
    const before = gapsIn(occ);
    const load = occ.filter(Boolean).length;
    for (let q = p; q < p + l.length; q++) occ[q] = true;
    let pen = (gapsIn(occ) - before) * 4 + load * 0.7 + (this.tDay.get(`${l.teacherId}|${d}`) || 0) * 0.5;
    if (p + l.length === this.P) pen += 1.5;
    pen += p * 0.05;
    // Split labs should run exactly side by side so the other half of the class is not left idle.
    if (l.batch) {
      let aligned = false;
      let partial = false;
      for (let q = p; q < p + l.length; q++) {
        for (const e of this.section.get(`${l.sectionId}|${d}|${q}`) || []) {
          const other = this.placed.get(e.id);
          if (other && other.period === p && other.lesson.length === l.length) aligned = true;
          else partial = true;
        }
      }
      pen += aligned && !partial ? -3 : partial ? 2.5 : 1;
    }
    let run = l.length;
    for (let q = p - 1; q >= 0 && this.teacher.has(`${l.teacherId}|${d}|${q}`); q--) run++;
    for (let q = p + l.length; q < this.P && this.teacher.has(`${l.teacherId}|${d}|${q}`); q++) run++;
    if (run > 3) pen += (run - 3) * 2;
    return pen;
  }

  /** Best legal (day, period, room) for `l`, or null. */
  best(l, rng, noise) {
    let best = null;
    for (let d = 0; d < this.D; d++) {
      if (!this.dayCapsOk(l, d)) continue;
      for (const p of l.starts[d]) {
        if (!this.teacherFree(l, d, p) || !this.sectionFree(l, d, p)) continue;
        let room = null;
        let roomPen = Infinity;
        for (const r of l.rooms) {
          if (!this.roomFree(r.id, d, p, l.length)) continue;
          const rp = ((r.capacity - l.size) / Math.max(1, r.capacity)) * 0.8;
          if (rp < roomPen) {
            roomPen = rp;
            room = r;
          }
        }
        if (!room) continue;
        const pen = this.slotPenalty(l, d, p) + roomPen + (noise ? rng() * noise : 0);
        if (!best || pen < best.pen) best = { d, p, roomId: room.id, pen };
      }
    }
    return best;
  }

  toPlacements() {
    return [...this.placed.values()].map(({ lesson, day, period, roomId }) => ({
      lessonId: lesson.id, courseId: lesson.courseId, day, period, roomId,
    }));
  }
}

function bump(map, key, by) {
  const n = (map.get(key) || 0) + by;
  if (n) map.set(key, n);
  else map.delete(key);
}

/** Try to fit `l` by moving one or two lessons out of its way. */
function repair(board, l, rng) {
  const cands = [];
  for (let d = 0; d < board.D; d++) {
    if (!board.dayCapsOk(l, d)) continue;
    for (const p of l.starts[d]) {
      for (const r of l.rooms) {
        const bl = board.blockers(l, d, p, r.id);
        if (bl.size === 0 || bl.size > 2) continue;
        if ([...bl].some((id) => board.locked.has(id))) continue;
        cands.push({ d, p, roomId: r.id, bl });
      }
    }
  }
  shuffle(cands, rng);
  for (const cand of cands.slice(0, 60)) {
    const saved = [...cand.bl].map((id) => board.remove(id));
    if (board.dayCapsOk(l, cand.d) && board.blockers(l, cand.d, cand.p, cand.roomId).size === 0) {
      board.place(l, cand.d, cand.p, cand.roomId);
      const moved = [];
      let ok = true;
      for (const s of saved) {
        const b = board.best(s.lesson, rng, 0);
        if (!b) {
          ok = false;
          break;
        }
        board.place(s.lesson, b.d, b.p, b.roomId);
        moved.push(s.lesson.id);
      }
      if (ok) return true;
      for (const id of moved) board.remove(id);
      board.remove(l.id);
    }
    for (const s of saved) board.place(s.lesson, s.day, s.period, s.roomId);
  }
  return false;
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function attempt(data, lessons, locked, rng, noise) {
  const board = new Board(data);
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const unplaced = [];
  for (const pl of locked) {
    const l = byId.get(pl.lessonId);
    if (!l || l.broken) continue;
    const okRoom = l.rooms.some((r) => r.id === pl.roomId);
    if (okRoom && l.starts[pl.day] && l.starts[pl.day].includes(pl.period) && board.dayCapsOk(l, pl.day)
      && board.blockers(l, pl.day, pl.period, pl.roomId).size === 0) {
      board.place(l, pl.day, pl.period, pl.roomId, true);
    }
  }
  const order = lessons
    .filter((l) => !board.placed.has(l.id))
    .map((l) => ({ l, k: l.difficulty + (noise ? rng() * 3 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.l);
  for (const l of order) {
    if (l.broken) {
      unplaced.push(l);
      continue;
    }
    const b = board.best(l, rng, noise);
    if (b) board.place(l, b.d, b.p, b.roomId);
    else unplaced.push(l);
  }
  for (let pass = 0; pass < 3 && unplaced.length; pass++) {
    for (let i = unplaced.length - 1; i >= 0; i--) {
      if (!unplaced[i].broken && repair(board, unplaced[i], rng)) unplaced.splice(i, 1);
    }
  }
  return { board, unplaced };
}

/**
 * Generate a timetable.
 * @param data     college data (see model.js)
 * @param opts     { seed, timeLimitMs, maxAttempts, locked: placements to keep exactly where they are }
 * @returns { placements, unplaced: [{ lessonId, courseId, reason }], precheck, metrics, validation, stats }
 */
export function solve(data, opts = {}) {
  const t0 = Date.now();
  const timeLimit = opts.timeLimitMs ?? 2500;
  const maxAttempts = opts.maxAttempts ?? 400;
  const rng = makeRng(opts.seed ?? 20261027);
  const lessons = buildLessons(data);
  const locked = opts.locked || [];
  const pre = precheck(data);

  let best = null;
  let attempts = 0;
  let sinceBetter = 0;
  while (attempts < maxAttempts) {
    const res = attempt(data, lessons, locked, rng, attempts === 0 ? 0 : 1.2);
    attempts++;
    res.placements = res.board.toPlacements();
    res.score = metrics(data, res.placements).score;
    sinceBetter++;
    if (!best || res.unplaced.length < best.unplaced.length || (res.unplaced.length === best.unplaced.length && res.score < best.score)) {
      best = res;
      sinceBetter = 0;
    }
    if (Date.now() - t0 > timeLimit && attempts >= 3) break;
    // A complete timetable that has stopped improving is good enough.
    if (!best.unplaced.length && sinceBetter >= 60) break;
    if (opts.onProgress && attempts % 5 === 0) opts.onProgress({ attempts, unplaced: best.unplaced.length, score: best.score });
  }

  const unplaced = best.unplaced.map((l) => ({ lessonId: l.id, courseId: l.courseId, reason: diagnose(data, best.board, l) }));
  return {
    placements: best.placements,
    unplaced,
    precheck: pre,
    metrics: metrics(data, best.placements),
    validation: validate(data, best.placements),
    stats: { attempts, ms: Date.now() - t0, lessons: lessons.length },
  };
}

/** Plain-language reason why a lesson could not be placed on the final board. */
export function diagnose(data, board, l) {
  const c = l.course;
  const name = `${courseLabel(c)} for ${sectionLabel(data.sections.find((s) => s.id === c.sectionId), c)}`;
  if (l.broken) return `${name} cannot be scheduled because ${l.broken}.`;
  const counts = { unavailable: 0, limits: 0, teacher: 0, section: 0, rooms: 0 };
  let windows = 0;
  for (let d = 0; d < board.D; d++) {
    for (let p = 0; p < board.P; p++) {
      if (!fitsDay(data.college, p, l.length)) continue;
      windows++;
      if (!l.starts[d].includes(p)) counts.unavailable++;
      else if (!board.dayCapsOk(l, d)) counts.limits++;
      else if (!board.teacherFree(l, d, p)) counts.teacher++;
      else if (!board.sectionFree(l, d, p)) counts.section++;
      else counts.rooms++;
    }
  }
  if (!windows) return `${name} needs ${l.length} periods in a row, which never fit between breaks.`;
  const parts = [];
  if (counts.unavailable) parts.push(`teacher marked unavailable in ${counts.unavailable}`);
  if (counts.teacher) parts.push(`teacher already teaching in ${counts.teacher}`);
  if (counts.section) parts.push(`class already busy in ${counts.section}`);
  if (counts.rooms) parts.push(`every suitable room (${l.rooms.map((r) => r.name).join(', ')}) taken in ${counts.rooms}`);
  if (counts.limits) parts.push(`daily limit reached (teacher max per day, or subject already that day) in ${counts.limits}`);
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  const tip = {
    unavailable: 'Free up some of the teacher\'s unavailable periods.',
    teacher: 'Give some of this teacher\'s classes to a colleague.',
    section: 'This class has a very full week; add periods to the day or reduce hours.',
    rooms: `Add another ${c.roomType} room, or mark an existing one as shared.`,
    limits: 'Raise the teacher\'s maximum periods per day.',
  }[top];
  return `${name} (${l.length} period${l.length > 1 ? 's' : ''}): no legal slot left. Of ${windows} possible slots: ${parts.join('; ')}. Tip: ${tip}`;
}

/**
 * Checks that make a timetable impossible before any solving starts.
 * errors block a clean result; warnings are tight spots worth knowing about.
 */
export function precheck(data) {
  const ix = indexData(data);
  const { college } = data;
  const D = college.days.length;
  const P = college.periods.length;
  const errors = [];
  const warnings = [];
  if (!D) errors.push('Choose at least one teaching day in Setup.');
  if (!P) errors.push('Add at least one period in Setup.');
  if (!data.courses.length) errors.push('Add the subjects each class studies on the Subjects tab.');
  const block = longestBlock(college);

  for (const c of data.courses) {
    const s = ix.section.get(c.sectionId);
    const t = ix.teacher.get(c.teacherId);
    const name = `${courseLabel(c)} for ${sectionLabel(s, c)}`;
    if (!s) errors.push(`${name}: choose which class (section) takes it.`);
    if (!t) errors.push(`${name}: choose a teacher.`);
    if (c.length > block) errors.push(`${name} needs ${c.length} periods in a row, but the longest run between breaks is ${block}.`);
    if (t && c.length > t.maxPerDay) errors.push(`${name} is ${c.length} periods long but ${t.name} may teach only ${t.maxPerDay} a day.`);
    if (s) {
      const size = groupSize(data, c, s);
      if (c.fixedRoomId && !ix.room.get(c.fixedRoomId)) errors.push(`${name}: its fixed room no longer exists.`);
      else if (!allowedRooms(data, c, s).length) {
        const why = data.rooms.length
          ? data.rooms.map((r) => `${r.name} ${roomProblem(r, c, s, size)}`).slice(0, 4).join('; ')
          : 'there are no rooms yet';
        errors.push(`${name}: no room fits ${size} students in a ${c.roomType} (${why}).`);
      }
    }
  }

  for (const t of data.teachers) {
    const need = data.courses.filter((c) => c.teacherId === t.id).reduce((a, c) => a + c.sessions * c.length, 0);
    if (!need) continue;
    const open = D * P - t.unavailable.length;
    const cap = Math.min(open, t.maxPerDay * D);
    if (need > cap) errors.push(`${t.name} must teach ${need} periods a week but can teach at most ${cap} (availability and ${t.maxPerDay}/day limit).`);
    else if (need > cap * 0.9) warnings.push(`${t.name} is almost fully booked: ${need} of ${cap} possible periods.`);
  }

  for (const s of data.sections) {
    const mine = data.courses.filter((c) => c.sectionId === s.id);
    const whole = mine.filter((c) => !c.batch).reduce((a, c) => a + c.sessions * c.length, 0);
    const perBatch = new Map();
    for (const c of mine.filter((x) => x.batch)) perBatch.set(c.batch, (perBatch.get(c.batch) || 0) + c.sessions * c.length);
    const need = whole + Math.max(0, ...perBatch.values());
    if (need > D * P) errors.push(`${s.name} needs ${need} periods a week but the week has only ${D * P}.`);
    else if (need > D * P * 0.9) warnings.push(`${s.name} has an almost full week: ${need} of ${D * P} periods.`);
  }

  const typeNeed = new Map();
  for (const c of data.courses) {
    const key = c.fixedRoomId ? `room:${c.fixedRoomId}` : c.roomType.toLowerCase();
    typeNeed.set(key, (typeNeed.get(key) || 0) + c.sessions * c.length);
  }
  for (const [key, need] of typeNeed) {
    if (key.startsWith('room:')) {
      const r = ix.room.get(key.slice(5));
      if (r && need > D * P) errors.push(`${r.name} is fixed for ${need} periods but the week has only ${D * P}.`);
      continue;
    }
    const rooms = data.rooms.filter((r) => r.type.toLowerCase() === key);
    const have = rooms.length * D * P;
    if (rooms.length && need > have) errors.push(`Subjects need ${need} periods in ${rooms[0].type} rooms but ${rooms.length} such room(s) give only ${have}.`);
    else if (rooms.length && need > have * 0.85) warnings.push(`${rooms[0].type} rooms are ${Math.round((need / have) * 100)}% booked; scheduling will be tight.`);
  }
  return { errors, warnings };
}
