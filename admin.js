const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const SERVICE_NAMES = {
  general: 'General Dentistry', cosmetic: 'Cosmetic Dentistry', implants: 'Dental Implants',
  ortho: 'Orthodontics', whitening: 'Teeth Whitening', pediatric: 'Pediatric Dentistry',
  root: 'Root Canal Treatment', crowns: 'Dental Crowns',
};
const SERVICE_DESCRIPTIONS = {
  general: 'Checkups, cleanings and preventive care.', cosmetic: 'Veneers, bonding and smile design.',
  implants: 'Permanent replacements for missing teeth.', ortho: 'Clear aligners and braces.',
  whitening: 'In-studio and take-home whitening.', pediatric: 'Gentle care for children.',
  root: 'Precise endodontic care.', crowns: 'Custom restorations for strength and fit.',
};
const TIMES = ['9:00 AM', '9:45 AM', '10:30 AM', '11:15 AM', '1:00 PM', '1:45 PM', '2:30 PM', '3:15 PM', '4:00 PM', '4:45 PM', '5:30 PM'];
const state = { email: '', appointments: [], site: { services: [], hours: {}, times: [] }, view: 'overview', filters: { q: '', status: 'all', date: '' }, activeAppointment: null, sidebarOpen: false };
let toastTimer;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Something went wrong.'), { status: response.status });
  return payload;
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function dateLabel(value, options = { weekday: 'long', month: 'long', day: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, options).format(date);
}

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusLabel(status) { return String(status || 'pending').replaceAll('_', ' '); }
function statusChip(status) { return `<span class="status status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`; }
function serviceName(id) { return SERVICE_NAMES[id] || id || '—'; }

function renderLogin(message = '') {
  app.innerHTML = `
    <main class="login-page">
      <section class="login-art" aria-label="Green">
        <div class="login-brand"><span class="brand-mark">G</span><span>Green<small>Practice Desk</small></span></div>
        <div class="login-copy"><p class="eyebrow">Staff access</p><h1>A clear view of the day ahead.</h1><p>Your clinic schedule, patient bookings and appointment updates in one quiet workspace.</p></div>
        <div class="login-foot">Green · Zamalek, Cairo</div>
      </section>
      <section class="login-panel">
        <form class="login-form" id="login-form">
          <p class="eyebrow" style="color:var(--green)">Practice Desk</p><h2>Welcome back</h2><p>Sign in with your administrator account.</p>
          <div class="field"><label for="login-email">Email address</label><input id="login-email" name="email" type="email" autocomplete="username" required autofocus></div>
          <div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div>
          <p class="error-text" id="login-error" role="alert">${escapeHtml(message)}</p>
          <button class="btn btn-wide" type="submit">Sign in to dashboard</button>
        </form>
      </section>
    </main>`;
  app.querySelector('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const data = new FormData(form);
    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) });
      state.email = result.email;
      await loadAppointments();
      await loadSiteConfig();
      renderShell();
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Sign in to dashboard';
      form.querySelector('#login-error').textContent = error.message;
    }
  });
}

const NAV = [
  ['overview', '◫', 'Overview'], ['appointments', '▦', 'Appointments'], ['patients', '◎', 'Patients'],
  ['services', '✳', 'Services'], ['schedule', '◷', 'Clinic hours'], ['settings', '⚙', 'Settings'],
];

