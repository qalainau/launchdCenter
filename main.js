const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const plist = require('plist');

const PLIST_DIRS = [
  { path: path.join(process.env.HOME, 'Library/LaunchAgents'), domain: 'user', label: 'User Agents' },
  { path: '/Library/LaunchAgents', domain: 'global-agent', label: 'Global Agents' },
  { path: '/Library/LaunchDaemons', domain: 'global-daemon', label: 'Global Daemons' },
  { path: '/System/Library/LaunchAgents', domain: 'system-agent', label: 'System Agents' },
  { path: '/System/Library/LaunchDaemons', domain: 'system-daemon', label: 'System Daemons' },
];

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.session.clearCache().then(() => {
    mainWindow.loadFile('src/index.html');
  });

  const menu = Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ── Helpers ──

function getUid() {
  return execSync('id -u').toString().trim();
}

function getLoadedJobs() {
  try {
    const raw = execSync('launchctl list', { encoding: 'utf8', timeout: 10000 });
    const lines = raw.trim().split('\n').slice(1); // skip header
    const jobs = {};
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const pid = parts[0].trim();
        const lastExitStatus = parts[1].trim();
        const label = parts[2].trim();
        jobs[label] = {
          pid: pid === '-' ? null : parseInt(pid, 10),
          lastExitStatus: parseInt(lastExitStatus, 10) || 0,
          loaded: true,
        };
      }
    }
    return jobs;
  } catch {
    return {};
  }
}

function parsePlistFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Handle binary plist by converting first
    if (!content.startsWith('<?xml')) {
      const converted = execSync(`plutil -convert xml1 -o - "${filePath}"`, { encoding: 'utf8' });
      return { data: plist.parse(converted), xml: converted };
    }
    return { data: plist.parse(content), xml: content };
  } catch (e) {
    return { data: null, xml: '', error: e.message };
  }
}

// Known app bundle ID prefixes / vendor domains
const APP_VENDOR_PREFIXES = [
  'com.apple.', 'com.google.', 'com.microsoft.', 'com.adobe.',
  'com.docker.', 'com.jetbrains.', 'com.brave.', 'com.spotify.',
  'com.dropbox.', 'com.1password.', 'com.raycast.', 'com.slack.',
  'com.zoom.', 'com.github.', 'com.figma.', 'com.notion.',
  'com.linear.', 'com.arc.', 'com.viscosityvpn.', 'com.logi.',
  'com.logitech.', 'com.elgato.', 'org.mozilla.', 'org.chromium.',
  'io.tailscale.', 'net.tunnelblick.', 'com.automattic.',
  'com.cloudflare.', 'com.openssh.', 'com.valvesoftware.',
];

// Cache for mdfind results
const mdfindCache = {};

