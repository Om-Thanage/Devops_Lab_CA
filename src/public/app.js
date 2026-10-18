const $ = selector => document.querySelector(selector);
const state = { tickets: [], notifications: [], status: 'all', priority: 'all', search: '', loaded: false, online: false };
const statusNames = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const dateFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' });
let toastTimer;
let selectedTicketId;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}

function date(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed);
}

function time(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : `${dateFormat.format(parsed)} · ${timeFormat.format(parsed)}`;
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function toast(message, isError = false) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', isError);
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4500);
}

function setConnection(online) {
  state.online = online;
  $('#service-dot').className = `service-dot ${online ? 'online' : 'offline'}`;
  $('#service-label').textContent = online ? 'Services connected' : 'Connection interrupted';
  $('#refresh-label').textContent = online ? 'Updated just now' : 'Unable to sync';
  $('.refresh-note .live-dot').className = `live-dot ${online ? 'online' : 'offline'}`;
}

function renderMetrics() {
  const tickets = state.tickets;
  $('#metric-total').textContent = tickets.length;
  $('#metric-high').textContent = tickets.filter(ticket => ticket.priority === 'high' && ticket.status !== 'resolved').length;
  $('#metric-resolved').textContent = tickets.filter(ticket => ticket.status === 'resolved').length;
  $('#metric-pending').textContent = state.notifications.filter(item => !item.delivered_at).length;
  $('#ticket-count').textContent = tickets.length;
  $('#nav-ticket-count').textContent = tickets.length;
}

function emptyState(title, body) {
  const container = element('div', 'empty-state');
  const badge = element('div', 'empty-icon');
  badge.append(icon('ticket'));
  container.append(badge, element('strong', '', title), element('span', '', body));
  return container;
}

function renderTickets() {
  const list = $('#ticket-list');
  const query = state.search.toLowerCase();
  const filtered = state.tickets.filter(ticket =>
    (state.status === 'all' || ticket.status === state.status) &&
    (state.priority === 'all' || ticket.priority === state.priority) &&
    (!query || [ticket.id, ticket.title, ticket.requester, ticket.assignee || ''].some(value => String(value).toLowerCase().includes(query)))
  );
  list.replaceChildren();
  if (!filtered.length) {
    list.append(state.tickets.length
      ? emptyState('No matching tickets', 'Try another search or filter.')
      : emptyState(state.loaded ? 'No tickets yet' : 'Tickets unavailable', state.loaded ? 'Create the first request to get started.' : 'Waiting for the helpdesk service.'));
    return;
  }
  for (const ticket of filtered) {
    const row = element('button', 'ticket-row');
    row.type = 'button';
    row.setAttribute('aria-label', `Open ticket ${ticket.id}: ${ticket.title}`);

    const main = element('span', 'ticket-main');
    main.append(element('strong', '', ticket.title), element('small', '', `#${ticket.id} · ${ticket.requester} · ${date(ticket.created_at)}`));
    const priority = element('span', 'ticket-priority');
    priority.append(element('span', `priority-chip ${ticket.priority}`, ticket.priority === 'high' ? 'High' : 'Normal'));
    const status = element('span', 'ticket-status');
    status.append(element('span', `status-chip ${ticket.status}`, statusNames[ticket.status] || ticket.status));
    const assignee = element('span', `ticket-assignee assignee${ticket.assignee ? '' : ' unassigned'}`);
    assignee.append(element('span', 'assignee-avatar', ticket.assignee ? ticket.assignee.trim().slice(0, 1).toUpperCase() : '—'));
    assignee.append(element('span', '', ticket.assignee || 'Unassigned'));

    row.append(main, priority, status, assignee);
    row.addEventListener('click', () => openDetail(ticket));
    list.append(row);
  }
}

function renderActivity() {
  const list = $('#activity-list');
  list.replaceChildren();
  if (!state.notifications.length) {
    list.append(element('div', 'activity-empty', 'No notification activity yet. Create a ticket to see updates here.'));
    return;
  }
  for (const item of state.notifications.slice(0, 8)) {
    const delivered = Boolean(item.delivered_at);
    const entry = element('article', `activity-item${delivered ? '' : ' pending'}`);
    const mark = element('span', 'activity-mark');
    mark.append(icon(delivered ? 'check' : 'bell'));
    const body = element('div', 'activity-body');
    body.append(element('strong', '', delivered ? 'Update delivered' : 'Update queued'));
    body.append(element('p', '', item.message));
    body.append(element('small', '', time(delivered ? item.delivered_at : item.created_at)));
    entry.append(mark, body);
    list.append(entry);
  }
}

async function refresh() {
  try {
    const [tickets, notifications] = await Promise.all([api('/api/tickets'), api('/api/notifications')]);
    state.tickets = tickets.tickets;
    state.notifications = notifications.notifications;
    state.loaded = true;
    setConnection(true);
    renderMetrics();
    renderTickets();
    renderActivity();
  } catch {
    setConnection(false);
    if (!state.loaded) renderTickets();
  }
}

function openCreate() {
  $('#create-dialog').showModal();
  $('#create-form').elements.requester.focus();
}

function openDetail(ticket) {
  selectedTicketId = ticket.id;
  $('#detail-id').textContent = `TICKET #${ticket.id}`;
  $('#detail-title').textContent = ticket.title;
  $('#detail-description').textContent = ticket.description || 'No description provided.';
  $('#detail-requester').textContent = ticket.requester;
  $('#detail-priority').textContent = ticket.priority === 'high' ? 'High' : 'Normal';
  $('#detail-created').textContent = date(ticket.created_at);
  $('#detail-form').elements.assignee.value = ticket.assignee || '';
  $('#detail-form').elements.status.value = ticket.status;
  $('#detail-dialog').showModal();
}

for (const button of document.querySelectorAll('[data-open-create]')) button.addEventListener('click', openCreate);
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => button.closest('dialog').close());

$('#create-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#create-submit');
  submit.disabled = true;
  try {
    const ticket = await api('/api/tickets', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    $('#create-dialog').close();
    form.reset();
    await refresh();
    toast(`Ticket #${ticket.id} created successfully.`);
  } catch (error) { toast(error.message, true); }
  finally { submit.disabled = false; }
});

$('#detail-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = $('#detail-submit');
  submit.disabled = true;
  try {
    await api(`/api/tickets/${selectedTicketId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: form.elements.status.value, assignee: form.elements.assignee.value.trim() || null }) });
    $('#detail-dialog').close();
    await refresh();
    toast(`Ticket #${selectedTicketId} updated.`);
  } catch (error) { toast(error.message, true); }
  finally { submit.disabled = false; }
});

$('#ticket-search').addEventListener('input', event => { state.search = event.target.value.trim(); renderTickets(); });
$('#priority-filter').addEventListener('change', event => { state.priority = event.target.value; renderTickets(); });
for (const tab of document.querySelectorAll('.tab')) tab.addEventListener('click', () => {
  state.status = tab.dataset.status;
  for (const other of document.querySelectorAll('.tab')) {
    const active = other === tab;
    other.classList.toggle('active', active);
    other.setAttribute('aria-pressed', String(active));
  }
  renderTickets();
});

function updateNav() {
  const current = location.hash.slice(1) || 'overview';
  for (const link of document.querySelectorAll('[data-nav]')) link.classList.toggle('active', link.dataset.nav === current);
}
window.addEventListener('hashchange', updateNav);
updateNav();
$('#today').textContent = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
await refresh();
setInterval(refresh, 3000);
