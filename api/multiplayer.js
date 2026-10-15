import { createMultiplayerService } from '../apps/server/rooms/routes.js';
import { resolveHostCapacity } from '../apps/server/capacity.js';

const configured = resolveHostCapacity();
const multiplayer = createMultiplayerService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.multiplayerOptions,
});

export default function handler(req, res) {
  if (req.headers['x-matched-path']) {
    const qIndex = (req.url ?? '').indexOf('?');
    const query = qIndex >= 0 ? req.url.slice(qIndex) : '';
    req.url = req.headers['x-matched-path'] + query;
  }
  return multiplayer.middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
