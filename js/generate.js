/**
 * Generate screen: checks the data, runs the solver in a Web Worker, and reports
 * how good the result is and why anything did not fit.
 */
import { el, toast } from './dom.js';
import { app, save, placements, lockedSet } from './state.js';
import { precheck } from './solver.js';
import { validate, metrics } from './validate.js';

const BUDGETS = { quick: { label: 'Quick (about 3 s)', ms: 3000 }, thorough: { label: 'Thorough (about 12 s)', ms: 12000 } };
let running = false;
let progress = null;

/** Run the solver off the main thread; fall back to the main thread if workers are unavailable. */
export function runSolver(data, opts, onProgress) {
  const plain = JSON.parse(JSON.stringify(data));
  const inline = () => import('./solver.js').then((m) => m.solve(plain, opts));
  return new Promise((resolve) => {
    let worker;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    } catch {
      setTimeout(() => inline().then(resolve), 30);
      return;
    }
    worker.onmessage = (e) => {
      if (e.data.type === 'progress') onProgress && onProgress(e.data);
      else {
        worker.terminate();
        resolve(e.data.result);
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker.terminate();
      inline().then(resolve);
    };
    worker.postMessage({ data: plain, opts });
  });
}

export async function generate({ keepLocked = true } = {}) {
  if (running) return;
  const d = app.data;
  running = true;
  progress = { attempts: 0 };
  app.render();
  const lockedIds = lockedSet();
  const locked = keepLocked ? placements().filter((p) => lockedIds.has(p.lessonId)) : [];
  const res = await runSolver(d, { timeLimitMs: BUDGETS[app.ui.budget].ms, locked, seed: Math.floor(Math.random() * 1e9) }, (p) => {
    progress = p;
    const n = document.getElementById('gen-progress');
    if (n) n.textContent = `Tried ${p.attempts} timetables · best so far leaves ${p.unplaced} lesson${p.unplaced === 1 ? '' : 's'} unplaced`;
  });
  const placedIds = new Set(res.placements.map((p) => p.lessonId));
  d.timetable = {
    placements: res.placements,
    locked: locked.map((p) => p.lessonId).filter((id) => placedIds.has(id)),
    unplaced: res.unplaced,
    stats: res.stats,
    generatedAt: new Date().toISOString(),
  };
  running = false;
  progress = null;
  save();
  app.render();
  const clashes = res.validation.hard.length;
  toast(res.unplaced.length
    ? `Placed ${res.placements.length} of ${res.stats.lessons} lessons. See below for what did not fit.`
    : `Done: all ${res.stats.lessons} lessons placed, ${clashes} clashes.`, 4500);
}

export function renderGenerate() {
  const d = app.data;
  const pre = precheck(d);
  const lessons = d.courses.reduce((a, c) => a + c.sessions, 0);
  const periods = d.courses.reduce((a, c) => a + c.sessions * c.length, 0);
  const lockedCount = lockedSet().size;
  const keep = el('input', { type: 'checkbox', checked: true, id: 'keep-locked' });

  const checks = el('div', { class: 'card' },
    el('h2', {}, '1. Check the data'),
    pre.errors.length
      ? el('div', { class: 'notice bad' }, el('strong', {}, `${pre.errors.length} thing${pre.errors.length > 1 ? 's' : ''} to fix first`), el('ul', {}, pre.errors.map((e) => el('li', {}, e))))
      : el('div', { class: 'notice ok' }, el('strong', {}, '✓ Ready. '), `${lessons} lessons (${periods} periods) for ${d.sections.length} classes, ${d.teachers.length} teachers and ${d.rooms.length} rooms over ${d.college.days.length} days × ${d.college.periods.length} periods.`),
    pre.warnings.length ? el('div', { class: 'notice warn' }, el('strong', {}, 'Tight spots'), el('ul', {}, pre.warnings.map((w) => el('li', {}, w)))) : null,
    el('details', {}, el('summary', { class: 'small muted' }, 'Rules every timetable follows'),
      el('ul', { class: 'small' },
        el('li', {}, 'No teacher, room or class is ever in two places at once (lab batches G1 and G2 may run side by side).'),
        el('li', {}, 'Teachers only teach when available, and never more than their daily maximum.'),
        el('li', {}, 'Every class gets a room of the right type, with enough seats, owned by its department or shared.'),
        el('li', {}, 'Labs and double periods stay together and never run across a break.'),
        el('li', {}, 'A subject is spread over the week: at most once a day unless it has more sessions than days.'),
        el('li', {}, 'Then it prefers: no free gaps inside a class\'s day, an even load across days, fewer last-period classes, split labs side by side, and the smallest room that fits.'))));

  const run = el('div', { class: 'card' },
    el('h2', {}, '2. Generate'),
    el('div', { class: 'row', style: { marginBottom: '.8rem' } },
      el('div', { class: 'seg', role: 'group', 'aria-label': 'Search time' }, Object.entries(BUDGETS).map(([k, b]) => el('button', {
        type: 'button', 'aria-pressed': String(app.ui.budget === k), onclick: () => { app.ui.budget = k; app.render(); },
      }, b.label))),
      lockedCount ? el('label', { class: 'check' }, keep, `Keep my ${lockedCount} locked class${lockedCount > 1 ? 'es' : ''} where they are`) : null),
    running
      ? el('div', {}, el('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Generating' }, el('span')), el('p', { id: 'gen-progress', class: 'muted small' }, `Tried ${progress ? progress.attempts : 0} timetables…`))
      : el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn primary big', onclick: () => generate({ keepLocked: keep.checked }) },
          d.timetable ? 'Generate again' : 'Generate timetable'),
        pre.errors.length ? el('span', { class: 'muted small' }, 'You can still generate: anything that cannot fit is listed with the reason.') : null));

  return el('div', {},
    el('div', { class: 'page-head' }, el('div', {}, el('h1', {}, 'Generate the timetable'),
      el('p', {}, 'The generator tries hundreds of timetables in a few seconds and keeps the best one. Every result is re-checked for clashes by a separate checker before it is shown.'))),
    el('div', { class: 'grid-2' }, checks, run),
    d.timetable && !running ? results(d) : null);
}

