// ── State ──
let allJobs = [];
let filteredJobs = [];
let selectedJob = null;
let activeDomain = 'user';
let activeOrigin = 'custom'; // 'all', 'custom', 'app', 'system'

// ── DOM refs ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  search: $('#search-input'),
  domainTabs: $('#domain-tabs'),
  jobList: $('#job-list'),
  jobCount: $('#job-count'),
  emptyState: $('#empty-state'),
  detailView: $('#detail-view'),
  detailLabel: $('#detail-label'),
  domainBadge: $('#detail-domain-badge'),
  statusBadge: $('#detail-status-badge'),
  toast: $('#toast'),
};

// ── Init ──
async function init() {
  await loadJobs();
  setupDomainTabs();
  setupSearch();
  setupTabs();
  setupActions();
  setupEditorSave();
  setupXmlSave();
  setupLogControls();

  $('#btn-refresh').addEventListener('click', refresh);
  $('#btn-new').addEventListener('click', createNewJob);
}

async function loadJobs() {
  allJobs = await window.api.getJobs();
  applyFilters();
}

async function refresh() {
  const label = selectedJob?.label;
  await loadJobs();
  if (label) {
    const job = allJobs.find(j => j.label === label);
    if (job) selectJob(job);
  }
}

// ── Domain Tabs ──
function setupDomainTabs() {
  const domains = [
    { id: 'all', label: 'All' },
    { id: 'user', label: 'User' },
    { id: 'global-agent', label: 'Global Agents' },
    { id: 'global-daemon', label: 'Global Daemons' },
    { id: 'system-agent', label: 'Sys Agents' },
    { id: 'system-daemon', label: 'Sys Daemons' },
    { id: 'runtime', label: 'Runtime' },
  ];

  els.domainTabs.innerHTML = domains.map(d =>
    `<button class="domain-tab ${d.id === 'user' ? 'active' : ''}" data-domain="${d.id}">${d.label}</button>`
  ).join('');

  els.domainTabs.addEventListener('click', e => {
    const tab = e.target.closest('.domain-tab');
    if (!tab || !els.domainTabs.contains(tab)) return;
    $$('#domain-tabs .domain-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeDomain = tab.dataset.domain;
    applyFilters();
  });

  // Origin tabs
  const origins = [
    { id: 'all', label: 'All' },
    { id: 'custom', label: 'Custom' },
    { id: 'app', label: 'App' },
  ];

  $('#origin-tabs').innerHTML = origins.map(o =>
    `<button class="origin-tab ${o.id === 'custom' ? 'active' : ''}" data-origin="${o.id}">${o.label}</button>`
  ).join('');

  $('#origin-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.origin-tab');
    if (!tab) return;
    $$('#origin-tabs .origin-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeOrigin = tab.dataset.origin;
    applyFilters();
  });
}

// ── Search ──
function setupSearch() {
  els.search.addEventListener('input', () => applyFilters());
}

function applyFilters() {
  const query = els.search.value.toLowerCase().trim();
  filteredJobs = allJobs.filter(job => {
    if (activeDomain !== 'all' && job.domain !== activeDomain) return false;
    if (activeOrigin !== 'all' && job.origin !== activeOrigin) return false;
    if (query && !job.label.toLowerCase().includes(query)) return false;
    return true;
  });
  renderJobList();
}

// ── Job List ──
function renderJobList() {
  els.jobList.innerHTML = filteredJobs.map(job => {
    const indicatorClass = getIndicatorClass(job);
    const isSelected = selectedJob && selectedJob.label === job.label;
    const pidText = job.pid ? `PID ${job.pid}` : '';
    const originTag = job.origin === 'custom' ? '<span class="origin-tag custom">Custom</span>'
      : job.origin === 'app' ? '<span class="origin-tag app">App</span>'
      : job.origin === 'system' ? '<span class="origin-tag system">System</span>' : '';
    return `
      <div class="job-item ${isSelected ? 'selected' : ''}" data-label="${escapeAttr(job.label)}">
        <div class="job-indicator ${indicatorClass}"></div>
        <div class="job-info">
          <div class="job-label" style="color:#fff;font-size:13px;font-weight:500">${escapeHtml(job.label)}</div>
          <div class="job-sublabel" style="color:#a9b1d6">${escapeHtml(job.domainLabel)} ${originTag}</div>
        </div>
        <div class="job-pid">${pidText}</div>
      </div>
    `;
  }).join('');

  els.jobCount.textContent = `${filteredJobs.length} / ${allJobs.length}`;

  els.jobList.querySelectorAll('.job-item').forEach(item => {
    item.addEventListener('click', () => {
      const label = item.dataset.label;
      const job = allJobs.find(j => j.label === label);
      if (job) selectJob(job);
    });
  });
}