function classifyJobOrigin(label, filePath) {
  // No plist file = runtime-only, classify by prefix only
  if (!filePath) {
    const lowerLabel = label.toLowerCase();
    for (const prefix of APP_VENDOR_PREFIXES) {
      if (lowerLabel.startsWith(prefix)) return 'app';
    }
    return 'app'; // runtime-only jobs are almost always from apps/system
  }
  // System domain files
  if (filePath.startsWith('/System/') || filePath.startsWith('/usr/')) {
    return 'system';
  }
  // Global dirs are app-installed
  if (filePath.startsWith('/Library/')) {
    return 'app';
  }
  // Check if label matches a known app vendor prefix
  const lowerLabel = label.toLowerCase();
  for (const prefix of APP_VENDOR_PREFIXES) {
    if (lowerLabel.startsWith(prefix)) return 'app';
  }
  // For user agents with 3+ segment reverse-domain, check mdfind
  const segments = label.split('.');
  if (segments.length >= 3) {
    const possibleApp = segments.slice(0, 3).join('.');
    if (possibleApp in mdfindCache) {
      return mdfindCache[possibleApp] ? 'app' : 'custom';
    }
    try {
      const result = execSync(
        `mdfind "kMDItemCFBundleIdentifier == '${possibleApp}'" 2>/dev/null | head -1`,
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      mdfindCache[possibleApp] = !!result;
      if (result) return 'app';
    } catch {
      mdfindCache[possibleApp] = false;
    }
  }
  return 'custom';
}

function getAllJobs() {
  const loadedJobs = getLoadedJobs();
  const allJobs = [];

  for (const dir of PLIST_DIRS) {
    if (!fs.existsSync(dir.path)) continue;
    let files;
    try {
      files = fs.readdirSync(dir.path).filter(f => f.endsWith('.plist'));
    } catch {
      continue;
    }
    for (const file of files) {
      const filePath = path.join(dir.path, file);
      const { data, xml, error } = parsePlistFile(filePath);
      if (!data) continue;

      const label = data.Label || file.replace('.plist', '');
      const loadInfo = loadedJobs[label] || { pid: null, lastExitStatus: 0, loaded: false };

      const origin = classifyJobOrigin(label, filePath);
      allJobs.push({
        label,
        domain: dir.domain,
        domainLabel: dir.label,
        origin,
        filePath,
        loaded: loadInfo.loaded,
        pid: loadInfo.pid,
        running: loadInfo.pid !== null,
        lastExitStatus: loadInfo.lastExitStatus,
        disabled: data.Disabled === true,
        program: data.Program || (data.ProgramArguments ? data.ProgramArguments[0] : ''),
        programArguments: data.ProgramArguments || [],
        runAtLoad: data.RunAtLoad || false,
        keepAlive: data.KeepAlive || false,
        startInterval: data.StartInterval || null,
        startCalendarInterval: data.StartCalendarInterval || null,
        watchPaths: data.WatchPaths || [],
        queueDirectories: data.QueueDirectories || [],
        environmentVariables: data.EnvironmentVariables || {},
        standardOutPath: data.StandardOutPath || '',
        standardErrorPath: data.StandardErrorPath || '',
        workingDirectory: data.WorkingDirectory || '',
        userName: data.UserName || '',
        groupName: data.GroupName || '',
        xml,
        plistData: data,
      });
    }
  }

  // Also add loaded jobs that don't have plist files (system jobs)
  for (const [label, info] of Object.entries(loadedJobs)) {
    if (!allJobs.find(j => j.label === label)) {
      allJobs.push({
        label,
        domain: 'runtime',
        domainLabel: 'Runtime Only',
        origin: classifyJobOrigin(label, null),
        filePath: null,
        loaded: true,
        pid: info.pid,
        running: info.pid !== null,
        lastExitStatus: info.lastExitStatus,
        disabled: false,
        program: '',
        programArguments: [],
        runAtLoad: false,
        keepAlive: false,
        startInterval: null,
        startCalendarInterval: null,
        watchPaths: [],
        queueDirectories: [],
        environmentVariables: {},
        standardOutPath: '',
        standardErrorPath: '',
        workingDirectory: '',
        userName: '',
        groupName: '',
        xml: '',
        plistData: {},
      });
    }
  }

  allJobs.sort((a, b) => a.label.localeCompare(b.label));
  return allJobs;
}

function analyzeJob(job) {
  const issues = [];
  if (!job.plistData || !job.plistData.Label) {
    issues.push({ level: 'error', message: 'Missing Label key' });
  }
  if (!job.program && (!job.programArguments || job.programArguments.length === 0)) {
    issues.push({ level: 'error', message: 'No Program or ProgramArguments specified' });
  }
  if (job.program && !fs.existsSync(job.program)) {
    issues.push({ level: 'warning', message: `Program not found: ${job.program}` });
  }
  if (job.programArguments && job.programArguments.length > 0 && !fs.existsSync(job.programArguments[0])) {
    issues.push({ level: 'warning', message: `Executable not found: ${job.programArguments[0]}` });
  }
  if (job.standardOutPath) {
    const dir = path.dirname(job.standardOutPath);
    if (!fs.existsSync(dir)) {
      issues.push({ level: 'warning', message: `stdout directory does not exist: ${dir}` });
    }
  }
  if (job.standardErrorPath) {
    const dir = path.dirname(job.standardErrorPath);
    if (!fs.existsSync(dir)) {
      issues.push({ level: 'warning', message: `stderr directory does not exist: ${dir}` });
    }
  }
  if (job.keepAlive && job.startInterval) {
    issues.push({ level: 'info', message: 'KeepAlive and StartInterval both set — KeepAlive takes precedence' });
  }
  if (issues.length === 0) {
    issues.push({ level: 'ok', message: 'No issues detected' });
  }
  return issues;
}

// ── IPC Handlers ──

ipcMain.handle('get-jobs', () => {
  return getAllJobs();
});

ipcMain.handle('get-domains', () => {
  return PLIST_DIRS.map(d => ({ domain: d.domain, label: d.label, path: d.path }));
});

ipcMain.handle('analyze-job', (_, job) => {
  return analyzeJob(job);
});

ipcMain.handle('load-job', (_, filePath) => {
  try {
    execSync(`launchctl load "${filePath}"`, { encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('unload-job', (_, filePath) => {
  try {
    execSync(`launchctl unload "${filePath}"`, { encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('start-job', (_, label) => {
  try {
    execSync(`launchctl start "${label}"`, { encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('stop-job', (_, label) => {
  try {
    execSync(`launchctl stop "${label}"`, { encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('enable-job', (_, filePath) => {
  try {
    execSync(`launchctl load -w "${filePath}"`, { encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('disable-job', (_, filePath) => {
  try {
    execSync(`launchctl unload -w "${filePath}"`, { encoding: 'utf8' });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('read-plist', (_, filePath) => {
  return parsePlistFile(filePath);
});

ipcMain.handle('save-plist', async (_, filePath, xmlContent) => {
  try {
    // Validate XML plist
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, xmlContent, 'utf8');
    execSync(`plutil -lint "${tmpPath}"`, { encoding: 'utf8' });
    fs.renameSync(tmpPath, filePath);
    return { success: true };
  } catch (e) {
    try { fs.unlinkSync(filePath + '.tmp'); } catch {}
    return { success: false, error: e.stderr || e.message };
  }
});

ipcMain.handle('create-plist', async (_, domain) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Create New Job',
    defaultPath: domain === 'user'
      ? path.join(process.env.HOME, 'Library/LaunchAgents/com.example.newjob.plist')
      : '/Library/LaunchAgents/com.example.newjob.plist',
    filters: [{ name: 'Property List', extensions: ['plist'] }],
  });
  if (result.canceled) return { success: false, canceled: true };

  const label = path.basename(result.filePath, '.plist');
  const template = {
    Label: label,
    ProgramArguments: ['/usr/bin/true'],
    RunAtLoad: false,
  };
  const xml = plist.build(template);
  fs.writeFileSync(result.filePath, xml, 'utf8');
  return { success: true, filePath: result.filePath };
});

ipcMain.handle('delete-plist', async (_, filePath, label) => {
  const response = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Delete'],
    defaultId: 0,
    cancelId: 0,
    title: 'Delete Job',
    message: `Delete "${label}"?`,
    detail: `This will unload and permanently delete:\n${filePath}`,
  });
  if (response.response === 0) return { success: false, canceled: true };

  try {
    try { execSync(`launchctl unload "${filePath}"`, { encoding: 'utf8' }); } catch {}
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('read-log', (_, logPath, lines) => {
  try {
    if (!fs.existsSync(logPath)) return { content: '(File not found)', exists: false };
    const content = execSync(`tail -n ${lines || 200} "${logPath}"`, { encoding: 'utf8' });
    return { content, exists: true };
  } catch (e) {
    return { content: e.message, exists: false };
  }
});

ipcMain.handle('read-system-log', (_, label, lines) => {
  try {
    const content = execSync(
      `log show --predicate 'subsystem == "${label}" OR senderImagePath CONTAINS "${label}"' --last 1h --style compact 2>/dev/null | tail -n ${lines || 100}`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return { content: content || '(No log entries found)', exists: true };
  } catch (e) {
    return { content: '(Could not read system log: ' + e.message + ')', exists: false };
  }
});

ipcMain.handle('reveal-in-finder', (_, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    require('electron').shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('open-in-editor', (_, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    require('electron').shell.openPath(filePath);
  }
});
