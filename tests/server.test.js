import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { app } from '../src/server.js';

test('health, application data, and unknown paths', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    for (const [path, status, key] of [
      ['/health', 200, 'status'],
      ['/items', 200, 'items'],
      ['/missing', 404, 'error'],
    ]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
      assert.equal(response.status, status);
      assert.ok(key in await response.json());
    }
  } finally {
    server.close();
  }
});
