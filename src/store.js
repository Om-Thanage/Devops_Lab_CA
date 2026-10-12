import pg from 'pg';

export function createStore() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return {
    async init() {
      const client = await pool.connect();
      let locked = false;
      try {
        await client.query('SELECT pg_advisory_lock(841102)');
        locked = true;
        await client.query(`CREATE TABLE IF NOT EXISTS tickets (
          id SERIAL PRIMARY KEY,
          title VARCHAR(100) NOT NULL,
          description VARCHAR(1000) NOT NULL,
          requester VARCHAR(80) NOT NULL,
          priority VARCHAR(10) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          assignee VARCHAR(80),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);
        await client.query(`CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          ticket_id INTEGER NOT NULL REFERENCES tickets(id),
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          delivered_at TIMESTAMPTZ
        )`);
      } finally {
        try {
          if (locked) await client.query('SELECT pg_advisory_unlock(841102)');
        } finally { client.release(); }
      }
    },
    async ready() { await pool.query('SELECT 1'); },
    async list() { return (await pool.query('SELECT * FROM tickets ORDER BY id DESC LIMIT 100')).rows; },
    async get(id) { return (await pool.query('SELECT * FROM tickets WHERE id = $1', [id])).rows[0] ?? null; },
    async create(ticket) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO tickets (title, description, requester, priority)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [ticket.title, ticket.description, ticket.requester, ticket.priority]);
        await client.query('INSERT INTO notifications (ticket_id, message) VALUES ($1, $2)',
          [rows[0].id, `Ticket #${rows[0].id} opened for ${ticket.requester}`]);
        await client.query('COMMIT');
        return rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async update(id, ticket) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          'UPDATE tickets SET status = $1, assignee = $2 WHERE id = $3 RETURNING *',
          [ticket.status, ticket.assignee, id]);
        if (rows[0]) {
          await client.query('INSERT INTO notifications (ticket_id, message) VALUES ($1, $2)',
            [id, `Ticket #${id} is ${ticket.status}${ticket.assignee ? ` (assigned to ${ticket.assignee})` : ''}`]);
        }
        await client.query('COMMIT');
        return rows[0] ?? null;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async notifications() {
      return (await pool.query('SELECT * FROM notifications ORDER BY id DESC LIMIT 100')).rows;
    },
    async pendingNotifications() {
      return (await pool.query('SELECT * FROM notifications WHERE delivered_at IS NULL ORDER BY id LIMIT 20')).rows;
    },
    async markDelivered(id) {
      return (await pool.query('UPDATE notifications SET delivered_at = NOW() WHERE id = $1 AND delivered_at IS NULL RETURNING id', [id])).rowCount > 0;
    },
    async close() { await pool.end(); },
  };
}
