/**
 * Electron Preload Script
 * Exposes safe native APIs to the renderer process
 */

import { contextBridge, ipcRenderer, shell } from 'electron';

// Expose safe APIs to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Open external URLs in default browser
  openExternal: (url) => {
    shell.openExternal(url);
  },

  // Get app version
  getVersion: () => {
    return process.env.npm_package_version || '0.1.0';
  },
});
