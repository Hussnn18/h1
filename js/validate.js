/**
 * Independent clash checker and quality metrics for a finished timetable.
 * It re-checks every hard rule from scratch and never trusts the solver, so the
 * "0 clashes" badge in the UI (and the tests) mean what they say.
 */
import {
  indexData, fitsDay, groupSize, roomProblem, courseDayCap, courseLabel, sectionLabel, periodLabel, batchCount,
} from './model.js';

/**
 * @returns {{ ok: boolean, hard: Issue[], soft: Issue[], missing: Issue[] }}
 *   hard:    clashes and broken rules (must be zero)
 *   soft:    allowed but worth a look (same subject twice in a day)
 *   missing: sessions that are not in the timetable yet
 */
export function validate(data, placements) {
  const ix = indexData(data);
  const { college } = data;
  const D = college.days.length;
  const hard = [];
  const soft = [];
  const missing = [];
  const teacherAt = new Map();
  const roomAt = new Map();
  const sectionAt = new Map();
  const teacherDay = new Map();
  const courseDay = new Map();
  const placedCount = new Map();
  const when = (d, p) => `${college.days[d] || '?'} ${periodLabel(college, p)}`;

  for (const pl of placements) {
    const c = ix.course.get(pl.courseId);
    if (!c) {
      hard.push(issue('unknown-course', `A lesson refers to a subject that no longer exists (${pl.courseId}).`, pl));
      continue;
    }
    const t = ix.teacher.get(c.teacherId);
    const s = ix.section.get(c.sectionId);
    const r = ix.room.get(pl.roomId);
    const name = `${courseLabel(c)} for ${sectionLabel(s, c)}`;
    placedCount.set(c.id, (placedCount.get(c.id) || 0) + 1);

    if (pl.day < 0 || pl.day >= D || !fitsDay(college, pl.period, c.length)) {
      hard.push(issue('bad-slot', `${name} at ${when(pl.day, pl.period)} runs past the end of the day or across a break.`, pl));
    }
    if (!t) hard.push(issue('no-teacher', `${name} has no teacher.`, pl));
    if (!s) hard.push(issue('no-section', `${name} has no section.`, pl));
    if (!r) {
      hard.push(issue('no-room', `${name} at ${when(pl.day, pl.period)} has no room.`, pl));
    } else {
      const why = roomProblem(r, c, s, groupSize(data, c, s));
      if (why) hard.push(issue('room-unsuitable', `${name} is in ${r.name}, which ${why}.`, pl));
    }

    for (let q = pl.period; q < pl.period + c.length; q++) {
      if (t) {
        if (t.unavailable.includes(`${pl.day}-${q}`)) {
          hard.push(issue('teacher-unavailable', `${t.name} is marked unavailable at ${when(pl.day, q)} but teaches ${name}.`, pl));
        }
        const tk = `${t.id}|${pl.day}|${q}`;
        const other = teacherAt.get(tk);
        if (other) hard.push(issue('teacher-clash', `${t.name} is double-booked at ${when(pl.day, q)}: ${describe(ix, other)} and ${name}.`, pl));
        else teacherAt.set(tk, pl);
      }
      if (r) {
        const rk = `${r.id}|${pl.day}|${q}`;
        const other = roomAt.get(rk);
        if (other) hard.push(issue('room-clash', `${r.name} is double-booked at ${when(pl.day, q)}: ${describe(ix, other)} and ${name}.`, pl));
        else roomAt.set(rk, pl);
      }
      if (s) {
        const sk = `${s.id}|${pl.day}|${q}`;
        const list = sectionAt.get(sk) || [];
        for (const o of list) {
          const oc = ix.course.get(o.courseId);
          if (!oc.batch || !c.batch || oc.batch === c.batch) {
            hard.push(issue('section-clash', `${sectionLabel(s, c)} has two classes at ${when(pl.day, q)}: ${describe(ix, o)} and ${name}.`, pl));
          }
        }
        list.push(pl);
        sectionAt.set(sk, list);
      }
    }
    if (t) {
      const k = `${t.id}|${pl.day}`;
      teacherDay.set(k, (teacherDay.get(k) || 0) + c.length);
    }
    const ck = `${c.id}|${pl.day}`;
    courseDay.set(ck, (courseDay.get(ck) || 0) + 1);
  }

  for (const t of data.teachers) {
    for (let d = 0; d < D; d++) {
      const n = teacherDay.get(`${t.id}|${d}`) || 0;
      if (n > t.maxPerDay) hard.push(issue('teacher-overload', `${t.name} teaches ${n} periods on ${college.days[d]}, above the limit of ${t.maxPerDay}.`));
    }
  }
  for (const c of data.courses) {
    const s = ix.section.get(c.sectionId);
    const cap = courseDayCap(c, D);
    for (let d = 0; d < D; d++) {
      const n = courseDay.get(`${c.id}|${d}`) || 0;
      if (n > cap) soft.push(issue('repeat-day', `${courseLabel(c)} for ${sectionLabel(s, c)} happens ${n} times on ${college.days[d]}.`));
    }
    const have = placedCount.get(c.id) || 0;
    if (have < c.sessions) missing.push(issue('missing', `${courseLabel(c)} for ${sectionLabel(s, c)}: ${have} of ${c.sessions} sessions placed.`, { courseId: c.id }));
    if (have > c.sessions) hard.push(issue('extra', `${courseLabel(c)} for ${sectionLabel(s, c)} has ${have} sessions but needs ${c.sessions}.`, { courseId: c.id }));
  }
  return { ok: hard.length === 0, hard, soft, missing };
}

