/**
 * Writes the test datasets in samples/. All colleges, people and rooms are fictional.
 *   node scripts/make-samples.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { emptyData, normalize } from '../js/model.js';

const ALL_DAY = (d) => [0, 1, 2, 3, 4, 5, 6, 7].map((p) => `${d}-${p}`);

function builder(name) {
  const data = emptyData();
  data.college.name = name;
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const api = {
    data,
    room(name, type, capacity, dept = '') {
      data.rooms.push({ id: `r-${slug(name)}`, name, type, capacity, dept });
      return `r-${slug(name)}`;
    },
    teacher(name, dept, maxPerDay = 5, unavailable = []) {
      data.teachers.push({ id: `t-${slug(name)}`, name, dept, maxPerDay, unavailable });
      return `t-${slug(name)}`;
    },
    section(name, dept, size) {
      data.sections.push({ id: `s-${slug(name)}`, name, dept, size });
      return `s-${slug(name)}`;
    },
    /** subject(sectionId, code, name, teacherId, sessions, { length, roomType, batch, fixedRoomId }) */
    subject(sectionId, code, subject, teacherId, sessions, o = {}) {
      const batch = o.batch || '';
      const id = `c-${sectionId.slice(2)}-${slug(code)}${batch ? '-' + slug(batch) : ''}`;
      data.courses.push({
        id, sectionId, batch, subject, code, teacherId, sessions,
        length: o.length || 1, roomType: o.roomType || 'Classroom', fixedRoomId: o.fixedRoomId || '',
      });
    },
  };
  return api;
}

