import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/server.js';

const run = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/seed-demo.js', import.meta.url));

test('demo seed creates a realistic ticket mix once', async () => {
  const tickets = [];
  const store = {
    list: async () => tickets,
    create: async ticket => {
      const created = { id: tickets.length + 1, ...ticket, status: 'open', assignee: null };
      tickets.unshift(created);
      return created;
    },
    update: async (id, changes) => {
      const ticket = tickets.find(item => item.id === id);
      Object.assign(ticket, changes);
      return ticket;
    },
  };
  const server = createApp(store).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    const first = await run(process.execPath, [script, '--url', url]);
    assert.match(first.stdout, /8 created, 0 already present/);
    assert.equal(tickets.length, 8);
    assert.deepEqual(new Set(tickets.map(ticket => ticket.status)), new Set(['open', 'in_progress', 'resolved']));
    assert.ok(tickets.some(ticket => ticket.requester === 'Aarya Kulkarni'));
    assert.ok(tickets.some(ticket => ticket.description.includes('KJ Somaiya School of Engineering')));
    const second = await run(process.execPath, [script, '--url', url]);
    assert.match(second.stdout, /0 created, 8 already present/);
    assert.equal(tickets.length, 8);
  } finally {
    server.close();
  }
});