function getIndicatorClass(job) {
  if (job.disabled) return 'disabled';
  if (job.running) return 'running';
  if (job.loaded && job.lastExitStatus !== 0) return 'error';
  if (job.loaded) return 'loaded';
  return 'stopped';
}

// ── Select Job ──
function selectJob(job) {
  selectedJob = job;
  els.emptyState.classList.add('hidden');
  els.detailView.classList.remove('hidden');

  els.detailLabel.textContent = job.label;
  els.domainBadge.textContent = job.domainLabel;
  els.domainBadge.className = 'badge badge-domain';

  updateStatusBadge(job);
  updateActionButtons(job);
  populateEditor(job);
  populateXml(job);
  runAnalysis(job);

  renderJobList(); // update selection highlight
}

function updateStatusBadge(job) {
  let text, cls;
  if (job.running) {
    text = `Running (PID ${job.pid})`;
    cls = 'badge-running';
  } else if (job.disabled) {
    text = 'Disabled';
    cls = 'badge-error';
  } else if (job.loaded && job.lastExitStatus !== 0) {
    text = `Loaded (exit ${job.lastExitStatus})`;
    cls = 'badge-error';
  } else if (job.loaded) {
    text = 'Loaded';
    cls = 'badge-loaded';
  } else {
    text = 'Not Loaded';
    cls = 'badge-stopped';
  }
  els.statusBadge.textContent = text;
  els.statusBadge.className = `badge ${cls}`;
}

function updateActionButtons(job) {
  $('#btn-load').disabled = job.loaded || !job.filePath;
  $('#btn-unload').disabled = !job.loaded || !job.filePath;
  $('#btn-start').disabled = !job.loaded;
  $('#btn-stop').disabled = !job.running;
  $('#btn-reveal').disabled = !job.filePath;
  $('#btn-delete').disabled = !job.filePath;
}

// ── Actions ──
function setupActions() {
  $('#btn-load').addEventListener('click', async () => {
    if (!selectedJob?.filePath) return;
    const result = await window.api.loadJob(selectedJob.filePath);
    if (result.success) {
      showToast('Loaded', 'success');
      await refresh();
    } else {
      showToast(`Load failed: ${result.error}`, 'error');
    }
  });

  $('#btn-unload').addEventListener('click', async () => {
    if (!selectedJob?.filePath) return;
    const result = await window.api.unloadJob(selectedJob.filePath);
    if (result.success) {
      showToast('Unloaded', 'success');
      await refresh();
    } else {
      showToast(`Unload failed: ${result.error}`, 'error');
    }
  });

  $('#btn-start').addEventListener('click', async () => {
    if (!selectedJob) return;
    const result = await window.api.startJob(selectedJob.label);
    if (result.success) {
      showToast('Started', 'success');
      await refresh();
    } else {
      showToast(`Start failed: ${result.error}`, 'error');
    }
  });

  $('#btn-stop').addEventListener('click', async () => {
    if (!selectedJob) return;
    const result = await window.api.stopJob(selectedJob.label);
    if (result.success) {
      showToast('Stopped', 'success');
      await refresh();
    } else {
      showToast(`Stop failed: ${result.error}`, 'error');
    }
  });

  $('#btn-reveal').addEventListener('click', () => {
    if (selectedJob?.filePath) window.api.revealInFinder(selectedJob.filePath);
  });

  $('#btn-delete').addEventListener('click', async () => {
    if (!selectedJob?.filePath) return;
    const result = await window.api.deletePlist(selectedJob.filePath, selectedJob.label);
    if (result.success) {
      showToast('Deleted', 'success');
      selectedJob = null;
      els.detailView.classList.add('hidden');
      els.emptyState.classList.remove('hidden');
      await loadJobs();
    }
  });
}

