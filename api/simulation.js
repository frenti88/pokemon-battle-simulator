import { createSimulationService } from '../apps/server/simulation.js';
import { resolveHostCapacity } from '../apps/server/capacity.js';

const configured = resolveHostCapacity();
const simulation = createSimulationService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.serviceOptions,
});

export default function handler(req, res) {
  if (req.headers['x-matched-path']) {
    const qIndex = (req.url ?? '').indexOf('?');
    const query = qIndex >= 0 ? req.url.slice(qIndex) : '';
    req.url = req.headers['x-matched-path'] + query;
  }
  return simulation.middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
