# Testing data

Four fictional colleges for testing ClashFree. All names, people and rooms are made up.
Every college uses a 5-day week (Mon–Fri) with 8 periods a day and a lunch break after period 4.

| File | College | Size | What it tests | Expected result |
|---|---|---|---|---|
| `demo.json` | Demo Engineering College | 6 classes, 18 teachers, 15 rooms, 57 subjects, 133 lessons | Four departments sharing a seminar hall, computer centre and physics lab; lab batches G1/G2; a 3-period workshop; a part-time teacher (Mon–Wed only); blocked periods | 133 / 133 placed, 0 clashes, about 1–3 s |
| `small.json` | Sunrise College of Commerce | 2 classes, 4 teachers, 3 rooms, 9 subjects, 25 lessons | The basics; a quick first try | 25 / 25 placed, 0 clashes, under 1 s |
| `large.json` | Large Institute of Technology | 20 classes in 6 departments, 52 teachers, 42 rooms, 193 subjects, 440 lessons | Scale | 440 / 440 placed, 0 clashes, about 3 s |
| `impossible.json` | Broken Data Example | 3 classes, 4 teachers, 3 rooms, 12 subjects, 34 lessons | Data that cannot work: an overloaded teacher, a class of 120 when rooms hold 60, a 5-period session when the longest block is 4 | 4 plain-language errors before generating; the 26 lessons that fit are placed with 0 clashes; each of the rest is listed with the reason and a tip |

`csv/` holds the demo college as four CSV files (`rooms`, `teachers`, `sections`, `subjects`), in the column
order the app's **Paste from Excel** boxes expect.

## Three ways to load the data

1. **Easiest:** in the app, click **Load sample** (top right) and pick a college.
2. **From a file:** download a `.json` file from this folder, then click **Import** in the app and choose it.
3. **From Excel:** open a CSV from `csv/` in Excel, copy the rows, then on the matching screen (Rooms,
   Teachers, Classes, Subjects) click **Paste from Excel** and paste. Load them in that order, so subjects can find
   their classes and teachers.

Shortcut: `https://hussnn18.github.io/h1/?sample=demo&tab=timetables&generate=1` loads the demo college and
generates straight away. Replace `demo` with `small`, `large` or `impossible`.

## What to check

| Try this | Where | What you should see |
|---|---|---|
| Generate the demo college | Generate → Generate timetable | 133 / 133 placed, 0 clashes |
| Look for a clash | Timetables → Class, Teacher, then Room views | No teacher, room or class twice in one period; the green "✓ 0 clashes" badge |
| Lab batches | Timetables → class CSE-3A | G1 and G2 labs in the same periods, in two different labs |
| Teacher availability | Timetables → Teacher → Ms. Simran Kaur | Classes only Mon–Wed (she is part-time) |
| Blocked periods | Timetables → Teacher → Dr. Harpreet Kaur | Friday afternoon is free (dean's meeting) |
| Lunch break | Any lab | No lab runs across the lunch column |
| Shared rooms | Timetables → Room → Seminar Hall | Used by both CSE and ECE seminars |
| Move a class | Click a class, then a green slot | It moves, gets a lock, and the badge still says 0 clashes; red slots explain why not |
| Locked classes survive | After moving a class, Generate → Generate again | The moved class stays where you put it |
| Absent teacher | Daily tools → pick a teacher and a day | For each of their periods, colleagues who are free to cover |
| Wrong data | Load "Data with mistakes" → Generate | Four red messages in plain words, and a reason for each lesson that did not fit |
| Scale | Load "Large institute" → Generate | 440 / 440 placed in about 3 s, 0 clashes |

## Automated tests

With Node.js 20+ installed, run `npm test` in the project folder. The tests solve `small`, `demo` and `large` and
check every result with the independent clash checker; they also check that `impossible` produces the right
error messages.
