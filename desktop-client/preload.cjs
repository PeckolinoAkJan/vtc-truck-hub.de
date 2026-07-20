const { contextBridge, ipcRenderer } = require("electron");

// Isolierte Update-API. Telemetrie-/Sync-Code nutzt weiterhin nur natives fetch;
// hier wird ausschließlich der Auto-Updater angebunden.
contextBridge.exposeInMainWorld("vtcUpdater", {
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  getVersion: () => ipcRenderer.invoke("updater:version"),
  onEvent: (cb) => {
    const listener = (_event, payload) => {
      try { cb(payload); } catch (_) {}
    };
    ipcRenderer.on("updater:event", listener);
    return () => ipcRenderer.removeListener("updater:event", listener);
  },
});