function renderShell() {
  const initials = state.email.split('@')[0].slice(0, 2).toUpperCase();
  app.innerHTML = `
    <div class="app-shell">
      <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
      <aside class="sidebar" id="sidebar">
        <a class="side-brand" href="/admin" aria-label="Lumen practice desk home"><span class="brand-mark">L</span><span>Lumen<small>Practice Desk</small></span></a>
        <p class="nav-caption">Workspace</p>
        <nav class="side-nav" aria-label="Admin sections">${NAV.map(([id, icon, title]) => `<button class="nav-link ${state.view === id ? 'active' : ''}" data-view="${id}" type="button"><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</button>`).join('')}</nav>
        <div class="side-bottom"><div class="account-card"><span class="account-avatar">${escapeHtml(initials)}</span><span class="account-name">${escapeHtml(state.email)}<small class="account-role">Practice administrator</small></span></div><button class="nav-link" id="logout-button" type="button"><span class="nav-icon" aria-hidden="true">↪</span>Sign out</button></div>
      </aside>
      <main class="main">
        <header class="topbar"><div class="top-left"><button class="mobile-menu" id="mobile-menu" aria-label="Open navigation" aria-expanded="false" type="button">☰</button><div><p class="top-title">Green</p><p class="top-date" id="top-date"></p></div></div><div class="top-actions"><a class="btn btn-quiet" href="/" target="_blank" rel="noopener">View booking site ↗</a><button class="btn btn-quiet" id="refresh-button" type="button" aria-label="Refresh appointments">Refresh</button></div></header>
        <section id="view-overview" class="view"></section>
        <section id="view-appointments" class="view"></section>
        <section id="view-patients" class="view"></section>
        <section id="view-services" class="view"></section>
        <section id="view-schedule" class="view"></section>
        <section id="view-settings" class="view"></section>
      </main>
    </div>
    <dialog id="appointment-dialog"></dialog>`;
  app.querySelector('#top-date').textContent = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date());
  app.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  app.querySelector('#refresh-button').addEventListener('click', async () => { await loadAppointments(); renderView(); showToast('Appointments are up to date.'); });
  app.querySelector('#logout-button').addEventListener('click', logout);
  app.querySelector('#mobile-menu').addEventListener('click', toggleSidebar);
  app.querySelector('#sidebar-backdrop').addEventListener('click', toggleSidebar);
  renderView();
}

async function loadAppointments() {
  const result = await api('/api/admin/appointments');
  state.appointments = result.appointments;
}

async function loadSiteConfig() {
  const result = await api('/api/admin/site');
  state.site = result.site || result;
}

function setView(view) {
  state.view = view;
  state.sidebarOpen = false;
  const sidebar = app.querySelector('#sidebar');
  sidebar?.classList.remove('open');
  app.querySelector('#sidebar-backdrop')?.classList.remove('show');
  const menu = app.querySelector('#mobile-menu');
  if (menu) menu.setAttribute('aria-expanded', 'false');
  app.querySelectorAll('.nav-link[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  renderView();
}

function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  app.querySelector('#sidebar').classList.toggle('open', state.sidebarOpen);
  app.querySelector('#sidebar-backdrop').classList.toggle('show', state.sidebarOpen);
  app.querySelector('#mobile-menu').setAttribute('aria-expanded', String(state.sidebarOpen));
}

function renderView() {
  const titles = { overview: 'Overview', appointments: 'Appointments', patients: 'Patients', services: 'Services', schedule: 'Clinic hours', settings: 'Settings' };
  app.querySelectorAll('.view').forEach((view) => view.classList.toggle('active', view.id === `view-${state.view}`));
  app.querySelector('.top-title').textContent = titles[state.view] || 'Practice Desk';
  const target = app.querySelector(`#view-${state.view}`);
  if (!target) return;
  const renderers = { overview: renderOverview, appointments: renderAppointments, patients: renderPatients, services: renderServices, schedule: renderSchedule, settings: renderSettings };
  target.innerHTML = renderers[state.view]();
  wireView(target);
}

function getTodayAppointments() {
  return state.appointments.filter((appointment) => appointment.date === localDate()).sort((a, b) => TIMES.indexOf(a.time) - TIMES.indexOf(b.time));
}

