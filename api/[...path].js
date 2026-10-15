import { createSimulationService } from '../apps/server/simulation.js';
import { createMultiplayerService } from '../apps/server/rooms/routes.js';
import { resolveHostCapacity } from '../apps/server/capacity.js';

const configured = resolveHostCapacity();
const simulation = createSimulationService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.serviceOptions,
});
const multiplayer = createMultiplayerService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.multiplayerOptions,
});

export default function handler(req, res) {
  const url = req.url || '';
  if (url.startsWith('/api/simulation')) {
    return simulation.middleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
    });
  }
  if (url.startsWith('/api/multiplayer')) {
    return multiplayer.middleware(req, res, () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Not found');
    });
  }
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not found');
}