/** The main demo: four departments competing for shared halls and labs. */
function demo() {
  const b = builder('Demo Engineering College, Ludhiana');
  const { room, teacher: T, section: S, subject } = b;
  ['CR-101', 'CR-102', 'CR-103'].forEach((n) => room(n, 'Classroom', 70, 'CSE'));
  ['CR-201', 'CR-202'].forEach((n) => room(n, 'Classroom', 70, 'ECE'));
  room('CR-301', 'Classroom', 70, 'ME');
  room('LT-1', 'Classroom', 130);
  room('Seminar Hall', 'Seminar Hall', 200);
  room('Lab C1', 'Computer Lab', 36, 'CSE');
  room('Lab C2', 'Computer Lab', 36, 'CSE');
  room('Computer Centre', 'Computer Lab', 40);
  room('Electronics Lab', 'Electronics Lab', 36, 'ECE');
  room('Comms Lab', 'Electronics Lab', 36, 'ECE');
  room('Workshop', 'Workshop', 36, 'ME');
  room('Physics Lab', 'Physics Lab', 36);

  const hk = T('Dr. Harpreet Kaur', 'CSE', 4, [4, 5, 6, 7].map((p) => `4-${p}`)); // Friday afternoon: dean's meeting
  const as = T('Prof. Amandeep Singh', 'CSE', 5);
  const ns = T('Dr. Neha Sharma', 'CSE', 5);
  const gs = T('Prof. Gurpreet Singh', 'CSE', 5);
  const sk = T('Ms. Simran Kaur', 'CSE', 4, [...ALL_DAY(3), ...ALL_DAY(4)]); // part-time, Mon-Wed only
  const rv = T('Mr. Rohit Verma', 'CSE', 5);
  const jg = T('Dr. Jaspreet Gill', 'CSE', 5);
  const ms = T('Dr. Manpreet Sandhu', 'ECE', 5);
  const ku = T('Prof. Kulwinder Singh', 'ECE', 5);
  const rb = T('Ms. Ritu Bansal', 'ECE', 5);
  const am = T('Mr. Arjun Mehta', 'ECE', 5);
  const bs = T('Dr. Baljit Singh', 'ME', 5, ALL_DAY(2)); // Wednesday: exam duty
  const rk = T('Prof. Rajesh Kumar', 'ME', 5);
  const id = T('Mr. Inderjit Dhillon', 'ME', 5);
  const sa = T('Dr. Sunita Arora', 'Applied Sciences', 5);
  const vm = T('Prof. Vikram Malhotra', 'Applied Sciences', 5, ['0-0', '0-1']); // Monday mornings off
  const pk = T('Dr. Pooja Khanna', 'Applied Sciences', 5);
  const kk = T('Ms. Kiranjot Kaur', 'Applied Sciences', 4);

  const lab = (roomType, length = 2) => ({ roomType, length });
  const c3a = S('CSE-3A', 'CSE', 64);
  subject(c3a, 'MATH-301', 'Engineering Mathematics III', vm, 4);
  subject(c3a, 'CS-301', 'Data Structures', hk, 4);
  subject(c3a, 'CS-303', 'Object Oriented Programming', as, 3);
  subject(c3a, 'CS-305', 'Discrete Mathematics', ns, 3);
  subject(c3a, 'EC-311', 'Digital Electronics', rb, 3);
  subject(c3a, 'HU-301', 'Communication Skills', kk, 2);
  subject(c3a, 'CS-311', 'Data Structures Lab', rv, 1, { ...lab('Computer Lab'), batch: 'G1' });
  subject(c3a, 'CS-311', 'Data Structures Lab', gs, 1, { ...lab('Computer Lab'), batch: 'G2' });
  subject(c3a, 'CS-313', 'OOP Lab', as, 1, { ...lab('Computer Lab'), batch: 'G1' });
  subject(c3a, 'CS-313', 'OOP Lab', sk, 1, { ...lab('Computer Lab'), batch: 'G2' });

  const c3b = S('CSE-3B', 'CSE', 62);
  subject(c3b, 'MATH-301', 'Engineering Mathematics III', sa, 4);
  subject(c3b, 'CS-301', 'Data Structures', gs, 4);
  subject(c3b, 'CS-303', 'Object Oriented Programming', jg, 3);
  subject(c3b, 'CS-305', 'Discrete Mathematics', ns, 3);
  subject(c3b, 'EC-311', 'Digital Electronics', rb, 3);
  subject(c3b, 'HU-301', 'Communication Skills', kk, 2);
  subject(c3b, 'CS-311', 'Data Structures Lab', rv, 1, { ...lab('Computer Lab'), batch: 'G1' });
  subject(c3b, 'CS-311', 'Data Structures Lab', hk, 1, { ...lab('Computer Lab'), batch: 'G2' });
  subject(c3b, 'CS-313', 'OOP Lab', jg, 1, { ...lab('Computer Lab'), batch: 'G1' });
  subject(c3b, 'CS-313', 'OOP Lab', sk, 1, { ...lab('Computer Lab'), batch: 'G2' });

  const c5a = S('CSE-5A', 'CSE', 60);
  subject(c5a, 'CS-501', 'Operating Systems', jg, 4);
  subject(c5a, 'CS-503', 'Database Management Systems', ns, 4);
  subject(c5a, 'CS-505', 'Computer Networks', as, 3);
  subject(c5a, 'CS-507', 'Software Engineering', gs, 3);
  subject(c5a, 'CS-509', 'Machine Learning', hk, 3);
  subject(c5a, 'CS-591', 'Seminar', rv, 1, { roomType: 'Seminar Hall' });
  subject(c5a, 'CS-513', 'DBMS Lab', rv, 1, { ...lab('Computer Lab'), batch: 'G1' });
  subject(c5a, 'CS-513', 'DBMS Lab', sk, 1, { ...lab('Computer Lab'), batch: 'G2' });
  subject(c5a, 'CS-515', 'Networks Lab', as, 1, { ...lab('Computer Lab'), batch: 'G1' });
  subject(c5a, 'CS-515', 'Networks Lab', jg, 1, { ...lab('Computer Lab'), batch: 'G2' });

  const e3a = S('ECE-3A', 'ECE', 60);
  subject(e3a, 'MATH-301', 'Engineering Mathematics III', sa, 4);
  subject(e3a, 'EC-301', 'Network Analysis', ms, 4);
  subject(e3a, 'EC-303', 'Electronic Devices', ku, 4);
  subject(e3a, 'EC-305', 'Signals and Systems', am, 3);
  subject(e3a, 'EC-311', 'Digital Electronics', rb, 3);
  subject(e3a, 'HU-301', 'Communication Skills', kk, 2);
  subject(e3a, 'EC-313', 'Devices Lab', ku, 1, { ...lab('Electronics Lab'), batch: 'G1' });
  subject(e3a, 'EC-313', 'Devices Lab', am, 1, { ...lab('Electronics Lab'), batch: 'G2' });

  const e5a = S('ECE-5A', 'ECE', 58);
  subject(e5a, 'EC-501', 'Communication Systems', ms, 4);
  subject(e5a, 'EC-503', 'Microprocessors', am, 4);
  subject(e5a, 'EC-505', 'VLSI Design', ku, 3);
  subject(e5a, 'EC-507', 'Control Systems', rb, 3);
  subject(e5a, 'EC-591', 'Seminar', ms, 1, { roomType: 'Seminar Hall' });
  subject(e5a, 'EC-511', 'Communication Lab', ms, 1, { ...lab('Electronics Lab'), batch: 'G1' });
  subject(e5a, 'EC-511', 'Communication Lab', rb, 1, { ...lab('Electronics Lab'), batch: 'G2' });
  subject(e5a, 'EC-513', 'Microprocessor Lab', am, 1, { ...lab('Electronics Lab'), batch: 'G1' });
  subject(e5a, 'EC-513', 'Microprocessor Lab', ku, 1, { ...lab('Electronics Lab'), batch: 'G2' });

  const m3a = S('ME-3A', 'ME', 60);
  subject(m3a, 'MATH-301', 'Engineering Mathematics III', vm, 4);
  subject(m3a, 'ME-301', 'Thermodynamics', bs, 4);
  subject(m3a, 'ME-303', 'Strength of Materials', rk, 4);
  subject(m3a, 'ME-305', 'Manufacturing Processes', id, 3);
  subject(m3a, 'PH-301', 'Engineering Physics', pk, 3);
  subject(m3a, 'HU-301', 'Communication Skills', kk, 2);
  subject(m3a, 'ME-311', 'Workshop Practice', id, 1, { ...lab('Workshop', 3), batch: 'G1' });
  subject(m3a, 'ME-311', 'Workshop Practice', rk, 1, { ...lab('Workshop', 3), batch: 'G2' });
  subject(m3a, 'PH-311', 'Physics Lab', pk, 1, { ...lab('Physics Lab'), batch: 'G1' });
  subject(m3a, 'PH-311', 'Physics Lab', bs, 1, { ...lab('Physics Lab'), batch: 'G2' });
  return b.data;
}

