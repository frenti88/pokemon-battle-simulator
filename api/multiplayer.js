import { createMultiplayerService } from '../apps/server/rooms/routes.js';
import { resolveHostCapacity } from '../apps/server/capacity.js';

const configured = resolveHostCapacity();
const multiplayer = createMultiplayerService({
  publicOrigin: process.env.PUBLIC_ORIGIN,
  ...configured.multiplayerOptions,
});

export default function handler(req, res) {
  const matchedPath = req.headers['x-matched-path'] || (req.url || '').split('?')[0];
  const urlObj = new URL(req.url || '/', 'http://localhost');
  urlObj.searchParams.delete('path');
  const search = urlObj.searchParams.toString();
  req.url = matchedPath + (search ? `?${search}` : '');

  return multiplayer.middleware(req, res, () => {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}
