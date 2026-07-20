const { app, BrowserWindow, shell, ipcMain } = require("electron");
const path = require("path");

// electron-updater läuft in einem separaten Modul und blockiert den
// Renderer-/Telemetrie-Thread nicht. Fehler werden defensiv abgefangen,
// damit ein fehlender GitHub-Release die App niemals lahmlegt.
let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  if (autoUpdater.logger && autoUpdater.logger.transports) {
    // stark reduzieren, damit keine Files unter %APPDATA% wachsen
    try { autoUpdater.logger.transports.file.level = "warn"; } catch (_) {}
    try { autoUpdater.logger.transports.console.level = "warn"; } catch (_) {}
  }
} catch (err) {
  console.warn("[updater] electron-updater not available:", err && err.message);
}

let mainWindow = null;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function wireUpdater() {
  if (!autoUpdater) return;

  autoUpdater.on("checking-for-update", () => send("updater:event", { type: "checking" }));
  autoUpdater.on("update-available", (info) =>
    send("updater:event", { type: "available", version: info && info.version }),
  );
  autoUpdater.on("update-not-available", (info) =>
    send("updater:event", { type: "not-available", version: info && info.version }),
  );
  autoUpdater.on("error", (err) =>
    send("updater:event", { type: "error", message: err && err.message ? err.message : String(err) }),
  );
  autoUpdater.on("download-progress", (progress) =>
    send("updater:event", {
      type: "progress",
      percent: progress && typeof progress.percent === "number" ? progress.percent : 0,
      bytesPerSecond: progress && progress.bytesPerSecond,
      transferred: progress && progress.transferred,
      total: progress && progress.total,
    }),
  );
  autoUpdater.on("update-downloaded", (info) =>
    send("updater:event", { type: "downloaded", version: info && info.version }),
  );

  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        version: result && result.updateInfo && result.updateInfo.version,
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  ipcMain.handle("updater:install", async () => {
    try {
      // isSilent=false, isForceRunAfter=true → Nutzer sieht kurzen Installer
      // und die App startet danach automatisch neu.
      setImmediate(() => {
        try { autoUpdater.quitAndInstall(false, true); } catch (_) {}
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  });

  ipcMain.handle("updater:version", async () => {
    try { return { version: app.getVersion() }; } catch (_) { return { version: null }; }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#04090c",
    title: "VTC Hub Client v1.0.9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Update-Check nach kurzer Verzögerung – nicht blockierend für Telemetrie.
  if (autoUpdater) {
    setTimeout(() => {
      try { autoUpdater.checkForUpdates(); } catch (_) {}
    }, 5000);
  }
}

wireUpdater();

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
