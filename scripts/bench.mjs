/**
 * Solve every sample and print quality numbers, to compare solver changes.
 *   node scripts/bench.mjs [timeLimitMs]
 */
import { readFileSync } from 'node:fs';
import { normalize } from '../js/model.js';
import { solve } from '../js/solver.js';

const ms = Number(process.argv[2]) || 3000;
for (const name of ['small', 'demo', 'large', 'impossible']) {
  const data = normalize(JSON.parse(readFileSync(new URL(`../samples/${name}.json`, import.meta.url), 'utf8')));
  const r = solve(data, { timeLimitMs: ms });
  const m = r.metrics;
  console.log(
    `${name.padEnd(10)} placed ${r.placements.length}/${r.stats.lessons}  clashes ${r.validation.hard.length}  ` +
    `gaps ${m.gaps}  idle-batch ${m.idleBatch}  last-period ${m.lastPeriod}  day-spread ${m.imbalance}  score ${m.score}  ` +
    `(${r.stats.attempts} tries, ${r.stats.ms} ms)`,
  );
}
