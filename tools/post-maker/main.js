const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 880,
    minWidth: 980,
    minHeight: 700,
    title: 'Jadauco Post Maker',
    backgroundColor: '#FFFDF8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// The renderer hands over a finished data URL; the main process owns the disk.
ipcMain.handle('save-image', async (event, { dataUrl, suggestedName }) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName,
    filters: [{ name: 'Image', extensions: ['png', 'jpg'] }],
  });
  if (canceled || !filePath) return { saved: false };

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
  return { saved: true, filePath };
});

// Batch: same settings, many photos, one folder.
ipcMain.handle('choose-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return canceled || !filePaths.length ? null : filePaths[0];
});

ipcMain.handle('write-into', async (_event, { folder, fileName, dataUrl }) => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const target = path.join(folder, fileName);
  await fs.writeFile(target, Buffer.from(base64, 'base64'));
  return target;
});
