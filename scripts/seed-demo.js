const school = 'KJ Somaiya School of Engineering';

const demoTickets = [
  {
    title: 'Wi-Fi disconnecting in B Wing computer lab',
    requester: 'Aarya Kulkarni',
    priority: 'high',
    description: `Students at ${school} lose Wi-Fi every few minutes in the B Wing computer lab during practical sessions.`,
    status: 'in_progress',
    assignee: 'Riya Patil',
  },
  {
    title: 'Projector has no signal in Room 402',
    requester: 'Prof. Rohan Shah',
    priority: 'normal',
    description: 'The classroom projector shows no HDMI signal from the teaching laptop. The next lecture starts at 10:00.',
    status: 'open',
  },
  {
    title: 'Unable to sign in to student portal',
    requester: 'Sneha Nair',
    priority: 'high',
    description: 'The student portal returns to the login page after entering valid credentials. Assignment submission is due today.',
    status: 'open',
  },
  {
    title: 'Python packages missing on lab workstations',
    requester: 'Aditya Mehta',
    priority: 'normal',
    description: 'NumPy and pandas are unavailable on the workstations used for the data science practical.',
    status: 'in_progress',
    assignee: 'Omkar Jadhav',
  },
  {
    title: 'Library printer queue stuck',
    requester: 'Priya Iyer',
    priority: 'normal',
    description: 'Print jobs remained queued at the library printer. The spooler was restarted and a test page printed successfully.',
    status: 'resolved',
    assignee: 'Farhan Shaikh',
  },
  {
    title: 'Campus email access restored',
    requester: 'Kabir Patel',
    priority: 'normal',
    description: 'The student could not access campus email. The account was checked and sign-in now works.',
    status: 'resolved',
    assignee: 'Riya Patil',
  },
  {
    title: 'Exam hall network switch offline',
    requester: 'Neha Desai',
    priority: 'high',
    description: 'Wired network ports in the exam hall are unavailable. A technician is checking the switch before the scheduled assessment.',
    status: 'in_progress',
    assignee: 'Farhan Shaikh',
  },
  {
    title: 'CAD software access needed in design lab',
    requester: 'Ishaan Joshi',
    priority: 'normal',
    description: 'The design lab workstation cannot launch the licensed CAD software needed for the project review.',
    status: 'open',
  },
];

const urlIndex = process.argv.indexOf('--url');
const base = urlIndex < 0 ? '' : process.argv[urlIndex + 1];
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/seed-demo.js --url http://127.0.0.1:8080');
  process.exit(1);
}

async function request(path, options) {
  const response = await fetch(new URL(path, `${base.replace(/\/$/, '')}/`), options);
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${data.error || 'request failed'}`);
  return data;
}

try {
  const { tickets } = await request('/api/tickets');
  const existing = new Set(tickets.map(ticket => `${ticket.title}\u0000${ticket.requester}`));
  let created = 0;
  for (const ticket of demoTickets) {
    const key = `${ticket.title}\u0000${ticket.requester}`;
    if (existing.has(key)) continue;
    const newTicket = await request('/api/tickets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: ticket.title, requester: ticket.requester, priority: ticket.priority, description: ticket.description }),
    });
    if (ticket.status !== 'open') {
      await request(`/api/tickets/${newTicket.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: ticket.status, assignee: ticket.assignee }),
      });
    }
    existing.add(key);
    created++;
  }
  console.log(`Demo tickets for ${school}: ${created} created, ${demoTickets.length - created} already present.`);
} catch (error) {
  console.error(`Could not seed demo tickets: ${error.message}`);
  process.exitCode = 1;
}
