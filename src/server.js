import express from 'express';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStore } from './store.js';

const statuses = ['open', 'in_progress', 'resolved'];
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;

export function createApp(store, workerToken = process.env.WORKER_TOKEN) {
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  app.use(express.static(fileURLToPath(new URL('./public/', import.meta.url))));
  app.param('id', (req, res, next, id) => {
    const number = Number(id);
    if (!Number.isSafeInteger(number) || number < 1) return res.status(400).json({ error: 'invalid id' });
    next();
  });

  app.get('/health', async (_req, res) => {
    await store.ready();
    res.json({ status: 'ok' });
  });
  app.get('/api/tickets', async (_req, res) => res.json({ tickets: await store.list() }));
  app.get('/api/tickets/:id', async (req, res) => {
    const ticket = await store.get(Number(req.params.id));
    if (!ticket) return res.status(404).json({ error: 'ticket not found' });
    res.json(ticket);
  });
  app.post('/api/tickets', async (req, res) => {
    const { title, description = '', requester, priority = 'normal' } = req.body || {};
    if (!text(title, 100) || !text(requester, 80) ||
        typeof description !== 'string' || description.length > 1000 ||
        !['normal', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'invalid ticket' });
    }
    res.status(201).json(await store.create({ title: title.trim(), description: description.trim(),
      requester: requester.trim(), priority }));
  });
  app.patch('/api/tickets/:id', async (req, res) => {
    const { status, assignee } = req.body || {};
    if (!statuses.includes(status) || (assignee !== null && !text(assignee, 80))) {
      return res.status(400).json({ error: 'invalid update' });
    }
    const ticket = await store.update(Number(req.params.id), { status, assignee: assignee?.trim() ?? null });
    if (!ticket) return res.status(404).json({ error: 'ticket not found' });
    res.json(ticket);
  });
  app.get('/api/notifications', async (_req, res) => res.json({ notifications: await store.notifications() }));

  const internal = (req, res, next) => {
    if (!workerToken || req.get('authorization') !== `Bearer ${workerToken}`) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };
  app.get('/internal/notifications', internal, async (_req, res) => {
    res.json({ notifications: await store.pendingNotifications() });
  });
  app.post('/internal/notifications/:id/delivered', internal, async (req, res) => {
    res.json({ delivered: await store.markDelivered(Number(req.params.id)) });
  });

  app.use((_req, res) => res.status(404).json({ error: 'not found' }));
  app.use((error, _req, res, _next) => {
    console.error(JSON.stringify({ event: 'request_error', message: error.message }));
    res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400 ? 'bad request' : 'service unavailable' });
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = createStore();
  try {
    await store.init();
    const server = createApp(store).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
      console.log(JSON.stringify({ event: 'listening', port: server.address().port }));
    });
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.on(signal, () => server.close(() => store.close().then(() => process.exit(0))));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'startup_error', message: error.message }));
    process.exit(1);
  }
}
