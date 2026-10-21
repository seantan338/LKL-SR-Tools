const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readData: (password) => ipcRenderer.invoke('read-data', password),
  writeData: (dataStr, password) => ipcRenderer.invoke('write-data', dataStr, password),
  sendNotification: (title, body) => ipcRenderer.send('send-notification', { title, body }),
  isEncrypted: () => ipcRenderer.invoke('is-encrypted'),
  setEncryptionPassword: (password) => ipcRenderer.invoke('set-encryption-password', password),
  exportPlaintext: () => ipcRenderer.invoke('export-plaintext')
});
