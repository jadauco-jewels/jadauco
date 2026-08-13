const { contextBridge, ipcRenderer } = require('electron');

// The renderer never touches Node or the filesystem directly.
contextBridge.exposeInMainWorld('jadauco', {
  saveImage: (dataUrl, suggestedName) =>
    ipcRenderer.invoke('save-image', { dataUrl, suggestedName }),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  writeInto: (folder, fileName, dataUrl) =>
    ipcRenderer.invoke('write-into', { folder, fileName, dataUrl }),
});
