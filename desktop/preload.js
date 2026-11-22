// The only bridge between the web page and the desktop app: silent printing and app information.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpDesktop', {
    printSilent: () => ipcRenderer.invoke('print-silent'),
    info: () => ipcRenderer.invoke('app-info'),
});
