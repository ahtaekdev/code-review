import { contextBridge, ipcRenderer } from 'electron';
import type { Platform } from '../shared/platform';

function getPlatform(): Platform {
  switch (process.platform) {
    case 'win32':
      return 'windows';
    case 'darwin':
      return 'mac';
    default:
      return 'linux';
  }
}

contextBridge.exposeInMainWorld('platform', getPlatform());

contextBridge.exposeInMainWorld('rpc', (name: string, args: unknown) => {
  return ipcRenderer.invoke('rpc', { name, args });
});

contextBridge.exposeInMainWorld('onPush', (callback: (event: string, payload?: any) => void) => {
  const listener = (_e: Electron.IpcRendererEvent, name: string, payload?: any) => callback(name, payload);
  ipcRenderer.on('push', listener);
  return () => {
    ipcRenderer.removeListener('push', listener);
  };
});
