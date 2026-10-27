import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize } from '../js/model.js';
import { solve, precheck } from '../js/solver.js';
import { validate } from '../js/validate.js';
import { moveChecker, substitutes, freeRooms } from '../js/tools.js';

const load = (name) => normalize(JSON.parse(readFileSync(new URL(`../samples/${name}.json`, import.meta.url), 'utf8')));

for (const name of ['small', 'demo', 'large']) {
  test(`${name} sample: every lesson placed with zero clashes`, () => {
    const data = load(name);
    const r = solve(data, { timeLimitMs: 1500 });
    assert.equal(r.precheck.errors.length, 0, r.precheck.errors.join('\n'));
    assert.equal(r.unplaced.length, 0, r.unplaced.map((u) => u.reason).join('\n'));
    const v = validate(data, r.placements);
    assert.deepEqual(v.hard.map((h) => h.message), []);
    assert.equal(v.missing.length, 0);
  });
}

test('same seed gives the same timetable', () => {
  const data = load('small');
  const a = solve(data, { seed: 7, maxAttempts: 20, timeLimitMs: 60000 });
  const b = solve(data, { seed: 7, maxAttempts: 20, timeLimitMs: 60000 });
  assert.deepEqual(a.placements, b.placements);
});

test('split labs of one class run side by side when they can', () => {
  const data = load('demo');
  const r = solve(data, { timeLimitMs: 1500 });
  const lab = (code, batch) => r.placements.filter((p) => {
    const c = data.courses.find((x) => x.id === p.courseId);
    return c.sectionId === 's-cse-3a' && c.code === code && c.batch === batch;
  });
  const g1 = lab('CS-311', 'G1').concat(lab('CS-313', 'G1'));
  const g2 = lab('CS-311', 'G2').concat(lab('CS-313', 'G2'));
  const slots = (list) => new Set(list.map((p) => `${p.day}-${p.period}`));
  const shared = [...slots(g1)].filter((s) => slots(g2).has(s));
  assert.ok(shared.length >= 1, 'expected at least one G1 lab to run alongside a G2 lab');
});

test('locked lessons stay where the admin put them', () => {
  const data = load('demo');
  const first = solve(data, { timeLimitMs: 800 });
  const pin = first.placements.find((p) => p.courseId === 'c-cse-3a-cs-301');
  const moved = { ...pin, day: (pin.day + 1) % 5 };
  const check = moveChecker(data, first.placements, pin.lessonId)(moved.day, moved.period);
  const locked = check.ok ? [{ ...moved, roomId: check.roomId }] : [pin];
  const again = solve(data, { timeLimitMs: 800, locked });
  const kept = again.placements.find((p) => p.lessonId === locked[0].lessonId);
  assert.equal(kept.day, locked[0].day);
  assert.equal(kept.period, locked[0].period);
  assert.equal(again.validation.hard.length, 0);
});

test('precheck explains impossible data in plain language', () => {
  const { errors } = precheck(load('impossible'));
  const text = errors.join('\n');
  assert.match(text, /must teach 20 periods a week but can teach at most 15/);
  assert.match(text, /no room fits 120 students/);
  assert.match(text, /needs 5 periods in a row/);
});

test('unplaceable lessons come back with a reason, never silently dropped', () => {
  const data = load('impossible');
  const r = solve(data, { timeLimitMs: 500 });
  assert.ok(r.unplaced.length > 0);
  for (const u of r.unplaced) assert.ok(u.reason.length > 20, u.reason);
  assert.equal(r.validation.hard.length, 0);
});