/** A small college to learn the app in two minutes. */
function small() {
  const b = builder('Sunrise College of Commerce, Patiala');
  const { room, teacher: T, section: S, subject } = b;
  room('Room 1', 'Classroom', 60);
  room('Room 2', 'Classroom', 60);
  room('Computer Lab', 'Computer Lab', 40);
  const a = T('Ms. Anjali Gupta', 'Commerce', 4);
  const r = T('Mr. Ravinder Singh', 'Commerce', 4);
  const m = T('Dr. Meenakshi Jain', 'Commerce', 4, ['0-0', '0-1', '0-2', '0-3']);
  const k = T('Mr. Karan Arora', 'Computer Applications', 5);
  const s1 = S('B.Com I', 'Commerce', 55);
  const s2 = S('BCA I', 'Computer Applications', 40);
  subject(s1, 'BC-101', 'Financial Accounting', a, 4);
  subject(s1, 'BC-102', 'Business Economics', r, 4);
  subject(s1, 'BC-103', 'Business Law', m, 3);
  subject(s1, 'BC-104', 'Computer Basics', k, 1, { roomType: 'Computer Lab', length: 2, batch: 'G1' });
  subject(s1, 'BC-104', 'Computer Basics', k, 1, { roomType: 'Computer Lab', length: 2, batch: 'G2' });
  subject(s2, 'CA-101', 'Programming in C', k, 4);
  subject(s2, 'CA-102', 'Mathematics', r, 3);
  subject(s2, 'CA-103', 'Accounting for BCA', a, 3);
  subject(s2, 'CA-111', 'C Programming Lab', k, 2, { roomType: 'Computer Lab', length: 2 });
  return b.data;
}

/** A large college (21 sections, 6 departments) to show the solver at scale. */
function large() {
  const b = builder('Large Institute of Technology (stress test)');
  const { room, teacher: T, section: S, subject } = b;
  const depts = ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE'];
  const labType = { CSE: 'Computer Lab', IT: 'Computer Lab', ECE: 'Electronics Lab', EE: 'Electrical Lab', ME: 'Workshop', CE: 'Civil Lab' };
  const first = ['Aman', 'Baljeet', 'Charanjit', 'Deepika', 'Eshaan', 'Farhan', 'Gagan', 'Harleen', 'Ishita', 'Jatin', 'Komal', 'Lovepreet', 'Mehak', 'Navdeep', 'Oshin', 'Paramjit', 'Rashmi', 'Sahil', 'Tanvi', 'Uday', 'Varun', 'Yashika'];
  const last = ['Sidhu', 'Grewal', 'Bhatia', 'Chopra', 'Kapoor', 'Sethi', 'Walia', 'Bajwa', 'Ahuja', 'Saini'];
  let n = 0;
  const person = () => {
    const name = `${n % 3 === 0 ? 'Dr.' : 'Prof.'} ${first[n % first.length]} ${last[Math.floor(n / first.length) % last.length]}`;
    n++;
    return name;
  };
  room('Auditorium', 'Seminar Hall', 300);
  room('LT-A', 'Classroom', 130);
  room('LT-B', 'Classroom', 130);
  const maths = [0, 1, 2, 3].map(() => T(person(), 'Applied Sciences', 5));
  const english = [0, 1].map(() => T(person(), 'Applied Sciences', 5));
  let mi = 0;
  let ei = 0;
  for (const dept of depts) {
    const sems = dept === 'CSE' ? ['3A', '3B', '5A', '5B', '7A'] : dept === 'IT' || dept === 'ECE' ? ['3A', '5A', '7A'] : ['3A', '5A', '7A'];
    for (let i = 0; i < sems.length + 1; i++) room(`${dept}-${101 + i}`, 'Classroom', 70, dept);
    room(`${dept} Lab 1`, labType[dept], 36, dept);
    room(`${dept} Lab 2`, labType[dept], 36, dept);
    if (sems.length > 3) room(`${dept} Lab 3`, labType[dept], 36, dept);
    const staff = Array.from({ length: Math.ceil(sems.length * 2.2) }, () => T(person(), dept, 5));
    let si = 0;
    const next = () => staff[si++ % staff.length];
    for (const sem of sems) {
      const sec = S(`${dept}-${sem}`, dept, 60);
      const year = sem[0];
      if (year === '3') subject(sec, 'MA-301', 'Mathematics III', maths[mi++ % maths.length], 4);
      if (year !== '7') subject(sec, `HU-${year}01`, 'Professional Communication', english[ei++ % english.length], 2);
      for (let k = 1; k <= (year === '7' ? 5 : 4); k++) subject(sec, `${dept}-${year}0${k}`, `${dept} Core ${year}.${k}`, next(), k <= 2 ? 4 : 3);
      if (year === '7') subject(sec, `${dept}-791`, 'Project Seminar', next(), 1, { roomType: 'Seminar Hall' });
      for (const k of [1, 2]) {
        subject(sec, `${dept}-${year}1${k}`, `${dept} Lab ${year}.${k}`, next(), 1, { roomType: labType[dept], length: 2, batch: 'G1' });
        subject(sec, `${dept}-${year}1${k}`, `${dept} Lab ${year}.${k}`, next(), 1, { roomType: labType[dept], length: 2, batch: 'G2' });
      }
    }
  }
  return b.data;
}

