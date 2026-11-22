// The only bridge between the web page and the desktop app: silent printing, app information and app updates.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpDesktop', {
    printSilent: () => ipcRenderer.invoke('print-silent'),
    info: () => ipcRenderer.invoke('app-info'),
    updates: {
        state: () => ipcRenderer.invoke('update-state'),
        check: () => ipcRenderer.invoke('update-check'),
        download: () => ipcRenderer.invoke('update-download'),
        install: () => ipcRenderer.invoke('update-install'),
        // the page hears every change (checking, available, download %, ready, error); returns a function to stop
        onChange: cb => { const h = (e, s) => cb(s); ipcRenderer.on('update-state', h); return () => ipcRenderer.removeListener('update-state', h); },
    },
});
