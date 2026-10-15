import { createMultiplayerService } from '../apps/server/rooms/routes.js';
import { resolveHostCapacity } from '../apps/server/capacity.js';

const configured = resolveHostCapacity();
const multiplayer = createMultiplayerService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.multiplayerOptions,
});

export default function handler(req, res) {
  req.url = req.headers['x-forwarded-uri'] || req.headers['x-matched-path'] || req.url || '/';
  return multiplayer.middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
