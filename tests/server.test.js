import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';

test('create, assign, resolve, and protect worker endpoints', async () => {
  const tickets = [];
  const store = {
    ready: async () => {},
    list: async () => tickets,
    get: async id => tickets.find(ticket => ticket.id === id),
    create: async ticket => {
      const created = { id: tickets.length + 1, ...ticket, status: 'open', assignee: null };
      tickets.push(created); return created;
    },
    update: async (id, changes) => Object.assign(tickets.find(ticket => ticket.id === id), changes),
    notifications: async () => [],
    pendingNotifications: async () => [],
    markDelivered: async () => true,
  };
  const server = createApp(store, 'test-token').listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, method = 'GET', body, headers = {}) => fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...headers },
      body: body && JSON.stringify(body),
    });
    assert.equal((await (await call('/health')).json()).status, 'ok');
    assert.equal((await call('/api/tickets', 'POST', { title: '', requester: 'A' })).status, 400);
    const created = await call('/api/tickets', 'POST', {
      title: 'Campus Wi-Fi outage', description: 'No access before exam', requester: 'A', priority: 'high',
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).id, 1);
    assert.equal((await (await call('/api/tickets')).json()).tickets.length, 1);
    const updated = await call('/api/tickets/1', 'PATCH', { status: 'in_progress', assignee: 'Ravi' });
    assert.equal((await updated.json()).assignee, 'Ravi');
    assert.equal((await call('/api/tickets/1', 'PATCH', { status: 'resolved', assignee: 'Ravi' })).status, 200);
    assert.equal((await (await call('/api/tickets/1')).json()).status, 'resolved');
    assert.equal((await call('/internal/notifications')).status, 401);
    assert.equal((await call('/internal/notifications', 'GET', null, { authorization: 'Bearer test-token' })).status, 200);
    assert.equal((await call('/missing')).status, 404);
  } finally {
    server.close();
  }
});
