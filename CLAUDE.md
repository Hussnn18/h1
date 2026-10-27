# CLAUDE.md

ClashFree Timetables: a static web app that generates clash-free college timetables in the browser.
See `README.md` for features and usage.

## Commands

- Run locally: `python -m http.server 8080` then open http://localhost:8080 (modules do not load from `file://`)
- Tests: `npm test` (Node's built-in `node:test`, no dependencies)
- Solver quality numbers: `node scripts/bench.mjs [ms]`
- Rebuild sample datasets: `node scripts/make-samples.mjs`

## Architecture

- Pure logic, no DOM (also runs in Node and the Web Worker): `js/model.js` (data shape, helpers),
  `js/solver.js` (precheck → hardest-first greedy → eviction repair → randomised restarts),
  `js/validate.js` (independent clash checker + metrics), `js/tools.js` (move checker, substitutes, free rooms).
- UI: `js/app.js` wires the step bar and screens in `editors.js`, `generate.js`, `timetable.js`, `daily.js`.
  Shared state and saving live in `js/state.js`; `js/dom.js` has the `el()` builder and dialog/toast helpers.
- All data is one JSON object (see the comment at the top of `model.js`), saved to localStorage and exportable.

## Rules that must always hold

- `validate()` must never trust the solver: it re-derives every hard rule from the raw data.
- Hard rules (never broken): no teacher/room/section double-booking (different batches of one section may overlap),
  teacher availability and daily max, room type/capacity/department, multi-period lessons inside one block between
  breaks, a subject at most `ceil(sessions/days)` times a day. Anything else is a penalty in `slotPenalty` / `metrics`.
- A lesson the solver cannot place is returned with a plain-language reason, never dropped silently.
- Locked placements (hand moves) are kept on regenerate.
- No backend and no external scripts: the app must keep working as plain files on GitHub Pages.
- Sample data is fictional. Messages are for a college administrator: plain words, no jargon.

## Conventions

- Plain ES modules, 2-space indent, single quotes, small functions with a short doc comment.
- Add a test in `tests/solver.test.js` for every new hard rule or tool.
