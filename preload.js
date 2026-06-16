const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getJobs: () => ipcRenderer.invoke('get-jobs'),
  getDomains: () => ipcRenderer.invoke('get-domains'),
  analyzeJob: (job) => ipcRenderer.invoke('analyze-job', job),
  loadJob: (filePath) => ipcRenderer.invoke('load-job', filePath),
  unloadJob: (filePath) => ipcRenderer.invoke('unload-job', filePath),
  startJob: (label) => ipcRenderer.invoke('start-job', label),
  stopJob: (label) => ipcRenderer.invoke('stop-job', label),
  enableJob: (filePath) => ipcRenderer.invoke('enable-job', filePath),
  disableJob: (filePath) => ipcRenderer.invoke('disable-job', filePath),
  readPlist: (filePath) => ipcRenderer.invoke('read-plist', filePath),
  savePlist: (filePath, xml) => ipcRenderer.invoke('save-plist', filePath, xml),
  createPlist: (domain) => ipcRenderer.invoke('create-plist', domain),
  deletePlist: (filePath, label) => ipcRenderer.invoke('delete-plist', filePath, label),
  readLog: (logPath, lines) => ipcRenderer.invoke('read-log', logPath, lines),
  readSystemLog: (label, lines) => ipcRenderer.invoke('read-system-log', label, lines),
  revealInFinder: (filePath) => ipcRenderer.invoke('reveal-in-finder', filePath),
  openInEditor: (filePath) => ipcRenderer.invoke('open-in-editor', filePath),
});
