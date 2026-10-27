# ClashFree Timetables

Hackathon 1 · Punjab Jobs AI Bootcamp · J-PAL South Asia · Scheduling Optimizer

A web app that builds **clash-free college timetables** for any college. The admin enters the week, rooms,
teachers, classes and subjects (or pastes them from Excel), presses **Generate**, and gets a timetable for
every class, teacher and room in a few seconds. Every result is re-checked by a separate clash checker.

**Live app:** https://hussnn18.github.io/clashfree-timetables/ (no sign-up; everything runs in your browser)

## Try it in one minute

1. Open the live app. In the welcome box choose **Engineering college (recommended)**.
2. Click **Generate** in the step bar, then **Generate timetable**. All 133 lessons are placed with 0 clashes.
3. Click **Open timetables**. Switch between **Class / Teacher / Room**, pick any one from the list.
4. Click a class in the grid: green slots are where it can legally move, red slots say why not. Click a green slot.
5. Open **Daily tools**, pick a teacher and a day: it lists who can cover each of their classes.

Shortcut links: `?sample=demo&tab=timetables&generate=1` loads the demo and generates straight away.
Other samples: `small`, `large` (20 classes, 440 lessons), `impossible` (shows the error messages).

## Who it is for and what it solves

The timetable in-charge of a college. Today they build the timetable by hand for weeks and it still has
clashes, uneven loads and rooms that sit empty, while departments fight over shared labs and seminar halls.

| Problem in a real college | What ClashFree does |
|---|---|
| Teacher, room or class double-booked | Hard rule; a separate checker proves 0 clashes |
| Part-time staff, meetings, exam duty | Per-teacher availability grid (click periods or whole days off) |
| Teachers overloaded on some days | Max periods per day per teacher, and even spread across the week |
| Labs need 2–3 periods together, not across lunch | Multi-period sessions never cross a break |
| Class split into lab batches G1/G2 | Batches may run side by side in different labs; the solver pairs them so no half sits idle |
| Departments compete for shared rooms | Rooms belong to a department or are shared; capacity and room type are checked |
| Same subject twice a day | Subjects spread over the week (at most once a day unless sessions > days) |
| Data that cannot work (too many hours, no big room) | Plain-language check before generating, and a reason for every lesson that did not fit |
| Last-minute changes | Click-to-move with live legality check; moved classes are locked and kept on regenerate |
| Teacher absent today | Substitute finder: who is free, available and under their limit, same department first |
| Need a room for an extra class | Free-room finder by day, period and type |
| Sharing the result | Print / Save as PDF (one class per A4 page), CSV for Excel, JSON backup |

## How it works

- **Static web app**: HTML, CSS and plain JavaScript modules. No server, no database, no build step. Data is saved
  in the browser (localStorage) and can be exported/imported as a JSON file.
- **Solver** (`js/solver.js`, runs in a Web Worker):
  1. *Precheck* finds impossible inputs and explains them.
  2. *Greedy, hardest first*: long labs, busy teachers and lessons with few possible rooms are placed first. Each lesson
     goes to the legal slot with the lowest penalty (gaps in a class's day, heavy days, last period, idle lab batch,
     oversized room).
  3. *Repair*: a lesson with no legal slot may move one or two blocking lessons elsewhere.
  4. *Restarts*: repeated with random tie-breaks for 3 s (or 12 s on "Thorough"); the best timetable wins.
- **Validator** (`js/validate.js`) re-checks every hard rule from scratch. The "0 clashes" badge and the tests use it.

## Run it locally

Any static file server works. With Python:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. (Opening `index.html` directly from disk will not work: browsers block JavaScript
modules on `file://`.)

## Tests

Node.js 20+:

```bash
npm test
```

Covers: every sample is solved with 0 clashes and nothing missing; the validator catches each kind of clash; split
labs run side by side; locked lessons stay put; impossible data gives the right messages; move checker, substitute
finder and free-room finder.

```bash
node scripts/bench.mjs
```

prints quality numbers (gaps, idle batches, spread) for each sample.

## Testing datasets

All fictional. Load them from **Load sample** in the app, or import the JSON files.

| File | What it is |
|---|---|
| `samples/demo.json` | Engineering college: 6 classes in CSE, ECE, ME and Applied Sciences; 18 teachers (some part-time or with blocked periods); 15 rooms incl. shared seminar hall, computer centre and physics lab; split lab batches; a 3-period workshop |
| `samples/small.json` | 2 classes, 4 teachers, 3 rooms |
| `samples/large.json` | 20 classes in 6 departments, 52 teachers, 42 rooms, 440 lessons |
| `samples/impossible.json` | Deliberate mistakes: overloaded teacher, class of 120 with 60-seat rooms, 5-period session |
| `samples/csv/*.csv` | The demo college as CSV, in the column order of the "Paste from Excel" boxes |

Regenerate them with `node scripts/make-samples.mjs`.

## Project layout

```
index.html          page shell
css/style.css       light, dark and print styles
js/model.js         data model and shared helpers
js/solver.js        precheck, solver, diagnosis
js/validate.js      independent clash checker and quality metrics
js/tools.js         move checker, substitute finder, free rooms
js/worker.js        runs the solver off the main thread
js/app.js           steps, samples, import/export
js/editors.js       week, rooms, teachers, classes, subjects screens
js/generate.js      generate screen
js/timetable.js     timetable grids, moving, printing, CSV
js/daily.js         daily tools
samples/            test datasets
scripts/            sample generator, benchmark
tests/              node:test suite
docs/               presentation deck and screenshots
```

Built with Claude Code.
