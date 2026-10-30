import { APP_NAME } from '@liftwise/core';

export default {
  fetch(request: Request): Response {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') {
      return Response.json({ status: 'ok', app: APP_NAME });
    }
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
} satisfies ExportedHandler;