function results(d) {
  const pls = placements();
  const v = validate(d, pls);
  const m = metrics(d, pls);
  const total = d.courses.reduce((a, c) => a + c.sessions, 0);
  const st = d.timetable.stats || {};
  const missingIds = new Set(v.missing.map((x) => x.ref && x.ref.courseId));
  const reasons = (d.timetable.unplaced || []).filter((u) => missingIds.has(u.courseId));
  const seen = new Set();
  const uniqueReasons = reasons.filter((u) => (seen.has(u.courseId) ? false : seen.add(u.courseId)));
  const stat = (label, value, sub, cls = '') => el('div', { class: 'stat' }, el('div', { class: 'label' }, label), el('div', { class: `value ${cls}` }, value), el('div', { class: 'sub' }, sub));
  return el('div', { class: 'card' },
    el('div', { class: 'row', style: { marginBottom: '.8rem' } },
      el('h2', { style: { margin: 0 } }, '3. Result'),
      el('span', { class: 'muted small' }, `generated ${new Date(d.timetable.generatedAt).toLocaleString()}`),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn primary', onclick: () => { app.ui.tab = 'timetables'; app.render(); } }, 'Open timetables →')),
    el('div', { class: 'stats' },
      stat('Lessons placed', `${pls.length} / ${total}`, pls.length === total ? 'everything fits' : `${total - pls.length} could not fit`, pls.length === total ? 'ok' : 'bad'),
      stat('Clashes', String(v.hard.length), 'checked independently', v.hard.length ? 'bad' : 'ok'),
      stat('Gaps in a class\'s day', String(m.gaps), 'free periods between classes'),
      stat('Busiest teacher day', `${m.maxTeacherDay} periods`, 'within every daily limit'),
      stat('Room use', `${Math.round(m.roomUtil * 100)}%`, `of ${d.rooms.length} rooms across the week`),
      stat('Search', `${st.attempts || '?'} tries`, `${((st.ms || 0) / 1000).toFixed(1)} s in your browser`)),
    v.hard.length ? el('div', { class: 'notice bad' }, el('strong', {}, 'Problems after edits'), el('ul', {}, v.hard.slice(0, 30).map((h) => el('li', {}, h.message)))) : null,
    uniqueReasons.length ? el('div', { class: 'notice warn' },
      el('strong', {}, 'Could not fit, and why'),
      el('ul', {}, uniqueReasons.map((u) => el('li', {}, u.reason)))) : null,
    v.missing.length && !uniqueReasons.length ? el('div', { class: 'notice warn' }, el('strong', {}, 'Not in the timetable yet (data changed since generating)'), el('ul', {}, v.missing.map((x) => el('li', {}, x.message)))) : null);
}
