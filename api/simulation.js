import { createSimulationService } from '../apps/server/simulation.js';
import { resolveHostCapacity } from '../apps/server/capacity.js';

const configured = resolveHostCapacity();
const simulation = createSimulationService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.serviceOptions,
});

export default function handler(req, res) {
  req.url = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.url || '/';
  return simulation.middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
