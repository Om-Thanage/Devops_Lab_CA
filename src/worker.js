const api = process.env.API_URL || 'http://resilience-api';
const token = process.env.WORKER_TOKEN;
if (!token) throw new Error('WORKER_TOKEN is required');

async function request(path, method = 'GET') {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

let busy = false;
async function run() {
  if (busy) return;
  busy = true;
  try {
    const { notifications } = await request('/internal/notifications');
    for (const notification of notifications) {
      const { delivered } = await request(`/internal/notifications/${notification.id}/delivered`, 'POST');
      if (delivered) console.log(JSON.stringify({ event: 'notification_delivered', ticket_id: notification.ticket_id,
        notification_id: notification.id, message: notification.message }));
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'worker_retry', message: error.message }));
  } finally {
    busy = false;
  }
}

await run();
const timer = setInterval(run, 2000);
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => { clearInterval(timer); process.exit(0); });
}
