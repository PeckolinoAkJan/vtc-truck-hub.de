/**
 * In-App Auto-Update UI (Ampel + Fortschrittsbalken).
 *
 * WICHTIG: Diese Datei ist bewusst komplett unabhängig von der Telemetrie-,
 * API- und Sync-Logik. Sie darf renderer.js oder normalize-job.js NICHT
 * verändern. Fehler werden still geschluckt, damit der Haupt-Thread niemals
 * blockiert oder in einen Fehlerzustand versetzt wird.
 *
 * Wenn die Electron-Bridge (window.vtcUpdater) verfügbar ist, wird das echte
 * electron-updater-System (Download + quitAndInstall) genutzt. Ansonsten
 * (z. B. beim Testen im normalen Browser) fällt der Code auf einen
 * read-only GitHub-Release-Check zurück, der lediglich den Ampel-Status
 * setzt und einen externen Link anbietet.
 */
(function () {
  "use strict";

  const FALLBACK_VERSION = "1.0.4";
  const RELEASES_API =
    "https://api.github.com/repos/PeckolinoAkJan/virtual-fleet-forge/releases/latest";
  const RELEASES_PAGE =
    "https://github.com/PeckolinoAkJan/virtual-fleet-forge/releases/latest";

  const bridge = typeof window !== "undefined" ? window.vtcUpdater : null;

  function injectStyles() {
    if (document.getElementById("vtc-update-style")) return;
    const style = document.createElement("style");
    style.id = "vtc-update-style";
    style.textContent = `
      .vtc-update-panel {
        display:flex; align-items:center; gap:10px;
        padding:10px 12px; margin:8px 0 4px;
        border-top:1px solid #1a2b22;
        font-size:12px; color:#cfe6d6;
      }
      .vtc-update-led {
        width:10px; height:10px; border-radius:50%;
        background:#6B7280; box-shadow:0 0 0 rgba(0,0,0,0);
        flex-shrink:0; transition: all .25s ease;
      }
      .vtc-update-led.green {
        background:#10B981;
        box-shadow:0 0 10px rgba(16,185,129,.75), 0 0 2px rgba(16,185,129,.9);
      }
      .vtc-update-led.red {
        background:#EF4444;
        box-shadow:0 0 10px rgba(239,68,68,.85), 0 0 2px rgba(239,68,68,.95);
        animation: vtcLedPulse 1.4s ease-in-out infinite;
      }
      .vtc-update-led.amber {
        background:#F59E0B;
        box-shadow:0 0 8px rgba(245,158,11,.7);
      }
      @keyframes vtcLedPulse {
        0%,100% { transform: scale(1); opacity:1; }
        50%     { transform: scale(1.25); opacity:.75; }
      }
      .vtc-update-body { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
      .vtc-update-title { font-weight:600; color:#e8f5ec; font-size:12px; }
      .vtc-update-meta  { font-size:10px; color:#7a8a80; }
      .vtc-update-btn {
        border:0; border-radius:6px; padding:6px 10px; cursor:pointer;
        font-weight:600; font-size:11px; background:#22c55e; color:#fff;
        box-shadow:0 4px 10px -4px rgba(34,197,94,.55);
      }
      .vtc-update-btn:hover:not(:disabled) { background:#4ade80; }
      .vtc-update-btn:disabled { opacity:.55; cursor:not-allowed; }
      .vtc-update-progress-wrap {
        flex:1; height:8px; background:#0f1a15; border-radius:999px;
        overflow:hidden; position:relative;
      }
      .vtc-update-progress-bar {
        position:absolute; inset:0 auto 0 0; width:0%;
        background:linear-gradient(90deg,#22c55e,#4ade80);
        transition:width .2s linear;
      }
      .vtc-update-progress-bar.indet {
        width:35% !important;
        animation: vtcIndet 1.1s ease-in-out infinite;
      }
      @keyframes vtcIndet {
        0%   { transform: translateX(-120%); }
        100% { transform: translateX(320%); }
      }
      .vtc-update-progress-pct {
        font-variant-numeric: tabular-nums;
        font-size:11px; color:#86efac; min-width:38px; text-align:right;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel = document.getElementById("vtcUpdatePanel");
    if (panel) return panel;
    injectStyles();
    panel = document.createElement("div");
    panel.id = "vtcUpdatePanel";
    panel.className = "vtc-update-panel";
    panel.innerHTML = `
      <span class="vtc-update-led" id="vtcUpdateLed" aria-hidden="true"></span>
      <div class="vtc-update-body">
        <div class="vtc-update-title" id="vtcUpdateTitle">Suche nach Updates…</div>
        <div class="vtc-update-meta"  id="vtcUpdateMeta"></div>
      </div>
      <div id="vtcUpdateAction" style="display:flex;align-items:center;gap:8px;flex:0 0 auto"></div>
      <div id="vtcUpdateProgressWrap" class="vtc-update-progress-wrap" style="display:none;max-width:140px">
        <div id="vtcUpdateProgressBar" class="vtc-update-progress-bar"></div>
      </div>
      <span id="vtcUpdateProgressPct" class="vtc-update-progress-pct" style="display:none">0%</span>
    `;
    // Bevorzugt in einen expliziten Mount-Slot (v1.0.4 Layout), sonst in die Sidebar, sonst ans Body-Ende.
    const mount = document.getElementById("updatePanelMount");
    const sidebar = document.querySelector("aside.sidebar");
    if (mount) mount.appendChild(panel);
    else if (sidebar) sidebar.appendChild(panel);
    else document.body.appendChild(panel);
    return panel;
  }

  function setLed(color) {
    const led = document.getElementById("vtcUpdateLed");
    if (!led) return;
    led.classList.remove("green", "red", "amber");
    if (color) led.classList.add(color);
  }

  function setTitle(text) {
    const el = document.getElementById("vtcUpdateTitle");
    if (el) el.textContent = text;
  }

  function setMeta(text) {
    const el = document.getElementById("vtcUpdateMeta");
    if (el) el.textContent = text || "";
  }

  function setAction(html) {
    const el = document.getElementById("vtcUpdateAction");
    if (el) el.innerHTML = html;
  }

  function showProgress(percent, indeterminate) {
    const wrap = document.getElementById("vtcUpdateProgressWrap");
    const bar  = document.getElementById("vtcUpdateProgressBar");
    const pct  = document.getElementById("vtcUpdateProgressPct");
    if (!wrap || !bar || !pct) return;
    wrap.style.display = "block";
    pct.style.display = "inline-block";
    if (indeterminate) {
      bar.classList.add("indet");
      bar.style.width = "35%";
      pct.textContent = "…";
    } else {
      bar.classList.remove("indet");
      const p = Math.max(0, Math.min(100, Number(percent) || 0));
      bar.style.width = p.toFixed(1) + "%";
      pct.textContent = p.toFixed(0) + "%";
    }
  }

  function hideProgress() {
    const wrap = document.getElementById("vtcUpdateProgressWrap");
    const pct  = document.getElementById("vtcUpdateProgressPct");
    if (wrap) wrap.style.display = "none";
    if (pct) pct.style.display = "none";
  }

  // ---------- Electron-Modus (echtes Auto-Update) ----------
  async function initElectron() {
    ensurePanel();
    setLed("amber");
    setTitle("Suche nach Updates…");

    let currentVersion = FALLBACK_VERSION;
    try {
      const info = await bridge.getVersion();
      if (info && info.version) currentVersion = info.version;
    } catch (_) {}
    setMeta(`Installierte Version: v${currentVersion}`);

    let latestVersion = null;

    const renderUpToDate = () => {
      setLed("green");
      setTitle("Version aktuell");
      setMeta(`Installierte Version: v${currentVersion}`);
      setAction("");
      hideProgress();
    };

    const renderAvailable = () => {
      setLed("red");
      setTitle("Update verfügbar!");
      setMeta(`v${currentVersion} → v${latestVersion || "?"}`);
      setAction(`<button class="vtc-update-btn" id="vtcUpdateGo" type="button">Jetzt updaten</button>`);
      hideProgress();
      const btn = document.getElementById("vtcUpdateGo");
      if (btn) btn.addEventListener("click", startDownload, { once: true });
    };

    const renderError = (msg) => {
      setLed("amber");
      setTitle("Update-Prüfung fehlgeschlagen");
      setMeta(msg || "Später erneut versucht.");
      setAction("");
      hideProgress();
    };

    async function startDownload() {
      setLed("amber");
      setTitle("Update wird heruntergeladen…");
      setAction("");
      showProgress(0, true);
      try {
        const res = await bridge.download();
        if (!res || !res.ok) {
          renderError(res && res.error ? res.error : "Download fehlgeschlagen");
        }
      } catch (err) {
        renderError(err && err.message);
      }
    }

    async function startInstall() {
      setLed("amber");
      setTitle("Installiere Update & Neustart…");
      setMeta("Der Client startet gleich neu.");
      setAction("");
      showProgress(100, false);
      try { await bridge.install(); } catch (_) {}
    }

    bridge.onEvent((evt) => {
      if (!evt || !evt.type) return;
      switch (evt.type) {
        case "checking":
          setLed("amber");
          setTitle("Suche nach Updates…");
          setAction("");
          hideProgress();
          break;
        case "available":
          latestVersion = evt.version || latestVersion;
          renderAvailable();
          break;
        case "not-available":
          renderUpToDate();
          break;
        case "progress":
          showProgress(evt.percent, false);
          setTitle("Update wird heruntergeladen…");
          break;
        case "downloaded":
          latestVersion = evt.version || latestVersion;
          startInstall();
          break;
        case "error":
          renderError(evt.message);
          break;
      }
    });

    // Erste Prüfung
    try {
      const res = await bridge.check();
      if (res && res.ok === false) renderError(res.error);
    } catch (err) {
      renderError(err && err.message);
    }
  }

  // ---------- Fallback-Modus (Browser / kein Electron) ----------
  function parseVersion(v) {
    if (!v || typeof v !== "string") return null;
    const cleaned = v.trim().replace(/^v/i, "");
    const parts = cleaned.split(/[.\-+]/).slice(0, 3).map((p) => parseInt(p, 10));
    if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return null;
    while (parts.length < 3) parts.push(0);
    return parts;
  }
  function isNewer(latest, current) {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
      if (a[i] > b[i]) return true;
      if (a[i] < b[i]) return false;
    }
    return false;
  }

  async function initFallback() {
    ensurePanel();
    setLed("amber");
    setTitle("Suche nach Updates…");
    setMeta(`Installierte Version: v${FALLBACK_VERSION}`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(RELEASES_API, {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const latestTag = data && (data.tag_name || data.name);
      if (latestTag && isNewer(latestTag, FALLBACK_VERSION)) {
        const latest = latestTag.replace(/^v/i, "");
        setLed("red");
        setTitle("Update verfügbar!");
        setMeta(`v${FALLBACK_VERSION} → v${latest}`);
        setAction(`<button class="vtc-update-btn" id="vtcUpdateGo" type="button">Jetzt updaten</button>`);
        const btn = document.getElementById("vtcUpdateGo");
        if (btn) {
          btn.addEventListener("click", () => {
            try { window.open(RELEASES_PAGE, "_blank", "noopener"); } catch (_) {}
          });
        }
      } else {
        setLed("green");
        setTitle("Version aktuell");
      }
    } catch (_) {
      setLed("amber");
      setTitle("Update-Prüfung fehlgeschlagen");
      setMeta("Wird beim nächsten Start erneut versucht.");
    }
  }

  function schedule() {
    setTimeout(() => {
      if (bridge && typeof bridge.onEvent === "function") {
        initElectron().catch(() => {});
      } else {
        initFallback().catch(() => {});
      }
    }, 3500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})();