// ── Tabs ──
function setupTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#panel-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

// ── Calendar Interval ──
const CALENDAR_KEYS = [
  { key: 'Month', label: 'Month', min: 1, max: 12 },
  { key: 'Day', label: 'Day', min: 1, max: 31 },
  { key: 'Weekday', label: 'Wday', min: 0, max: 7 },
  { key: 'Hour', label: 'Hour', min: 0, max: 23 },
  { key: 'Minute', label: 'Min', min: 0, max: 59 },
];

function populateCalendarEntries(calendarInterval) {
  const container = $('#calendar-entries');
  container.innerHTML = '';

  let entries = [];
  if (Array.isArray(calendarInterval)) {
    entries = calendarInterval;
  } else if (calendarInterval && typeof calendarInterval === 'object') {
    entries = [calendarInterval];
  }

  entries.forEach((entry, idx) => addCalendarEntryRow(entry, idx));

  // Setup add button (re-bindするため毎回)
  const btn = $('#btn-add-calendar');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    addCalendarEntryRow({}, container.children.length);
  });
}

function addCalendarEntryRow(entry, idx) {
  const container = $('#calendar-entries');
  const row = document.createElement('div');
  row.className = 'calendar-entry';
  row.dataset.index = idx;

  let html = '';
  for (const ck of CALENDAR_KEYS) {
    const val = entry[ck.key] !== undefined ? entry[ck.key] : '';
    html += `<label>${ck.label}</label><input type="number" data-key="${ck.key}" min="${ck.min}" max="${ck.max}" value="${val}" placeholder="*">`;
  }
  html += '<button type="button" class="btn-remove-calendar" title="Remove">✕</button>';
  row.innerHTML = html;

  row.querySelector('.btn-remove-calendar').addEventListener('click', () => {
    row.remove();
  });

  container.appendChild(row);
}

function getCalendarEntriesFromEditor() {
  const rows = $$('#calendar-entries .calendar-entry');
  if (rows.length === 0) return null;

  const entries = [];
  rows.forEach(row => {
    const entry = {};
    row.querySelectorAll('input[data-key]').forEach(input => {
      const val = input.value.trim();
      if (val !== '') {
        entry[input.dataset.key] = parseInt(val, 10);
      }
    });
    if (Object.keys(entry).length > 0) {
      entries.push(entry);
    }
  });

  if (entries.length === 0) return null;
  if (entries.length === 1) return entries[0];
  return entries;
}

// ── Editor ──
function populateEditor(job) {
  $('#ed-label').value = job.label;
  $('#ed-disabled').checked = job.disabled;
  $('#ed-disabled-label').textContent = job.disabled ? 'Yes' : 'No';
  $('#ed-runatload').checked = job.runAtLoad;
  $('#ed-runatload-label').textContent = job.runAtLoad ? 'Yes' : 'No';
  $('#ed-keepalive').checked = !!job.keepAlive;
  $('#ed-keepalive-label').textContent = job.keepAlive ? 'Yes' : 'No';
  $('#ed-program').value = job.program || '';
  $('#ed-args').value = (job.programArguments || []).join('\n');
  $('#ed-interval').value = job.startInterval || '';
  populateCalendarEntries(job.startCalendarInterval);
  $('#ed-workdir').value = job.workingDirectory || '';
  $('#ed-stdout').value = job.standardOutPath || '';
  $('#ed-stderr').value = job.standardErrorPath || '';
  $('#ed-watchpaths').value = (job.watchPaths || []).join('\n');
  $('#ed-env').value = Object.entries(job.environmentVariables || {}).map(([k, v]) => `${k}=${v}`).join('\n');
  $('#ed-user').value = job.userName || '';
  $('#ed-group').value = job.groupName || '';
  $('#save-status').textContent = '';

  // Toggle labels
  ['disabled', 'runatload', 'keepalive'].forEach(id => {
    $(`#ed-${id}`).addEventListener('change', function () {
      $(`#ed-${id}-label`).textContent = this.checked ? 'Yes' : 'No';
    });
  });

  // Disable editing for system/readonly jobs
  const readonly = !job.filePath || job.domain.startsWith('system');
  $$('#panel-editor input:not([readonly]), #panel-editor textarea').forEach(el => {
    if (el.id === 'ed-label') return;
    el.disabled = readonly;
  });
  $('#btn-save-editor').disabled = readonly;
}

