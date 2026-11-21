import { contextBridge, ipcRenderer } from 'electron';
import { INVOKE_CHANNEL, type RendererApi } from '@notes/ipc-contract';

// The only surface the renderer gets. Never expose ipcRenderer itself.
const api: RendererApi = {
  invoke: (id, args) => ipcRenderer.invoke(INVOKE_CHANNEL, id, args),
};

contextBridge.exposeInMainWorld('api', api);
