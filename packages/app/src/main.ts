import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron';
import { INVOKE_CHANNEL } from '@notes/ipc-contract';
import { invokeCommand } from './commands.ts';

// Bundled to dist/main.cjs, so __dirname is the dist folder.
const rendererIndex = path.join(__dirname, 'renderer', 'index.html');
const rendererUrl = pathToFileURL(rendererIndex).href;

function isExternalWebUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  return event.senderFrame?.url === rendererUrl;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });
  window.once('ready-to-show', () => {
    window.show();
  });
  void window.loadFile(rendererIndex);
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalWebUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
});

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });

  ipcMain.handle(INVOKE_CHANNEL, (event, id: unknown, args: unknown) => {
    if (!isTrustedSender(event)) {
      return { ok: false, error: { code: 'forbidden-sender', message: 'Command rejected: unknown sender.' } };
    }
    return invokeCommand(id, args);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
