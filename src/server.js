import express from 'express';
import { pathToFileURL } from 'node:url';

export const app = express();

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/items', (_req, res) => res.json({ items: [{ id: 1, name: 'lab-kit', quantity: 3 }] }));
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log(JSON.stringify({ event: 'listening', port: server.address().port }));
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