function setupEditorSave() {
  $('#btn-save-editor').addEventListener('click', async () => {
    if (!selectedJob?.filePath) return;

    const data = { ...selectedJob.plistData };
    data.Disabled = $('#ed-disabled').checked;
    data.RunAtLoad = $('#ed-runatload').checked;
    data.KeepAlive = $('#ed-keepalive').checked;

    const program = $('#ed-program').value.trim();
    const args = $('#ed-args').value.trim().split('\n').filter(Boolean);

    if (program) data.Program = program;
    else delete data.Program;

    if (args.length > 0) data.ProgramArguments = args;
    else delete data.ProgramArguments;

    const interval = parseInt($('#ed-interval').value, 10);
    if (interval > 0) data.StartInterval = interval;
    else delete data.StartInterval;

    const calendarInterval = getCalendarEntriesFromEditor();
    if (calendarInterval) data.StartCalendarInterval = calendarInterval;
    else delete data.StartCalendarInterval;

    const workdir = $('#ed-workdir').value.trim();
    if (workdir) data.WorkingDirectory = workdir;
    else delete data.WorkingDirectory;

    const stdout = $('#ed-stdout').value.trim();
    if (stdout) data.StandardOutPath = stdout;
    else delete data.StandardOutPath;

    const stderr = $('#ed-stderr').value.trim();
    if (stderr) data.StandardErrorPath = stderr;
    else delete data.StandardErrorPath;

    const watchPaths = $('#ed-watchpaths').value.trim().split('\n').filter(Boolean);
    if (watchPaths.length > 0) data.WatchPaths = watchPaths;
    else delete data.WatchPaths;

    const envLines = $('#ed-env').value.trim().split('\n').filter(Boolean);
    const env = {};
    for (const line of envLines) {
      const idx = line.indexOf('=');
      if (idx > 0) env[line.slice(0, idx)] = line.slice(idx + 1);
    }
    if (Object.keys(env).length > 0) data.EnvironmentVariables = env;
    else delete data.EnvironmentVariables;

    const user = $('#ed-user').value.trim();
    if (user) data.UserName = user;
    else delete data.UserName;

    const group = $('#ed-group').value.trim();
    if (group) data.GroupName = group;
    else delete data.GroupName;

    // Build XML using plist lib on main process side
    // We send as XML string
    const plistModule = await import('https://cdn.jsdelivr.net/npm/plist@3.1.0/+esm').catch(() => null);

    // Instead, we'll rebuild XML on the main side — send data as JSON to main
    // Actually, let's build it simply here. We have the xml, let's just save via main.
    // Simplest: send the whole data to main and let it rebuild
    const xmlContent = buildPlistXml(data);
    const result = await window.api.savePlist(selectedJob.filePath, xmlContent);

    if (result.success) {
      $('#save-status').textContent = 'Saved';
      $('#save-status').style.color = '#9ece6a';
      await refresh();
    } else {
      $('#save-status').textContent = `Error: ${result.error}`;
      $('#save-status').style.color = '#f7768e';
    }
  });
}

// ── Build plist XML from JS object ──
function buildPlistXml(data) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">'];
  lines.push(serializeValue(data, 0));
  lines.push('</plist>');
  return lines.join('\n');
}

function serializeValue(val, indent) {
  const pad = '\t'.repeat(indent);
  if (val === true) return `${pad}<true/>`;
  if (val === false) return `${pad}<false/>`;
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return `${pad}<integer>${val}</integer>`;
    return `${pad}<real>${val}</real>`;
  }
  if (typeof val === 'string') return `${pad}<string>${escapeXml(val)}</string>`;
  if (Array.isArray(val)) {
    if (val.length === 0) return `${pad}<array/>`;
    const items = val.map(v => serializeValue(v, indent + 1)).join('\n');
    return `${pad}<array>\n${items}\n${pad}</array>`;
  }
  if (val instanceof Date) {
    return `${pad}<date>${val.toISOString()}</date>`;
  }
  if (typeof val === 'object' && val !== null) {
    const keys = Object.keys(val);
    if (keys.length === 0) return `${pad}<dict/>`;
    const entries = keys.map(k =>
      `${pad}\t<key>${escapeXml(k)}</key>\n${serializeValue(val[k], indent + 1)}`
    ).join('\n');
    return `${pad}<dict>\n${entries}\n${pad}</dict>`;
  }
  return `${pad}<string>${String(val)}</string>`;
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── XML Tab ──
function populateXml(job) {
  $('#xml-editor').value = job.xml || '(No plist file)';
  $('#xml-editor').disabled = !job.filePath || job.domain.startsWith('system');
  $('#btn-save-xml').disabled = !job.filePath || job.domain.startsWith('system');
  $('#xml-save-status').textContent = '';
}

