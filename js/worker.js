/** Runs the solver off the main thread so the page stays responsive while it searches. */
import { solve } from './solver.js';

self.onmessage = (e) => {
  const { data, opts } = e.data;
  const result = solve(data, { ...opts, onProgress: (p) => self.postMessage({ type: 'progress', ...p }) });
  self.postMessage({ type: 'done', result });
};