function renderOverview() {
  const today = getTodayAppointments();
  const pending = state.appointments.filter((appointment) => appointment.status === 'pending').length;
  const confirmedToday = today.filter((appointment) => ['confirmed', 'checked_in'].includes(appointment.status)).length;
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const completed = state.appointments.filter((appointment) => appointment.status === 'completed' && new Date(appointment.updatedAt) >= weekStart).length;
  const upcoming = state.appointments
    .filter((appointment) => appointment.date >= localDate() && !['cancelled', 'completed'].includes(appointment.status))
    .sort((a, b) => a.date.localeCompare(b.date) || TIMES.indexOf(a.time) - TIMES.indexOf(b.time))
    .slice(0, 6);
  const bookingQueue = state.appointments
    .filter((appointment) => appointment.status === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date) || TIMES.indexOf(a.time) - TIMES.indexOf(b.time))
    .slice(0, 5);
  return `
    <div class="page-heading"><div><p class="eyebrow">Practice overview</p><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}.</h1><p>Your upcoming visits and booking requests, at a glance.</p></div><button class="btn" data-view="appointments" type="button">Open appointments</button></div>
    <div class="stats-grid">
      ${statCard('Today’s appointments', today.length, `${confirmedToday} confirmed or checked in`, '▦')}
      ${statCard('Awaiting confirmation', pending, pending ? 'Needs staff review' : 'Nothing waiting', '◷')}
      ${statCard('Completed this week', completed, 'Since Monday', '✓')}
      ${statCard('Active patients', new Set(state.appointments.map((appointment) => appointment.email)).size, 'Based on booking history', '◎')}
    </div>
    <div class="dashboard-grid">
      <section class="panel upcoming-panel"><div class="panel-head"><div><h2>Upcoming appointments</h2><p>Next scheduled visits · Cairo time</p></div><button class="text-link" data-view="appointments" type="button">All appointments →</button></div>
        <div class="agenda">${upcoming.length ? upcoming.map((appointment) => `<article class="agenda-row"><span class="agenda-date"><b>${escapeHtml(new Date(`${appointment.date}T12:00:00`).toLocaleDateString(undefined, { day: '2-digit' }))}</b><small>${escapeHtml(new Date(`${appointment.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short' }))}</small></span><span class="agenda-time">${escapeHtml(appointment.time)}</span><span class="agenda-person">${escapeHtml(appointment.name)}<small>${escapeHtml(serviceName(appointment.service))} · ${escapeHtml(appointment.ref)}</small></span>${statusChip(appointment.status)}<button class="table-action" data-open-appointment="${escapeHtml(appointment.id)}" type="button">Details</button></article>`).join('') : '<div class="empty"><strong>No upcoming appointments</strong>New bookings will appear here as soon as a patient requests a visit.</div>'}</div>
      </section>
      <section class="panel queue-panel"><div class="panel-head"><div><h2>Booking requests</h2><p>Waiting for your review</p></div><span class="status status-pending">${pending} pending</span></div>
        <div class="week-list">${bookingQueue.map((appointment) => `<button class="week-item" data-open-appointment="${escapeHtml(appointment.id)}" type="button"><span><b>${escapeHtml(appointment.name)}</b><small>${escapeHtml(serviceName(appointment.service))}</small></span><span>${escapeHtml(dateLabel(appointment.date, { month: 'short', day: 'numeric' }))}<small>${escapeHtml(appointment.time)}</small></span></button>`).join('') || '<div class="empty"><strong>Queue is clear</strong>No requests need review.</div>'}</div>
      </section>
    </div>`;
}

function statCard(title, value, foot, icon) {
  return `<article class="stat-card"><div class="stat-top"><span>${escapeHtml(title)}</span><span class="stat-icon" aria-hidden="true">${icon}</span></div><div class="stat-value">${Number(value).toLocaleString()}</div><div class="stat-foot">${escapeHtml(foot)}</div></article>`;
}

function filteredAppointments() {
  const { q, status, date } = state.filters;
  const query = q.trim().toLowerCase();
  return state.appointments.filter((appointment) => {
    const matchesStatus = status === 'all' || appointment.status === status;
    const matchesDate = !date || appointment.date === date;
    const searchable = `${appointment.name} ${appointment.email} ${appointment.phone} ${appointment.ref} ${serviceName(appointment.service)}`.toLowerCase();
    return matchesStatus && matchesDate && (!query || searchable.includes(query));
  }).sort((a, b) => b.date.localeCompare(a.date) || TIMES.indexOf(a.time) - TIMES.indexOf(b.time));
}

function renderAppointmentRows(appointments) {
  if (!appointments.length) return '<tr><td colspan="6"><div class="empty"><strong>No matching appointments</strong>Try changing the search or filters.</div></td></tr>';
  return appointments.map((appointment) => `<tr>
    <td class="patient-cell">${escapeHtml(appointment.name)}<small>${escapeHtml(appointment.email)}</small></td>
    <td>${escapeHtml(dateLabel(appointment.date, { month: 'short', day: 'numeric', year: 'numeric' }))}<br><span class="muted">${escapeHtml(appointment.time)}</span></td>
    <td>${escapeHtml(serviceName(appointment.service))}</td><td><span class="ref">${escapeHtml(appointment.ref)}</span></td>
    <td><label class="sr-only" for="status-${escapeHtml(appointment.id)}">Status for ${escapeHtml(appointment.name)}</label><select id="status-${escapeHtml(appointment.id)}" class="select-status" data-status-id="${escapeHtml(appointment.id)}">${['pending', 'confirmed', 'checked_in', 'completed', 'cancelled'].map((status) => `<option value="${status}" ${appointment.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}</select></td>
    <td><button class="table-action" data-open-appointment="${escapeHtml(appointment.id)}" type="button">Details</button></td>
  </tr>`).join('');
}

function renderAppointments() {
  const appointments = filteredAppointments();
  return `
    <div class="page-heading"><div><h1>Appointments</h1><p>Review bookings, update status, or change a visit time.</p></div><span class="status status-confirmed">${state.appointments.length} total</span></div>
    <div class="toolbar"><label class="search"><span class="search-icon" aria-hidden="true">⌕</span><span class="sr-only">Search appointments</span><input id="appointment-search" type="search" placeholder="Search patient, email or reference" value="${escapeHtml(state.filters.q)}"></label>
      <select id="appointment-status" aria-label="Filter by appointment status"><option value="all">All statuses</option>${['pending', 'confirmed', 'checked_in', 'completed', 'cancelled'].map((status) => `<option value="${status}" ${state.filters.status === status ? 'selected' : ''}>${escapeHtml(statusLabel(status))}</option>`).join('')}</select>
      <input id="appointment-date" type="date" aria-label="Filter by date" value="${escapeHtml(state.filters.date)}"><button class="btn btn-quiet" id="clear-filters" type="button">Clear filters</button>
    </div>
    <section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Patient</th><th>Date & time</th><th>Service</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody id="appointment-rows">${renderAppointmentRows(appointments)}</tbody></table></div><div class="table-count" id="appointment-count">Showing ${appointments.length} of ${state.appointments.length} appointments</div></section>`;
}

function getPatients() {
  const patients = new Map();
  state.appointments.forEach((appointment) => {
    const key = appointment.email.toLowerCase();
    const current = patients.get(key) || { name: appointment.name, email: appointment.email, phone: appointment.phone, appointments: [] };
    current.appointments.push(appointment);
    patients.set(key, current);
  });
  return [...patients.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function renderPatients() {
  const patients = getPatients();
  return `<div class="page-heading"><div><h1>Patients</h1><p>Contact details and booking history from online appointments.</p></div><span class="status status-confirmed">${patients.length} patients</span></div>
    <div class="toolbar"><label class="search"><span class="search-icon" aria-hidden="true">⌕</span><span class="sr-only">Search patients</span><input id="patient-search" type="search" placeholder="Search name, email or phone"></label></div>
    <section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Patient</th><th>Phone</th><th>Visits</th><th>Last appointment</th><th>Most recent service</th></tr></thead><tbody id="patient-rows">${renderPatientRows(patients)}</tbody></table></div></section>`;
}

function renderPatientRows(patients) {
  if (!patients.length) return '<tr><td colspan="5"><div class="empty"><strong>No patient records yet</strong>Patient profiles are created when bookings arrive.</div></td></tr>';
  return patients.map((patient) => {
    const latest = [...patient.appointments].sort((a, b) => b.date.localeCompare(a.date))[0];
    return `<tr><td class="patient-cell">${escapeHtml(patient.name)}<small>${escapeHtml(patient.email)}</small></td><td>${escapeHtml(patient.phone)}</td><td>${patient.appointments.length}</td><td>${escapeHtml(dateLabel(latest.date, { month: 'short', day: 'numeric', year: 'numeric' }))}</td><td>${escapeHtml(serviceName(latest.service))}</td></tr>`;
  }).join('');
}

function renderServices() {
  const services = state.site?.services?.length ? state.site.services : Object.entries(SERVICE_NAMES).map(([id, name]) => ({ id, name, description: SERVICE_DESCRIPTIONS[id] || 'Service overview.' }));
  return `<div class="page-heading"><div><h1>Services</h1><p>Manage the treatments patients can book online.</p></div><span class="status status-confirmed">${services.length} active</span></div>
    <section class="panel settings-form"><form id="services-form">
      ${services.map((service, index) => `
        <div class="service-edit-row">
          <div class="field"><label>Service id</label><input name="service-id" value="${escapeHtml(service.id)}"></div>
          <div class="field"><label>Service name</label><input name="service-name" value="${escapeHtml(service.name)}"></div>
          <div class="field field-wide"><label>Description</label><input name="service-description" value="${escapeHtml(service.description)}"></div>
        </div>
      `).join('')}
      <div class="dialog-actions"><button class="btn" type="submit">Save site services</button></div>
    </form></section>`;
}

function renderSchedule() {
  const hours = state.site?.hours && Object.keys(state.site.hours).length ? state.site.hours : {
    Sunday: 'Closed', Monday: '9:00 AM – 8:00 PM', Tuesday: '9:00 AM – 8:00 PM', Wednesday: '9:00 AM – 8:00 PM', Thursday: '9:00 AM – 8:00 PM', Friday: '2:00 PM – 8:00 PM', Saturday: '10:00 AM – 6:00 PM',
  };
  const times = state.site?.times?.length ? state.site.times : TIMES;
  return `<div class="page-heading"><div><h1>Clinic hours</h1><p>Set public hours and standard booking times.</p></div></div>
    <div class="settings-layout"><section class="panel"><div class="panel-head"><div><h2>Weekly opening hours</h2><p>Green · Zamalek, Cairo</p></div></div>
      <form id="hours-form">
        <div class="hours-list">${Object.entries(hours).map(([day, value]) => `<label class="hours-row"><span>${escapeHtml(day)}</span><input name="hours-${escapeHtml(day)}" data-hours-day="${escapeHtml(day)}" value="${escapeHtml(value)}"></label>`).join('')}</div>
        <div class="dialog-actions"><button class="btn" type="submit">Save clinic hours</button></div>
      </form>
    </section>
    <section class="panel"><div class="panel-head"><div><h2>Online booking slots</h2><p>Shown in Cairo local time.</p></div></div><div class="week-list">${times.map((time) => `<div class="week-item"><span>${escapeHtml(time)}</span><span>45 minutes</span></div>`).join('')}</div></section></div>
    <p class="note-box" style="margin-top:16px">Admin updates apply immediately to the staff dashboard configuration and can be reused by the public booking page.</p>`;
}

function renderSettings() {
  return `<div class="page-heading"><div><h1>Settings</h1><p>Manage access to the staff dashboard.</p></div></div>
    <div class="settings-layout"><section class="panel settings-form"><h2>Change administrator password</h2><p>Use at least 12 characters. Changing the password signs out active sessions.</p>
      <form id="password-form"><div class="field"><label for="current-password">Current password</label><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required></div>
      <div class="field"><label for="next-password">New password</label><input id="next-password" name="nextPassword" type="password" minlength="12" autocomplete="new-password" required></div>
      <p class="error-text" id="password-error" role="alert"></p><button class="btn" type="submit">Update password</button></form>
    </section><aside class="panel settings-form"><h2>Practice account</h2><p>Current signed-in administrator</p><div class="note-box">${escapeHtml(state.email)}<br>Sessions expire after 8 hours. Appointment and account data are kept on this server in the ignored <code>data/</code> directory.</div></aside></div>`;
}

function wireView(target) {
  target.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
  target.querySelectorAll('[data-open-appointment]').forEach((button) => button.addEventListener('click', () => openAppointment(button.dataset.openAppointment)));
  target.querySelectorAll('[data-status-id]').forEach((select) => select.addEventListener('change', () => updateStatus(select.dataset.statusId, select.value)));
  target.querySelector('#appointment-search')?.addEventListener('input', (event) => { state.filters.q = event.target.value; updateAppointmentTable(); });
  target.querySelector('#appointment-status')?.addEventListener('change', (event) => { state.filters.status = event.target.value; updateAppointmentTable(); });
  target.querySelector('#appointment-date')?.addEventListener('change', (event) => { state.filters.date = event.target.value; updateAppointmentTable(); });
  target.querySelector('#clear-filters')?.addEventListener('click', () => { state.filters = { q: '', status: 'all', date: '' }; renderView(); });
  target.querySelector('#patient-search')?.addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase();
    const patients = getPatients().filter((patient) => `${patient.name} ${patient.email} ${patient.phone}`.toLowerCase().includes(query));
    target.querySelector('#patient-rows').innerHTML = renderPatientRows(patients);
  });
  target.querySelector('#services-form')?.addEventListener('submit', saveServices);
  target.querySelector('#hours-form')?.addEventListener('submit', saveHours);
  target.querySelector('#password-form')?.addEventListener('submit', changePassword);
}

function updateAppointmentTable() {
  const rows = app.querySelector('#appointment-rows');
  if (!rows) return;
  const appointments = filteredAppointments();
  rows.innerHTML = renderAppointmentRows(appointments);
  app.querySelector('#appointment-count').textContent = `Showing ${appointments.length} of ${state.appointments.length} appointments`;
  rows.querySelectorAll('[data-open-appointment]').forEach((button) => button.addEventListener('click', () => openAppointment(button.dataset.openAppointment)));
  rows.querySelectorAll('[data-status-id]').forEach((select) => select.addEventListener('change', () => updateStatus(select.dataset.statusId, select.value)));
}

async function updateStatus(id, status) {
  try {
    await api(`/api/admin/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await loadAppointments();
    renderView();
    showToast(`Appointment marked ${statusLabel(status)}.`);
  } catch (error) {
    showToast(error.message);
    renderView();
  }
}

function openAppointment(id) {
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return;
  state.activeAppointment = appointment;
  const dialog = app.querySelector('#appointment-dialog');
  dialog.innerHTML = `
    <div class="dialog-head"><div><h2>${escapeHtml(appointment.name)}</h2><p>${escapeHtml(appointment.ref)} · ${statusLabel(appointment.status)}</p></div><button class="dialog-close" data-close-dialog type="button" aria-label="Close details">×</button></div>
    <div class="dialog-body"><div class="detail-grid">
      ${detail('Email', appointment.email)}${detail('Phone', appointment.phone)}${detail('Service', serviceName(appointment.service))}${detail('Dentist', 'Dr. Mohamed Ayman')}
      ${detail('Date', dateLabel(appointment.date))}${detail('Time', appointment.time)}${detail('Created', new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(appointment.createdAt)))}${detail('Status', statusLabel(appointment.status))}
    </div><h3>Patient notes</h3><div class="detail-notes">${appointment.notes ? escapeHtml(appointment.notes) : 'No notes provided.'}</div>
    <h3>Reschedule appointment</h3><form id="reschedule-form"><div class="reschedule-grid"><div class="field"><label for="reschedule-date">Date</label><input id="reschedule-date" name="date" type="date" min="${localDate()}" value="${escapeHtml(appointment.date)}" required></div><div class="field"><label for="reschedule-time">Time</label><select id="reschedule-time" name="time">${TIMES.map((time) => `<option value="${escapeHtml(time)}" ${time === appointment.time ? 'selected' : ''}>${escapeHtml(time)}</option>`).join('')}</select></div></div><p class="error-text" id="reschedule-error" role="alert"></p><div class="dialog-actions"><button class="btn btn-quiet" data-close-dialog type="button">Close</button><button class="btn" type="submit">Save new time</button></div></form></div>`;
  dialog.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));
  dialog.querySelector('#reschedule-form').addEventListener('submit', rescheduleAppointment);
  dialog.showModal();
}

function detail(label, value) {
  return `<div class="detail-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value || '—')}</strong></div>`;
}

async function rescheduleAppointment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  try {
    await api(`/api/admin/appointments/${encodeURIComponent(state.activeAppointment.id)}`, { method: 'PATCH', body: JSON.stringify({ date: values.get('date'), time: values.get('time') }) });
    app.querySelector('#appointment-dialog').close();
    await loadAppointments();
    renderView();
    showToast('Appointment rescheduled.');
  } catch (error) {
    form.querySelector('#reschedule-error').textContent = error.message;
  }
}

async function saveServices(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const ids = [...form.querySelectorAll('input[name="service-id"]')].map((input) => input.value.trim());
  const names = [...form.querySelectorAll('input[name="service-name"]')].map((input) => input.value.trim());
  const descriptions = [...form.querySelectorAll('input[name="service-description"]')].map((input) => input.value.trim());
  const services = ids.map((id, index) => ({
    id: id || `service-${index + 1}`,
    name: names[index] || `Service ${index + 1}`,
    description: descriptions[index] || 'Updated service description.',
  }));
  try {
    const result = await api('/api/admin/site', { method: 'PATCH', body: JSON.stringify({ services }) });
    state.site = result.site || result;
    renderView();
    showToast('Service catalog updated.');
  } catch (error) {
    showToast(error.message);
  }
}

async function saveHours(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const hours = {};
  form.querySelectorAll('[data-hours-day]').forEach((input) => {
    const day = input.dataset.hoursDay;
    if (day) hours[day] = input.value.trim() || 'Closed';
  });
  try {
    const result = await api('/api/admin/site', { method: 'PATCH', body: JSON.stringify({ hours }) });
    state.site = result.site || result;
    renderView();
    showToast('Clinic hours updated.');
  } catch (error) {
    showToast(error.message);
  }
}

async function changePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const errorEl = form.querySelector('#password-error');
  try {
    await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ currentPassword: values.get('currentPassword'), nextPassword: values.get('nextPassword') }) });
    state.email = '';
    renderLogin('Password updated. Sign in with your new password.');
  } catch (error) { errorEl.textContent = error.message; }
}

async function logout() {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); }
  finally { state.email = ''; state.appointments = []; renderLogin(); }
}

async function start() {
  try {
    const session = await api('/api/admin/session');
    state.email = session.email;
    await loadAppointments();
    await loadSiteConfig();
    renderShell();
  } catch {
    renderLogin();
  }
}

start();