function tiny() {
  return normalize({
    college: { name: 'T', days: ['Mon', 'Tue'], periods: [{}, {}, {}, {}], breaks: [1] },
    rooms: [
      { id: 'r1', name: 'R1', type: 'Classroom', capacity: 60 },
      { id: 'r2', name: 'R2', type: 'Classroom', capacity: 30, dept: 'ME' },
      { id: 'l1', name: 'L1', type: 'Lab', capacity: 30 },
      { id: 'l2', name: 'L2', type: 'Lab', capacity: 30 },
    ],
    teachers: [
      { id: 't1', name: 'A', dept: 'CSE', maxPerDay: 2, unavailable: ['1-3'] },
      { id: 't2', name: 'B', dept: 'CSE', maxPerDay: 4 },
      { id: 't3', name: 'C', dept: 'CSE', maxPerDay: 4 },
    ],
    sections: [{ id: 's1', name: 'S1', dept: 'CSE', size: 50 }, { id: 's2', name: 'S2', dept: 'CSE', size: 50 }],
    courses: [
      { id: 'c1', sectionId: 's1', subject: 'Maths', teacherId: 't1', sessions: 2, roomType: 'Classroom' },
      { id: 'c2', sectionId: 's2', subject: 'Physics', teacherId: 't2', sessions: 2, roomType: 'Classroom' },
      { id: 'g1', sectionId: 's1', batch: 'G1', subject: 'Lab', teacherId: 't2', sessions: 1, length: 2, roomType: 'Lab' },
      { id: 'g2', sectionId: 's1', batch: 'G2', subject: 'Lab', teacherId: 't3', sessions: 1, length: 2, roomType: 'Lab' },
    ],
  });
}
const P = (courseId, day, period, roomId, k = 0) => ({ lessonId: `${courseId}#${k}`, courseId, day, period, roomId });
const types = (data, pls) => validate(data, pls).hard.map((h) => h.type);

test('validator: a teacher in two places at once is a clash', () => {
  const data = tiny();
  data.courses[1].teacherId = 't1';
  assert.ok(types(data, [P('c1', 0, 0, 'r1'), P('c2', 0, 0, 'l1')]).includes('teacher-clash'));
});

test('validator: two classes in one room is a clash', () => {
  assert.ok(types(tiny(), [P('c1', 0, 0, 'r1'), P('c2', 0, 0, 'r1')]).includes('room-clash'));
});

test('validator: one section in two classes is a clash, but two batches in parallel are fine', () => {
  const data = tiny();
  assert.ok(types(data, [P('c1', 0, 0, 'r1'), P('g1', 0, 0, 'l1')]).includes('section-clash'));
  assert.deepEqual(types(data, [P('g1', 0, 2, 'l1'), P('g2', 0, 2, 'l2')]), []);
});

test('validator: lab across lunch, unavailable teacher, small room, other department room', () => {
  const data = tiny();
  assert.ok(types(data, [P('g1', 0, 1, 'l1')]).includes('bad-slot'));
  assert.ok(types(data, [P('c1', 1, 3, 'r1')]).includes('teacher-unavailable'));
  assert.ok(types(data, [P('c1', 0, 0, 'r2')]).includes('room-unsuitable'));
});

test('validator: teacher daily limit', () => {
  const data = tiny();
  data.courses[0].sessions = 3;
  assert.ok(types(data, [P('c1', 0, 0, 'r1', 0), P('c1', 0, 1, 'r1', 1), P('c1', 0, 2, 'r1', 2)]).includes('teacher-overload'));
});

test('move checker explains why a slot is not allowed', () => {
  const data = tiny();
  const pls = [P('c1', 0, 0, 'r1'), P('c1', 1, 0, 'r1', 1), P('g1', 0, 2, 'l1'), P('g2', 0, 2, 'l2'), P('c2', 0, 1, 'r1'), P('c2', 1, 1, 'r1', 1)];
  const check = moveChecker(data, pls, 'c1#0');
  assert.match(check(0, 2).reason, /already has a class/);
  assert.match(check(1, 3).reason, /unavailable/);
  assert.match(check(1, 1).reason, /already happens that day/);
  assert.match(check(0, 1).reason, /No Classroom room is free/);
  const freed = moveChecker(data, pls.filter((p) => p.lessonId !== 'c2#0'), 'c1#0')(0, 1);
  assert.deepEqual(freed, { ok: true, roomId: 'r1' });
});

test('substitutes are free, under their limit, and same department first', () => {
  const data = tiny();
  const pls = [P('c1', 0, 0, 'r1'), P('c2', 0, 0, 'r2')];
  const subs = substitutes(data, pls, 't1', 0);
  assert.equal(subs.length, 1);
  const names = subs[0].options.map((o) => o.teacher.name);
  assert.ok(!names.includes('B'), 'B is teaching at that time');
  assert.ok(names.includes('C'));
});

test('free rooms excludes rooms in use', () => {
  const data = tiny();
  const rooms = freeRooms(data, [P('c1', 0, 0, 'r1')], 0, 0).map((r) => r.id);
  assert.ok(!rooms.includes('r1'));
  assert.ok(rooms.includes('l1'));
});