function setupXmlSave() {
  $('#btn-save-xml').addEventListener('click', async () => {
    if (!selectedJob?.filePath) return;
    const xml = $('#xml-editor').value;
    const result = await window.api.savePlist(selectedJob.filePath, xml);
    if (result.success) {
      $('#xml-save-status').textContent = 'Saved';
      $('#xml-save-status').style.color = '#9ece6a';
      await refresh();
    } else {
      $('#xml-save-status').textContent = `Error: ${result.error}`;
      $('#xml-save-status').style.color = '#f7768e';
    }
  });

  $('#btn-format-xml').addEventListener('click', () => {
    // Simple XML formatting via textarea
    const xml = $('#xml-editor').value;
    // Just re-indent (basic)
    try {
      let formatted = '';
      let indent = 0;
      const lines = xml.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith('</')) indent = Math.max(0, indent - 1);
        formatted += '\t'.repeat(indent) + line + '\n';
        if (line.startsWith('<') && !line.startsWith('</') && !line.startsWith('<?') && !line.startsWith('<!') &&
            !line.endsWith('/>') && !line.includes('</')) {
          indent++;
        }
      }
      $('#xml-editor').value = formatted;
    } catch {}
  });
}

// ── Analysis ──
async function runAnalysis(job) {
  const issues = await window.api.analyzeJob(job);
  const html = issues.map(issue => {
    const icons = { error: '✕', warning: '⚠', info: 'ℹ', ok: '✓' };
    return `
      <div class="analysis-item ${issue.level}">
        <div class="analysis-icon">${icons[issue.level] || '●'}</div>
        <div class="analysis-message">${escapeHtml(issue.message)}</div>
      </div>
    `;
  }).join('');
  $('#analysis-content').innerHTML = html;

  $('#btn-reanalyze').onclick = () => runAnalysis(selectedJob);
}

// ── Logs ──
function setupLogControls() {
  const loadLog = async () => {
    if (!selectedJob) return;
    const source = $('#log-source').value;
    let result;

    if (source === 'stdout' && selectedJob.standardOutPath) {
      result = await window.api.readLog(selectedJob.standardOutPath, 300);
    } else if (source === 'stderr' && selectedJob.standardErrorPath) {
      result = await window.api.readLog(selectedJob.standardErrorPath, 300);
    } else if (source === 'system') {
      result = await window.api.readSystemLog(selectedJob.label, 100);
    } else {
      result = { content: `(No ${source} path configured for this job)` };
    }

    $('#log-content').textContent = result.content;
    if ($('#log-autoscroll').checked) {
      $('#log-content').scrollTop = $('#log-content').scrollHeight;
    }
  };

  $('#btn-refresh-log').addEventListener('click', loadLog);
  $('#log-source').addEventListener('change', loadLog);

  // Auto-load when switching to logs tab
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.tab === 'logs') loadLog();
    });
  });
}

// ── New Job ──
async function createNewJob() {
  const result = await window.api.createPlist('user');
  if (result.success) {
    showToast('Created new job', 'success');
    await loadJobs();
    const job = allJobs.find(j => j.filePath === result.filePath);
    if (job) selectJob(job);
  }
}

// ── Toast ──
function showToast(message, type = '') {
  els.toast.textContent = message;
  els.toast.className = type;
  clearTimeout(els.toast._timer);
  els.toast._timer = setTimeout(() => {
    els.toast.className = 'hidden';
  }, 3000);
}

// ── Helpers ──
function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Boot ──
init();