/** A college with three deliberate mistakes, to show the plain-language error report. */
function impossible() {
  const data = small();
  data.college.name = 'Broken Data Example (shows error messages)';
  const k = data.teachers.find((t) => t.name === 'Mr. Karan Arora');
  k.maxPerDay = 3;
  data.courses.push({
    id: 'c-bca-extra', sectionId: 's-bca-i', batch: '', subject: 'Web Design', code: 'CA-104', teacherId: k.id,
    sessions: 4, length: 2, roomType: 'Computer Lab', fixedRoomId: '',
  });
  data.courses.push({
    id: 'c-bcom1-visit', sectionId: 's-b-com-i', batch: '', subject: 'Industry Visit', code: 'BC-190', teacherId: 't-mr-ravinder-singh',
    sessions: 1, length: 5, roomType: 'Classroom', fixedRoomId: '',
  });
  data.sections.push({ id: 's-b-com-ii', name: 'B.Com II', dept: 'Commerce', size: 120 });
  data.courses.push({
    id: 'c-bcom2-acc', sectionId: 's-b-com-ii', batch: '', subject: 'Corporate Accounting', code: 'BC-201', teacherId: 't-ms-anjali-gupta',
    sessions: 4, length: 1, roomType: 'Classroom', fixedRoomId: '',
  });
  return data;
}

mkdirSync('samples/csv', { recursive: true });
const sets = { demo: demo(), small: small(), large: large(), impossible: impossible() };
for (const [name, data] of Object.entries(sets)) {
  writeFileSync(`samples/${name}.json`, JSON.stringify(normalize(data), null, 2) + '\n');
  console.log(`samples/${name}.json: ${data.sections.length} sections, ${data.teachers.length} teachers, ${data.rooms.length} rooms, ${data.courses.length} subjects`);
}

// CSV copies of the demo college, in the same column order the app's "Paste from Excel" boxes expect.
const d = sets.demo;
const name = (list, id) => (list.find((x) => x.id === id) || {}).name || '';
const csv = (rows) => rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';
writeFileSync('samples/csv/rooms.csv', csv([['Name', 'Type', 'Capacity', 'Department'], ...d.rooms.map((r) => [r.name, r.type, r.capacity, r.dept])]));
writeFileSync('samples/csv/teachers.csv', csv([['Name', 'Department', 'Max periods per day'], ...d.teachers.map((t) => [t.name, t.dept, t.maxPerDay])]));
writeFileSync('samples/csv/sections.csv', csv([['Name', 'Department', 'Students'], ...d.sections.map((s) => [s.name, s.dept, s.size])]));
writeFileSync('samples/csv/subjects.csv', csv([
  ['Section', 'Batch', 'Code', 'Subject', 'Teacher', 'Sessions per week', 'Periods per session', 'Room type'],
  ...d.courses.map((c) => [name(d.sections, c.sectionId), c.batch, c.code, c.subject, name(d.teachers, c.teacherId), c.sessions, c.length, c.roomType]),
]));
console.log('samples/csv/*.csv written');
