import { APP_NAME } from '@liftwise/core';
import { Hono } from 'hono';
import { except } from 'hono/combine';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './app-env';
import { requireDevice } from './auth/middleware';
import { pairingRoutes } from './auth/pairing';
import { changeRoutes } from './changes';
import { createDb } from './db';
import { deviceRoutes } from './devices';
import { apiError } from './http';
import { syncRoutes } from './sync/routes';

const PUBLIC_API_PATHS = ['/api/auth/pairing/redeem'];

const app = new Hono<AppEnv>();

// The PWA is served from the same origin; https://localhost is the Capacitor Android WebView (§6.8).
app.use(
  '/api/*',
  cors({ origin: ['https://localhost'], allowHeaders: ['Authorization', 'Content-Type'] }),
);
app.use('/api/*', async (c, next) => {
  c.set('db', createDb(c.env.DB));
  await next();
});
app.use('/api/*', except(PUBLIC_API_PATHS, requireDevice));

app.get('/health', (c) => c.json({ status: 'ok', app: APP_NAME }));
app.route('/api/auth/pairing', pairingRoutes);
app.route('/api/devices', deviceRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/changes', changeRoutes);

app.notFound((c) => apiError(c, 404, 'not_found'));
app.onError((error, c) => {
  // Middleware such as bearerAuth throws its ready response.
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return apiError(c, 500, 'internal');
});

export default app;
