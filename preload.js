const { contextBridge, ipcRenderer } = require('electron');

function unwrapSync(result) {
  if (!result || result.ok !== true) {
    throw new Error((result && result.error) || '[desktop] Vault sync IPC failed.');
  }
  return result.value;
}

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  sqliteRead: (fileName) => ipcRenderer.invoke('desktop:sqliteRead', fileName),
  sqliteWrite: (fileName, data) => ipcRenderer.invoke('desktop:sqliteWrite', fileName, data),
  artExists: (relativePath) => ipcRenderer.invoke('desktop:artExists', relativePath),
  artDownload: (url, destinationPath) =>
    ipcRenderer.invoke('desktop:artDownload', url, destinationPath),
  artRemoveDir: (relativePath) => ipcRenderer.invoke('desktop:artRemoveDir', relativePath),
  vaultMigrate: () => ipcRenderer.invoke('desktop:vaultMigrate'),

  vaultOpen: (fileName) => ipcRenderer.invoke('desktop:vaultOpen', fileName),
  vaultExecSync: (sql) => unwrapSync(ipcRenderer.sendSync('desktop:vaultExecSync', sql)),
  vaultRunSync: (sql, params) =>
    unwrapSync(ipcRenderer.sendSync('desktop:vaultRunSync', sql, params)),
  vaultRunBatchSync: (statements) =>
    unwrapSync(ipcRenderer.sendSync('desktop:vaultRunBatchSync', statements)),
  vaultAllSync: (sql, params) =>
    unwrapSync(ipcRenderer.sendSync('desktop:vaultAllSync', sql, params)),
  vaultGetSync: (sql, params) =>
    unwrapSync(ipcRenderer.sendSync('desktop:vaultGetSync', sql, params))
});