function issue(type, message, ref) {
  return { type, message, ref: ref || null };
}

function describe(ix, pl) {
  const c = ix.course.get(pl.courseId);
  return c ? `${courseLabel(c)} (${sectionLabel(ix.section.get(c.sectionId), c)})` : 'another class';
}

/** Gaps inside a day: free periods between a section's first and last class. */
export function gapsIn(occupied) {
  let first = -1;
  let last = -1;
  let count = 0;
  occupied.forEach((on, p) => {
    if (!on) return;
    if (first < 0) first = p;
    last = p;
    count++;
  });
  return first < 0 ? 0 : last - first + 1 - count;
}

/**
 * Quality numbers shown on the Generate screen. `score` is what the solver minimises
 * when it compares restarts (lower is better).
 */
export function metrics(data, placements) {
  const ix = indexData(data);
  const { college } = data;
  const D = college.days.length;
  const P = college.periods.length;
  const secOcc = new Map();
  const teacherLoad = new Map(data.teachers.map((t) => [t.id, 0]));
  const teacherDay = new Map();
  const roomLoad = new Map(data.rooms.map((r) => [r.id, 0]));
  const batchesAt = new Map();
  let lastPeriod = 0;

  for (const pl of placements) {
    const c = ix.course.get(pl.courseId);
    if (!c) continue;
    if (pl.period + c.length === P) lastPeriod++;
    if (c.batch) {
      for (let q = pl.period; q < pl.period + c.length; q++) {
        const k = `${c.sectionId}|${pl.day}|${q}`;
        if (!batchesAt.has(k)) batchesAt.set(k, new Set());
        batchesAt.get(k).add(c.batch);
      }
    }
    teacherLoad.set(c.teacherId, (teacherLoad.get(c.teacherId) || 0) + c.length);
    const tk = `${c.teacherId}|${pl.day}`;
    teacherDay.set(tk, (teacherDay.get(tk) || 0) + c.length);
    roomLoad.set(pl.roomId, (roomLoad.get(pl.roomId) || 0) + c.length);
    const sk = `${c.sectionId}|${pl.day}`;
    if (!secOcc.has(sk)) secOcc.set(sk, new Array(P).fill(false));
    const occ = secOcc.get(sk);
    for (let q = pl.period; q < pl.period + c.length && q < P; q++) occ[q] = true;
  }

  let gaps = 0;
  let imbalance = 0;
  for (const s of data.sections) {
    const loads = [];
    for (let d = 0; d < D; d++) {
      const occ = secOcc.get(`${s.id}|${d}`);
      gaps += occ ? gapsIn(occ) : 0;
      loads.push(occ ? occ.filter(Boolean).length : 0);
    }
    imbalance += spread(loads);
  }
  let teacherImbalance = 0;
  let maxTeacherDay = 0;
  for (const t of data.teachers) {
    const loads = [];
    for (let d = 0; d < D; d++) {
      const n = teacherDay.get(`${t.id}|${d}`) || 0;
      loads.push(n);
      maxTeacherDay = Math.max(maxTeacherDay, n);
    }
    teacherImbalance += spread(loads);
  }
  // Periods where one batch of a split class is in a lab and another batch has nothing to do.
  let idleBatch = 0;
  const batchTotal = new Map(data.sections.map((s) => [s.id, batchCount(data, s.id)]));
  for (const [k, set] of batchesAt) idleBatch += Math.max(0, batchTotal.get(k.split('|')[0]) - set.size);

  const slots = D * P;
  const used = [...roomLoad.values()].reduce((a, b) => a + b, 0);
  const roomUtil = data.rooms.length ? used / (data.rooms.length * slots) : 0;
  const score = gaps * 4 + lastPeriod * 0.5 + imbalance * 1.5 + teacherImbalance * 1 + idleBatch * 1;
  return {
    gaps,
    idleBatch,
    lastPeriod,
    imbalance: round(imbalance),
    teacherImbalance: round(teacherImbalance),
    maxTeacherDay,
    roomUtil,
    teacherLoad: Object.fromEntries(teacherLoad),
    roomLoad: Object.fromEntries(roomLoad),
    slots,
    score: round(score),
  };
}

/** Standard deviation: 0 when every day carries the same load. */
function spread(values) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

function round(x) {
  return Math.round(x * 100) / 100;
}
