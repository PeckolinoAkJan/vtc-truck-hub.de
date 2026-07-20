/* MPL Logistik Desktop Client — Renderer */

const $ = (id) => document.getElementById(id);

const state = {
  settings: loadSettings(),
  pollTimer: null,
  lastJobFinished: null,
  history: JSON.parse(localStorage.getItem("mpl.history") || "[]"),
  queue: JSON.parse(localStorage.getItem("mpl.queue") || "[]"),
  lastFrame: null,
  liveWarned: false,
  telemetryWarned: false,
  activeJob: null,
  lastJobSig: "",
  missingJobTicks: 0,
  online: navigator.onLine,
  jobsHistory: [],
  retryTimer: null,
  lastSyncAt: localStorage.getItem("mpl.lastSyncAt") || null,
  polling: false,
  filters: { status: "", period: "all", game: "", search: "" },
  lastError: null, // { source: 'ingest'|'jobs', code: number|null, message: string, ts: string }
  lastResync: null, // { at, trigger, statusChanges, newRemote, missingLocal, durationMs }
  fullResyncTimer: null,
  _resyncing: false,


};

function loadSettings() {
  try {
    return (
      JSON.parse(localStorage.getItem("mpl.settings")) || {
        apiUrl: "https://virtual-fleet-forge.lovable.app",
        apiKey: "",
        steamId: "",
        userId: "",
        autoStart: true,
      }
    );
  } catch {
    return { apiUrl: "https://virtual-fleet-forge.lovable.app", apiKey: "", steamId: "", userId: "", autoStart: true };
  }
}

function saveSettings() { localStorage.setItem("mpl.settings", JSON.stringify(state.settings)); }
function saveHistory() { localStorage.setItem("mpl.history", JSON.stringify(state.history.slice(0, 200))); }
function saveQueue() { localStorage.setItem("mpl.queue", JSON.stringify(state.queue.slice(0, 200))); }
function markSync() {
  state.lastSyncAt = new Date().toISOString();
  localStorage.setItem("mpl.lastSyncAt", state.lastSyncAt);
  refreshDebug();
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---- Tabs ----
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.querySelector(`.panel[data-panel="${btn.dataset.tab}"]`).classList.add("active");
    if (btn.dataset.tab === "history") renderHistory();
    if (btn.dataset.tab === "jobs") refreshJobsHistory();
  });
});

// ---- Settings ----
function fillSettings() {
  $("s_apiUrl").value = state.settings.apiUrl;
  $("s_apiKey").value = state.settings.apiKey;
  $("s_steamId").value = state.settings.steamId;
  $("s_userId").value = state.settings.userId;
  $("f_autoStart").checked = state.settings.autoStart !== false;
}
fillSettings();

$("btnSaveSettings").addEventListener("click", () => {
  state.settings = {
    ...state.settings,
    apiUrl: $("s_apiUrl").value.trim().replace(/\/$/, ""),
    apiKey: $("s_apiKey").value.trim(),
    steamId: $("s_steamId").value.trim(),
    userId: $("s_userId").value.trim(),
  };
  saveSettings();
  setStatus("settingsStatus", "Einstellungen gespeichert.", "ok");
  // Try auto-start after settings saved
  if (state.settings.autoStart !== false && !state.polling) startPolling();
});

$("f_autoStart").addEventListener("change", (e) => {
  state.settings.autoStart = e.target.checked;
  saveSettings();
});

$("btnTest").addEventListener("click", async () => {
  setStatus("settingsStatus", "Teste Verbindung…");
  try {
    const res = await fetch(`${state.settings.apiUrl}/api/public/telemetry/ingest`, { method: "OPTIONS" });
    if (res.status === 204 || res.status === 200 || res.status === 405) {
      setStatus("settingsStatus", "Server erreichbar ✓", "ok");
      setConn(true);
    } else {
      setStatus("settingsStatus", `Antwort ${res.status}`, "err"); setConn(false);
    }
  } catch (e) {
    setStatus("settingsStatus", `Fehler: ${e.message}`, "err"); setConn(false);
  }
});

function setStatus(id, text, cls) {
  const el = $(id); if (!el) return;
  el.textContent = text;
  el.className = "status" + (cls ? " " + cls : "");
}

function setConn(ok) {
  const dot = $("connDot"); const label = $("connLabel");
  const qlen = state.queue.length;
  if (ok === null) { dot.className = "dot dot-idle"; label.textContent = "Nicht verbunden"; }
  else if (ok) { dot.className = "dot dot-ok"; label.textContent = qlen ? `Verbunden · ${qlen} in Queue` : "Verbunden"; }
  else { dot.className = "dot dot-err"; label.textContent = qlen ? `Offline · ${qlen} in Queue` : "Offline"; }
  const qb = $("queueBadge");
  if (qb) { qb.textContent = qlen ? `Warteschlange: ${qlen}` : "Warteschlange leer"; qb.className = "pill " + (qlen ? "pill-warn" : "pill-ok"); }
  refreshDebug();
}

function refreshDebug() {
  const q = $("dbgQueue"); if (q) q.textContent = String(state.queue.length);
  renderQueueDetails();

  const ls = $("dbgLastSync"); if (ls) ls.textContent = state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString("de-DE") : "—";
  const p = $("dbgPolling"); if (p) p.textContent = state.polling ? "aktiv" : "gestoppt";
  const a = $("dbgActive"); if (a) a.textContent = state.activeJob ? `${state.activeJob.source} → ${state.activeJob.dest}` : "—";
  const lsb = $("lastSyncBadge"); if (lsb) lsb.textContent = state.lastSyncAt ? `Letzte Sync: ${new Date(state.lastSyncAt).toLocaleTimeString("de-DE")}` : "Letzte Sync: —";
  const errWrap = $("dbgErrorWrap");
  const errText = $("dbgErrorText");
  if (errWrap && errText) {
    if (state.lastError) {
      const e = state.lastError;
      const src = e.source === "ingest" ? "Ingest" : e.source === "jobs" ? "Job-Historie" : e.source === "live" ? "Live-Übertragung" : "API";
      const code = e.code != null ? ` · HTTP ${e.code}` : "";
      const when = e.ts ? new Date(e.ts).toLocaleTimeString("de-DE") : "";
      errText.textContent = `${src}${code} – ${e.message}${when ? ` (${when})` : ""}`;
      errWrap.style.display = "";
    } else {
      errWrap.style.display = "none";
      errText.textContent = "";
    }
  }
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function renderQueueDetails() {
  const wrap = $("queueDetails"); if (!wrap) return;
  const items = state.queue || [];
  const empty = $("queueEmpty");
  if (!items.length) {
    if (empty) empty.style.display = "";
    wrap.querySelector(".queue-breakdown").innerHTML = "";
    const oldest = $("queueOldest"); if (oldest) oldest.textContent = "—";
    return;
  }
  if (empty) empty.style.display = "none";

  const labels = {
    job_started: "Auftrag gestartet",
    job_delivered: "Auftrag abgeschlossen",
    job_cancelled: "Auftrag abgebrochen",
    job_aborted: "Auftrag abgebrochen",
  };
  const counts = {};
  let oldestTs = Number.POSITIVE_INFINITY;
  let maxTries = 0;
  for (const it of items) {
    const key = it.event_type || "unbekannt";
    counts[key] = (counts[key] || 0) + 1;
    const t = it.ts ? new Date(it.ts).getTime() : Date.now();
    if (t < oldestTs) oldestTs = t;
    if ((it.tries || 0) > maxTries) maxTries = it.tries || 0;
  }
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
    return `<div class="queue-row"><span class="q-type">${escapeHtml(labels[k] || k)}</span><span class="q-count">${v}</span></div>`;
  }).join("");
  wrap.querySelector(".queue-breakdown").innerHTML = rows;
  const oldest = $("queueOldest");
  if (oldest) oldest.textContent = isFinite(oldestTs) ? `${formatDuration(Date.now() - oldestTs)} (max ${maxTries} Versuche)` : "—";
}


function recordError(source, code, message) {
  state.lastError = { source, code: code ?? null, message: message || "Unbekannter Fehler", ts: new Date().toISOString() };
  refreshDebug();
}
function clearError(source) {
  if (state.lastError && (!source || state.lastError.source === source)) {
    const wasIngestFailure = state.lastError.source === "ingest";
    state.lastError = null;
    refreshDebug();
    // Nach einem gerade behobenen Ingest-Fehler einmal Full-Resync anstoßen,
    // damit Drift vom Offline-Fenster nicht liegen bleibt.
    if (wasIngestFailure && navigator.onLine && typeof fullResync === "function") {
      setTimeout(() => fullResync("reconnect"), 300);
    }
  }
}



function driverIdent() {
  const s = state.settings;
  if (s.userId) return { driver_user_id: s.userId };
  if (s.steamId) return { driver_steam_id: s.steamId };
  return null;
}

async function sendIngest(body) {
  const s = state.settings;
  const r = await fetch(`${s.apiUrl}/api/public/telemetry/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify(body),
  });
  const isPermanent = r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404;
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, isPermanent, data };
}

function pushHistory(entry) {
  state.history.unshift(entry);
  saveHistory();
  if (document.querySelector('.panel[data-panel="history"]').classList.contains("active")) renderHistory();
}

async function postEvent(event_type, payload, extra = {}) {
  const s = state.settings;
  if (!s.apiUrl || !s.apiKey) return { ok: false, error: "API-URL oder Schlüssel fehlt." };
  const ident = driverIdent();
  if (!ident) return { ok: false, error: "Fahrer Steam-ID oder Benutzer-ID fehlt." };
  // Client-generated idempotency key travels in the payload
  const enrichedPayload = { ...payload, event_id: payload.event_id || uuid() };
  const body = { event_type, payload: enrichedPayload, ...ident, ...extra };

  const entry = { ts: new Date().toISOString(), event: event_type, ok: false, msg: "" };
  try {
    const res = await sendIngest(body);
    if (res.ok) {
      entry.ok = true;
      entry.msg = res.data.duplicate ? "OK (Duplikat ignoriert)" : (res.data.job_id ? `OK (job ${res.data.job_id.slice(0, 8)})` : "OK");
      pushHistory(entry);
      setConn(true);
      markSync();
      clearError("ingest");
      return { ok: true, job_id: res.data.job_id ?? null, duplicate: !!res.data.duplicate };
    }
    if (res.isPermanent) {
      entry.msg = `HTTP ${res.status}: ${res.data?.error || "abgelehnt"}`;
      pushHistory(entry);
      recordError("ingest", res.status, res.data?.error || "Anfrage abgelehnt");
      return { ok: false, error: entry.msg, permanent: true };
    }
    enqueue(body, event_type);
    entry.msg = `Offline – in Warteschlange (HTTP ${res.status})`;
    pushHistory(entry);
    setConn(false);
    recordError("ingest", res.status, `Server-Fehler, Ereignis in Warteschlange (${res.data?.error || "keine Antwort"})`);
    return { ok: false, error: entry.msg, queued: true };
  } catch (e) {
    enqueue(body, event_type);
    entry.msg = `Offline – in Warteschlange (${e.message})`;
    pushHistory(entry);
    setConn(false);
    recordError("ingest", null, `Netzwerkfehler: ${e.message}`);
    return { ok: false, error: entry.msg, queued: true };
  }
}


function enqueue(body, event_type) {
  state.queue.push({ id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, body, event_type, ts: new Date().toISOString(), tries: 0 });
  saveQueue();
  setConn(state.online);
}

async function flushQueue() {
  if (!state.queue.length) return;
  const s = state.settings;
  if (!s.apiUrl || !s.apiKey) return;
  log(`Sende ${state.queue.length} nachzuholende Ereignisse…`);
  const remaining = [];
  for (const item of state.queue) {
    try {
      const res = await sendIngest(item.body);
      if (res.ok) {
        pushHistory({ ts: new Date().toISOString(), event: `${item.event_type} (nachgesendet)`, ok: true, msg: res.data.duplicate ? "Duplikat ignoriert" : (res.data.job_id ? `OK (job ${res.data.job_id.slice(0, 8)})` : "OK") });
        markSync();
      } else if (res.isPermanent) {
        pushHistory({ ts: new Date().toISOString(), event: `${item.event_type} (verworfen)`, ok: false, msg: `HTTP ${res.status}: ${res.data?.error || "abgelehnt"}` });
      } else {
        item.tries += 1;
        remaining.push(item);
      }
    } catch {
      item.tries += 1;
      remaining.push(item);
    }
  }
  state.queue = remaining;
  saveQueue();
  setConn(remaining.length === 0);
  if (remaining.length === 0) log("Warteschlange vollständig übertragen ✓");
}

window.addEventListener("online", () => {
  state.online = true;
  log("Netzwerk wieder online – starte Full-Resync.");
  fullResync("reconnect");
});
window.addEventListener("offline", () => { state.online = false; setConn(false); log("Netzwerk offline – Ereignisse werden lokal gepuffert."); });

state.retryTimer = setInterval(() => { if (state.queue.length && navigator.onLine) flushQueue(); }, 15000);
setInterval(() => { if (state.queue.length) renderQueueDetails(); }, 5000);

// Periodischer Full-Resync alle 5 Minuten, um Drift gegenüber der Serverhistorie zu korrigieren.
state.fullResyncTimer = setInterval(() => {
  if (navigator.onLine) fullResync("periodic");
}, 5 * 60 * 1000);

// ---- Full Resync ----
// Läuft nach Wiederverbindung, periodisch und über den "Jetzt synchronisieren"-Button.
// - schickt gepufferte Events erneut
// - lädt die letzten Touren des Fahrers frisch vom Server
// - vergleicht mit lokalem Zustand (Drift-Erkennung) und korrigiert activeJob,
//   wenn der Server ihn schon abgeschlossen/abgelehnt hat.
async function fullResync(trigger = "manual") {
  if (state._resyncing) return { skipped: true };
  state._resyncing = true;
  const startedAt = Date.now();
  const badge = $("dbgResyncBadge");
  if (badge) { badge.textContent = "Resync läuft…"; badge.className = "pill pill-warn"; }
  try {
    // 1) Retry-Queue erst leeren, damit Serverstand aktuell ist
    if (state.queue.length && navigator.onLine) await flushQueue();

    // 2) Snapshot der lokalen Historie merken (für Drift-Diff)
    const prevJobs = Array.isArray(state.jobsHistory) ? state.jobsHistory : [];
    const prevIndex = new Map(prevJobs.map((j) => [j.id, j]));

    // 3) Serverhistorie neu laden
    await refreshJobsHistory();
    const serverJobs = Array.isArray(state.jobsHistory) ? state.jobsHistory : [];
    const serverIndex = new Map(serverJobs.map((j) => [j.id, j]));

    // 4) Drift ermitteln: Status-Änderungen, neue Einträge, verschwundene Einträge
    let statusChanges = 0, newRemote = 0, missingLocal = 0;
    for (const s of serverJobs) {
      const prev = prevIndex.get(s.id);
      if (!prev) { newRemote += 1; continue; }
      if (prev.status !== s.status) statusChanges += 1;
    }
    for (const p of prevJobs) if (!serverIndex.has(p.id)) missingLocal += 1;

    // 5) activeJob gegen Server abgleichen – wenn Server ihn schon geschlossen hat,
    //    lokal freigeben, damit der nächste Auftrag korrekt erkannt wird.
    if (state.activeJob?.id) {
      const remote = serverIndex.get(state.activeJob.id);
      if (remote && remote.status !== "in_progress") {
        log(`Drift korrigiert: aktiver Auftrag ${state.activeJob.id.slice(0,8)} steht serverseitig auf "${remote.status}".`);
        state.activeJob = null;
        state.lastJobSig = "";
        state.missingJobTicks = 0;
      }
    } else {
      // Falls Server einen laufenden Job kennt, den wir lokal nicht mehr haben,
      // übernehmen wir die ID, damit ein späterer job_delivered korrekt zuordnet.
      const remoteActive = serverJobs.find((j) => j.status === "in_progress");
      if (remoteActive) {
        state.activeJob = {
          id: remoteActive.id,
          source: remoteActive.source_city,
          dest: remoteActive.dest_city,
          cargo: remoteActive.cargo,
        };
        state.lastJobSig = `${remoteActive.source_city}|${remoteActive.dest_city}|${remoteActive.cargo}`;
        log(`Drift korrigiert: laufenden Auftrag ${remoteActive.id.slice(0,8)} vom Server übernommen.`);
      }
    }

    refreshDebug();
    state.lastResync = { at: new Date().toISOString(), trigger, statusChanges, newRemote, missingLocal, durationMs: Date.now() - startedAt };
    renderResyncSummary();
    log(`Full-Resync (${trigger}) fertig: ${serverJobs.length} Touren, ${statusChanges} Statusänderungen, ${newRemote} neu, ${missingLocal} lokal veraltet.`);
    return { ok: true, ...state.lastResync };
  } catch (e) {
    log(`Full-Resync fehlgeschlagen: ${e.message}`);
    if (badge) { badge.textContent = "Resync-Fehler"; badge.className = "pill pill-err"; }
    return { ok: false, error: e.message };
  } finally {
    state._resyncing = false;
  }
}

function renderResyncSummary() {
  const badge = $("dbgResyncBadge");
  const summary = $("dbgResyncSummary");
  const r = state.lastResync;
  if (!r) return;
  const when = new Date(r.at).toLocaleTimeString("de-DE");
  const triggerLbl = r.trigger === "reconnect" ? "nach Reconnect" : r.trigger === "periodic" ? "periodisch" : "manuell";
  if (badge) { badge.textContent = `Resync ${when}`; badge.className = "pill pill-ok"; }
  if (summary) {
    if (r.statusChanges === 0 && r.newRemote === 0 && r.missingLocal === 0) {
      summary.textContent = `Kein Drift (${triggerLbl}, ${r.durationMs} ms).`;
    } else {
      summary.textContent = `${triggerLbl}: ${r.statusChanges} Statusänderung(en), ${r.newRemote} neu vom Server, ${r.missingLocal} lokal veraltet.`;
    }
  }
}



// ---- Auto polling ----
$("btnPollStart").addEventListener("click", startPolling);
$("btnPollStop").addEventListener("click", stopPolling);

// Manueller Sofort-Refresh: liest einen frischen Job-Snapshot ein und aktualisiert
// alle abhängigen Widgets – unabhängig davon, ob das Polling gerade läuft.
const _btnRefreshTelemetry = $("btnRefreshTelemetry");
if (_btnRefreshTelemetry) {
  _btnRefreshTelemetry.addEventListener("click", async () => {
    const btn = _btnRefreshTelemetry;
    const url = ($("f_polUrl")?.value || "http://localhost:25555/api/ets2/telemetry").trim();
    const prev = btn.textContent;
    btn.disabled = true; btn.textContent = "… lädt";
    // Snapshot-Log erzwingen, damit man den frischen Frame in den Logs sieht.
    state._loggedJob = false;
    log("Manueller Telemetrie-Refresh angefordert.");
    try { await pollOnce(url); }
    finally {
      btn.disabled = false; btn.textContent = prev;
    }
  });
}

function log(msg) {
  const el = $("pollLog"); if (!el) return;
  const t = new Date().toLocaleTimeString("de-DE");
  el.textContent = `[${t}] ${msg}\n` + el.textContent;
  if (el.textContent.length > 20000) el.textContent = el.textContent.slice(0, 20000);
}

function startPolling() {
  const url = $("f_polUrl").value.trim();
  const interval = Math.max(500, Number($("f_polInterval").value) || 2000);
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.liveWarned = false;
  state.telemetryWarned = false;
  state.polling = true;
  setStatus("pollStatus", "Polling aktiv…", "ok");
  $("btnPollStart").disabled = true; $("btnPollStop").disabled = false;
  log(`Polling gestartet: ${url} alle ${interval} ms`);
  state.pollTimer = setInterval(() => pollOnce(url), interval);
  pollOnce(url);
  refreshDebug();
}

function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = null;
  state.polling = false;
  $("btnPollStart").disabled = false; $("btnPollStop").disabled = true;
  setStatus("pollStatus", "Polling gestoppt.");
  log("Polling gestoppt.");
  refreshDebug();
}

async function pollOnce(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      if (!state.telemetryWarned) { log(`Telemetrie-Server HTTP ${r.status} – läuft ets2-telemetry-server?`); state.telemetryWarned = true; }
      return;
    }
    state.telemetryWarned = false;
    const data = await r.json();
    state.lastFrame = data;
    if (!state._loggedShape) {
      state._loggedShape = true;
      const jobKeys = data && data.job ? Object.keys(data.job).slice(0, 20).join(", ") : "(kein job-Objekt)";
      log(`Telemetrie verbunden. Top-Level: ${Object.keys(data).slice(0,10).join(", ")}. Job-Felder: ${jobKeys}`);
    }
    // Beim ersten Frame mit echten Job-Daten die konkreten Werte einmal loggen (Diagnose Mapping).
    if (!state._loggedJob && data && data.job) {
      const j = data.job;
      const hasAny = j.sourceCity || j.destinationCity || j.cargo || j.mass || j.plannedDistanceKm || j.income;
      if (hasAny) {
        state._loggedJob = true;
        log(`Job-Snapshot: cargo=${JSON.stringify(j.cargo)} mass=${j.mass} plannedDistanceKm=${j.plannedDistanceKm} income=${j.income} src=${JSON.stringify(j.sourceCity ?? j.source)} dst=${JSON.stringify(j.destinationCity ?? j.destination)}`);
      }
    }





    updateDashboard(data);
    updateVehicle(data);
    updateActiveJobWidget(data);
    await postLiveFrame(data);
    await syncJobLifecycle(data);

  } catch (e) {
    if (!state.telemetryWarned) {
      log(`Telemetrie-Server nicht erreichbar: ${e.message}. Starte ets2-telemetry-server auf localhost:25555.`);
      state.telemetryWarned = true;
    }
  }
}

function n(v, d = 0) { return typeof v === "number" && !isNaN(v) ? v : d; }
function gameOf(d) { return ((d.game || {}).gameName || "").toLowerCase().includes("ats") ? "ats" : "ets2"; }

// normalizeJob lebt in normalize-job.js (UMD, gemeinsam mit Node-Unit-Tests).
// Wir referenzieren die globale Version, damit die Renderer-Datei unverändert bleibt.
const normalizeJob = window.normalizeJob;



function updateDashboard(d) {
  const t = d.truck || {}, j = d.job || {};
  $("dsSpeed").textContent = `${Math.round(n(t.speed))} km/h`;
  $("dsTruck").textContent = t.make && t.model ? `${t.make} ${t.model}` : t.model || "Kein LKW erkannt";
  const fuel = n(t.fuel), capacity = n(t.fuelCapacity, 1);
  $("dsFuel").textContent = `${Math.round(fuel)} / ${Math.round(capacity)} L`;
  const pct = capacity > 0 ? (fuel / capacity) * 100 : 0;
  const bar = $("dsFuelBar");
  bar.style.width = `${Math.min(100, pct)}%`;
  bar.className = "progress-bar" + (pct < 15 ? " danger" : pct < 30 ? " warn" : "");
  const nj = normalizeJob(j, { trailer: d.trailer, cargo: d.cargo, navigation: d.navigation });
  $("dsDistance").textContent = nj.distanceKm != null ? `${Math.round(n(nj.distanceKm))} km` : "— km";
  $("dsRoute").textContent = (nj.src && nj.dst) ? `${nj.src} → ${nj.dst}` : "—";
  const drove = n(t.userSteeringSelector) || n((d.game || {}).drivingMinutes) || 0;
  $("dsDriveTime").textContent = drove > 0 ? `${drove} Min` : "— Min";
  const rest = n((d.game || {}).nextRestStopTime) || 0;
  $("dsRestTime").textContent = rest > 0 ? `Ruhezeit: ${rest} Min` : "Ruhezeit: —";
}

function updateActiveJobWidget(d) {
  const nj = normalizeJob(d.job, { trailer: d.trailer, cargo: d.cargo, navigation: d.navigation });
  const { src, dst, cargo } = nj;
  const hasJob = !!(src && dst);
  const card = $("activeJobCard"); if (!card) return;
  if (!hasJob) {
    card.classList.add("empty");
    $("ajRoute").textContent = "Kein aktiver Auftrag";
    $("ajCargo").textContent = "Nimm im Spiel einen Auftrag an – er wird automatisch übernommen.";
    $("ajIncome").textContent = "—"; $("ajDistance").textContent = "—"; $("ajMass").textContent = "—";
    $("ajStatus").textContent = "Wartet auf Spiel"; $("ajStatus").className = "pill";
    const warn = $("ajWarning"); if (warn) { warn.style.display = "none"; warn.textContent = ""; }
    return;
  }
  card.classList.remove("empty");
  $("ajRoute").textContent = `${src} → ${dst}`;
  $("ajCargo").textContent = cargo || "Fracht wird ermittelt…";
  const incomeOk = nj.income != null && n(nj.income) > 0;
  const massOk = nj.mass != null && n(nj.mass) > 0;
  $("ajIncome").textContent = incomeOk ? `${Math.round(n(nj.income))} €` : "Wird berechnet…";
  $("ajDistance").textContent = nj.distanceKm != null ? `${Math.round(n(nj.distanceKm))} km` : "Wird berechnet…";
  $("ajMass").textContent = massOk ? `${(n(nj.mass) / 1000).toFixed(1)} t` : "Wird berechnet…";
  const pill = $("ajStatus");
  if (state.activeJob) { pill.textContent = "Läuft – automatisch synchronisiert"; pill.className = "pill pill-ok"; }
  else { pill.textContent = "Wird angelegt…"; pill.className = "pill pill-warn"; }

  // Warnhinweis: fehlende income/mass sind fast immer Telemetry-Mod-Version, nicht ein App-Bug.
  const warn = $("ajWarning");
  if (warn) {
    const missing = [];
    if (!incomeOk) missing.push("Vergütung");
    if (!massOk) missing.push("Gewicht");
    if (missing.length) {
      const lastAt = new Date().toLocaleTimeString("de-DE");
      warn.style.display = "";
      warn.innerHTML = `⚠ ${missing.join(" & ")} fehlt in der Telemetrie. Das Spiel liefert das Feld für diesen Auftrag noch nicht – wird beim nächsten Frame erneut geprüft. <span class="muted">Letzter Telemetrie-Frame: ${lastAt}</span>`;
    } else {
      warn.style.display = "none";
      warn.textContent = "";
    }
  }
  renderJobDebug(d.job, nj, hasJob);
}

function fmtDbg(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") {
    try { return JSON.stringify(v).slice(0, 80); } catch { return String(v); }
  }
  if (typeof v === "string") return v === "" ? '""' : v;
  return String(v);
}

function renderJobDebug(rawJob, nj, hasJob) {
  const j = rawJob || {};
  const setTxt = (id, val) => { const el = $(id); if (el) el.textContent = fmtDbg(val); };
  // Roh-Werte (bewusst mehrere gängige Feldpfade zusammenfassen)
  setTxt("jdRawSrc", j.sourceCity ?? j.source?.city?.name ?? j.source?.city ?? j.source);
  setTxt("jdRawDst", j.destinationCity ?? j.destination?.city?.name ?? j.destination?.city ?? j.destination);
  setTxt("jdRawCargo", j.cargo ?? j.cargoName ?? j.trailer?.cargo);
  setTxt("jdRawIncome", j.income ?? j.money ?? j.reward ?? j.expectedIncome);
  setTxt("jdRawMass", j.mass ?? j.cargo?.mass ?? j.trailer?.mass);
  setTxt("jdRawDist", j.plannedDistanceKm ?? j.plannedDistance ?? j.navigation?.plannedDistanceKm);
  // Normalisierte Werte
  setTxt("jdNormSrc", nj.src);
  setTxt("jdNormDst", nj.dst);
  setTxt("jdNormCargo", nj.cargo);
  setTxt("jdNormIncome", nj.income);
  setTxt("jdNormMass", nj.mass);
  setTxt("jdNormDist", nj.distanceKm);
  setTxt("jdNormFinished", nj.finished);
  setTxt("jdNormCancelled", nj.cancelled);
  setTxt("jdHasJob", hasJob);
  setTxt("jdActiveJob", state.activeJob ? `${state.activeJob.id ? state.activeJob.id.slice(0,8) : "queued"} · ${state.activeJob.source}→${state.activeJob.dest}` : "—");
}

// ---- Mapping-Diff-Logging ----------------------------------------------------
// Vergleicht die rohen SCS-Felder (mehrere gängige Feldpfade) mit dem Payload,
// den wir tatsächlich an den Server schicken. Wenn ein Feld im Rohobjekt vorhanden
// ist, aber im Payload fehlt (oder umgekehrt einen anderen Wert hat), wird eine
// Warnung in Log und Konsole geschrieben. Rate-limited pro (kind|signatur), damit
// nicht jeder Poll-Tick spammt.
const _mappingDiffSeen = new Map(); // key -> lastLoggedAt
function _rawJobCandidates(j) {
  j = j || {};
  return {
    src:      { value: j.sourceCity ?? j.source?.city?.name ?? j.source?.city ?? j.source, from: "sourceCity|source.city.name|source.city|source" },
    dst:      { value: j.destinationCity ?? j.destination?.city?.name ?? j.destination?.city ?? j.destination, from: "destinationCity|destination.city.name|destination.city|destination" },
    cargo:    { value: (typeof j.cargo === "string" ? j.cargo : j.cargo?.name) ?? j.cargoName ?? j.trailer?.cargo ?? j.cargo_id, from: "cargo|cargo.name|cargoName|trailer.cargo|cargo_id" },
    income:   { value: j.income ?? j.money ?? j.reward ?? j.expectedIncome ?? j.jobIncome ?? j.cargo?.income, from: "income|money|reward|expectedIncome|jobIncome|cargo.income" },
    mass:     { value: j.mass ?? j.cargoMass ?? j.cargo?.mass ?? j.trailer?.mass, from: "mass|cargoMass|cargo.mass|trailer.mass" },
    distance: { value: j.plannedDistanceKm ?? j.plannedDistance_km ?? j.remainingDistanceKm ?? j.plannedDistance ?? j.navigation?.plannedDistanceKm ?? j.navigation?.distance, from: "plannedDistanceKm|plannedDistance_km|remainingDistanceKm|plannedDistance|navigation.*" },
  };
}
function _normalizeCmp(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "object" && typeof v.name === "string") return v.name.trim() || null;
  return String(v);
}
function logJobMappingDiff(kind, rawJob, sentPayload, payloadKeyMap) {
  try {
    if (!rawJob || !sentPayload) return;
    const cands = _rawJobCandidates(rawJob);
    const diffs = [];
    for (const [field, { value: rawVal, from }] of Object.entries(cands)) {
      const sentKey = payloadKeyMap[field];
      const sentVal = sentKey ? sentPayload[sentKey] : undefined;
      const rawN = _normalizeCmp(rawVal);
      const sentN = _normalizeCmp(sentVal);
      // Für Zahlenfelder gilt 0 als "nicht sinnvoll geliefert"
      const numericField = field === "income" || field === "mass" || field === "distance";
      const rawMissing = rawN == null || (numericField && rawN === 0);
      const sentMissing = sentN == null || (numericField && sentN === 0);
      if (rawMissing && sentMissing) continue;
      if (String(rawN) === String(sentN)) continue;
      diffs.push({ field, raw: rawVal, sent: sentVal, from, sentKey: sentKey || "(nicht gemappt)" });
    }
    if (!diffs.length) return;
    const sig = diffs.map((d) => `${d.field}:${_normalizeCmp(d.raw)}→${_normalizeCmp(d.sent)}`).join(",");
    const key = `${kind}|${sig}`;
    const now = Date.now();
    const last = _mappingDiffSeen.get(key) || 0;
    if (now - last < 30000) return; // max 1× pro 30s pro Signatur
    _mappingDiffSeen.set(key, now);
    const summary = diffs.map((d) => `${d.field} (roh=${fmtDbg(d.raw)} via ${d.from} → sent[${d.sentKey}]=${fmtDbg(d.sent)})`).join("; ");
    log(`Mapping-Diff (${kind}): ${summary}`);
    try { console.debug("[mapping-diff]", kind, diffs, { rawJob, sentPayload }); } catch {}
  } catch (e) {
    try { console.debug("[mapping-diff] logger error", e); } catch {}
  }
}




function updateVehicle(d) {
  const t = d.truck || {};
  const fuel = n(t.fuel), capacity = n(t.fuelCapacity, 1);
  $("vFuelText").textContent = `${Math.round(fuel)} / ${Math.round(capacity)} L`;
  const pct = capacity > 0 ? (fuel / capacity) * 100 : 0;
  $("vFuelPct").textContent = `${Math.round(pct)}%`;
  const bar = $("vFuelBar");
  bar.style.width = `${Math.min(100, pct)}%`;
  bar.className = "progress-bar" + (pct < 15 ? " danger" : pct < 30 ? " warn" : "");
  $("vConsumption").textContent = t.fuelAverageConsumption != null ? `${n(t.fuelAverageConsumption).toFixed(1)} L/km` : "—";
  const damages = [
    ["Kabine", n(t.wearCabin) * 100], ["Fahrgestell", n(t.wearChassis) * 100],
    ["Motor", n(t.wearEngine) * 100], ["Getriebe", n(t.wearTransmission) * 100],
    ["Räder", n(t.wearWheels) * 100],
  ];
  $("damageList").innerHTML = damages.map(([lbl, val]) => {
    const p = Math.max(0, Math.min(100, val));
    const cls = p > 60 ? "danger" : p > 30 ? "warn" : "";
    return `<div class="damage-item"><span class="lbl">${lbl}</span><div class="progress"><div class="progress-bar ${cls}" style="width:${p}%"></div></div><span class="val">${Math.round(p)}%</span></div>`;
  }).join("");
  const drove = n((d.game || {}).drivingMinutes), rest = n((d.game || {}).nextRestStopTime);
  $("vDriveTime").textContent = drove > 0 ? `${drove} Min` : "—";
  $("vRestTime").textContent = rest > 0 ? `${rest} Min` : "—";
}

async function postLiveFrame(d) {
  const s = state.settings;
  if (!s.apiUrl || !s.apiKey) return;
  const t = d.truck || {}, j = d.job || {}, g = d.game || {};
  const body = {
    status: n(t.speed) > 5 ? "driving" : "idle",
    truck_model: t.model || undefined, truck_brand: t.make || undefined, truck_plate: t.licensePlate || undefined,
    speed_kmh: n(t.speed),
    position_x: t.placement?.x, position_y: t.placement?.y, position_z: t.placement?.z, heading: t.placement?.heading,
    fuel: n(t.fuel), fuel_capacity: n(t.fuelCapacity), fuel_level: n(t.fuel), fuel_consumption_avg: n(t.fuelAverageConsumption),
    cargo: (typeof j.cargo === "string" ? j.cargo : j.cargo?.name) || j.cargoName || undefined,
    cargo_mass_kg: n(j.mass ?? j.cargo?.mass),
    source_city: (j.sourceCity || j.source?.city?.name || j.source?.city) || undefined,
    dest_city: (j.destinationCity || j.destination?.city?.name || j.destination?.city) || undefined,
    job_distance_km: n(j.plannedDistanceKm ?? j.remainingDistanceKm),

    damage_cabin: n(t.wearCabin) * 100, damage_chassis: n(t.wearChassis) * 100, damage_engine: n(t.wearEngine) * 100,
    damage_transmission: n(t.wearTransmission) * 100, damage_wheels: n(t.wearWheels) * 100,
    driving_time_today_min: n(g.drivingMinutes) || undefined, rest_time_remaining_min: n(g.nextRestStopTime) || undefined,
    game: gameOf(d),
  };
  const ident = driverIdent(); if (!ident) return;
  Object.assign(body, ident);
  logJobMappingDiff("live-frame", j, body, {
    src: "source_city", dst: "dest_city", cargo: "cargo",
    income: null, mass: "cargo_mass_kg", distance: "job_distance_km",
  });
  try {
    const r = await fetch(`${s.apiUrl}/api/public/telemetry/live`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      if (!state.liveWarned) {
        state.liveWarned = true;
        if (r.status === 401) log("Live-Übertragung: Nicht autorisiert (401)");
        else if (r.status === 403) log("Live-Übertragung: Fahrer ist kein Mitglied dieser VTC (403)");
        else if (r.status === 404) log("Live-Übertragung: Fahrer konnte nicht zugeordnet werden (404)");
        else log(`Live-Übertragung HTTP ${r.status}`);
      }
      setConn(false);
    } else { state.liveWarned = false; setConn(true); markSync(); }
  } catch {
    setConn(false);
  }
}

// ---- Automatic job lifecycle sync ----
async function syncJobLifecycle(d) {
  const t = d.truck || {};
  const nj = normalizeJob(d.job, { trailer: d.trailer, cargo: d.cargo, navigation: d.navigation });
  const { src, dst, cargo } = nj;
  const hasJob = !!(src && dst);
  const sig = hasJob ? `${src}|${dst}|${cargo || "?"}` : "";
  const finished = nj.finished;
  const cancelledFlag = nj.cancelled;



  const trailerAttached = d.trailer && typeof d.trailer.attached === "boolean" ? d.trailer.attached : null;

  if (hasJob && !finished && !cancelledFlag && sig && sig !== state.lastJobSig && !state.activeJob) {
    state.lastJobSig = sig;
    log(`Neuer Auftrag erkannt: ${src} → ${dst}${cargo ? ` (${cargo})` : ""}`);
    const startedPayload = {
      source_city: src, dest_city: dst, cargo: cargo || "Unbekannt",
      distance_km: Math.round(n(nj.distanceKm)), revenue: Math.round(n(nj.income)),
      game: gameOf(d), truck: t.model,
    };
    logJobMappingDiff("job_started", d.job, startedPayload, {
      src: "source_city", dst: "dest_city", cargo: "cargo",
      income: "revenue", mass: null, distance: "distance_km",
    });
    const res = await postEvent("job_started", startedPayload);
    const baseAj = {
      source: src, dest: dst, cargo,
      income: n(nj.income),
      plannedDistanceKm: n(nj.distanceKm),
      drivenKm: 0,
      startOdometer: null,
      _lastTs: null,
    };
    if (res.ok && res.job_id) {
      state.activeJob = { ...baseAj, id: res.job_id };
      log(`Tour in Datenbank angelegt (${res.job_id.slice(0, 8)})`);
    } else if (res.queued) {
      state.activeJob = { ...baseAj, id: null };
      log("Tour zwischengespeichert – wird nachgesendet, sobald wieder Verbindung besteht.");
    } else {
      log(`Konnte Tour nicht anlegen: ${res.error}`);
      state.lastJobSig = "";
    }
    refreshDebug();
  }

  // ---- Gefahrene Distanz live mittracken (Odometer bevorzugt, sonst Speed-Integration) ----
  if (state.activeJob) {
    const odoRaw = typeof t.odometer === "number" ? t.odometer
      : (typeof t.gameOdometer === "number" ? t.gameOdometer
        : (typeof t.truckOdometer === "number" ? t.truckOdometer : null));
    if (odoRaw != null && Number.isFinite(odoRaw)) {
      if (state.activeJob.startOdometer == null) state.activeJob.startOdometer = odoRaw;
      const delta = odoRaw - state.activeJob.startOdometer;
      if (delta >= 0 && delta < 100000) state.activeJob.drivenKm = delta;
    } else {
      const now = Date.now();
      if (state.activeJob._lastTs) {
        const dtH = (now - state.activeJob._lastTs) / 3600000;
        if (dtH > 0 && dtH < 0.1) {
          state.activeJob.drivenKm = (state.activeJob.drivenKm || 0) + n(t.speed) * dtH;
        }
      }
      state.activeJob._lastTs = now;
    }
  }

  // ---- Ende-Erkennung: Job verschwindet oder Auflieger abgekuppelt ----
  const jobGone = state.activeJob && !hasJob;
  const trailerDetached = state.activeJob && trailerAttached === false;
  if (state.activeJob && (jobGone || trailerDetached) && !cancelledFlag) {
    state.missingJobTicks += 1;
  } else if (hasJob && trailerAttached !== false) {
    state.missingJobTicks = 0;
  }

  const MISSING_THRESHOLD = 3; // ~6s bei 2s-Polling – vermeidet Menü-/Aussetzer-Fehlalarme
  if (state.activeJob && (finished || state.missingJobTicks >= MISSING_THRESHOLD) && !cancelledFlag) {
    const aj = state.activeJob;
    const finalKm = Math.round(Math.max(n(aj.drivenKm), n(aj.plannedDistanceKm), n(nj.distanceKm)));
    const reason = finished ? "Spiel meldet abgeschlossen"
      : trailerDetached ? "Auflieger abgekuppelt"
        : "Job aus Telemetrie verschwunden";
    log(`Auftrags-Ende erkannt (${reason}) – schließe Tour ab (${finalKm} km).`);
    const deliveredPayload = {
      source_city: aj.source || src || "?",
      dest_city: aj.dest || dst || "?",
      cargo: aj.cargo || cargo || "Unbekannt",
      distance_km: finalKm,
      revenue: Math.round(n(aj.income) || n(nj.income)),
      fuel_cost: 0,
      damage_pct: Math.round(n(t.wearCabin) * 100),
      game: gameOf(d), truck: t.model,
    };
    const res = await postEvent("job_delivered", deliveredPayload, aj.id ? { job_id: aj.id } : {});
    log(res.ok ? "Tour abgeschlossen ✓ (Status: zur Prüfung)" : (res.queued ? "Abschluss zwischengespeichert – wird nachgesendet." : `Fehler: ${res.error}`));
    state.activeJob = null;
    state.lastJobSig = "";
    state.missingJobTicks = 0;
    state.lastJobFinished = false;
    refreshDebug();
    return;
  }
  state.lastJobFinished = finished;

  // Explizit vom Spiel gemeldete Abbrüche als "rejected".
  if (cancelledFlag && state.activeJob) {
    const reason = "im Spiel abgebrochen";
    log(`Auftrag-Abbruch erkannt (${reason}) – markiere Tour als abgelehnt.`);
    const res = await postEvent("job_cancelled", { reason }, state.activeJob?.id ? { job_id: state.activeJob.id } : {});
    log(res.ok ? "Abbruch synchronisiert ✓" : (res.queued ? "Abbruch zwischengespeichert." : `Fehler: ${res.error}`));
    state.activeJob = null; state.lastJobSig = ""; state.missingJobTicks = 0;
    refreshDebug();
  }
}

// ---- Event history (local) ----
function renderHistory() {
  const list = $("historyList");
  if (state.history.length === 0) {
    list.innerHTML = '<div class="muted small" style="padding:20px;text-align:center">Noch keine Ereignisse.</div>';
    return;
  }
  list.innerHTML = state.history.map((h) => {
    const d = new Date(h.ts).toLocaleString("de-DE");
    return `<div class="history-item ${h.ok ? "ok" : "err"}"><div class="h-title">${h.ok ? "✓" : "✕"} ${h.event}${h.ok ? "" : " – Fehlgeschlagen"}</div><div class="h-meta">${d} · ${h.msg}</div></div>`;
  }).join("");
}

$("btnClearHistory").addEventListener("click", () => { state.history = []; saveHistory(); renderHistory(); });
renderHistory();

// ---- Jobs history (remote read-only) ----
async function refreshJobsHistory() {
  const s = state.settings; const list = $("jobsList"); if (!list) return;
  if (!s.apiUrl || !s.apiKey) { list.innerHTML = '<div class="muted small" style="padding:20px;text-align:center">Bitte zuerst API-URL und Schlüssel speichern.</div>'; return; }
  const ident = driverIdent();
  if (!ident) { list.innerHTML = '<div class="muted small" style="padding:20px;text-align:center">Bitte Steam-ID oder Fahrer-Benutzer-ID in den Einstellungen setzen.</div>'; return; }
  list.innerHTML = '<div class="muted small" style="padding:20px;text-align:center">Lade Touren…</div>';
  const params = new URLSearchParams({ ...ident, limit: "100" });
  try {
    const r = await fetch(`${s.apiUrl}/api/public/jobs/recent?${params}`, {
      headers: { authorization: `Bearer ${s.apiKey}` },
    });
    if (!r.ok) {
      const errBody = await r.json().catch(() => ({}));
      const msg = errBody?.error || r.statusText || "Anfrage fehlgeschlagen";
      list.innerHTML = `<div class="muted small" style="padding:20px;text-align:center">Fehler HTTP ${r.status} – ${escapeHtml(msg)}</div>`;
      recordError("jobs", r.status, msg);
      return;
    }
    const data = await r.json();
    state.jobsHistory = data.jobs || [];
    renderJobsHistory();
    clearError("jobs");
  } catch (e) {
    list.innerHTML = `<div class="muted small" style="padding:20px;text-align:center">Netzwerkfehler: ${escapeHtml(e.message)}</div>`;
    recordError("jobs", null, `Netzwerkfehler: ${e.message}`);
  }
}


function applyFilters(rows) {
  const { status, period, game, search } = state.filters;
  const q = (search || "").trim().toLowerCase();
  let cutoff = 0;
  if (period === "today") { const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime(); }
  else if (period === "7d") cutoff = Date.now() - 7 * 86400e3;
  else if (period === "30d") cutoff = Date.now() - 30 * 86400e3;
  else if (period === "90d") cutoff = Date.now() - 90 * 86400e3;
  return rows.filter((j) => {
    if (status && j.status !== status) return false;
    if (game && (j.game || "").toLowerCase() !== game) return false;
    if (cutoff) {
      const t = j.submitted_at ? new Date(j.submitted_at).getTime() : 0;
      if (!t || t < cutoff) return false;
    }
    if (q) {
      const hay = `${j.source_city||""} ${j.dest_city||""} ${j.cargo||""} ${j.truck||""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderJobsHistory() {
  const list = $("jobsList"); if (!list) return;
  const rows = applyFilters(state.jobsHistory);
  const cnt = $("jobsCount"); if (cnt) cnt.textContent = `${rows.length} / ${state.jobsHistory.length} Touren`;
  if (!rows.length) {
    list.innerHTML = '<div class="muted small" style="padding:20px;text-align:center">Keine Touren passen zu den Filtern.</div>';
    return;
  }
  const statusLabel = { in_progress: "Unterwegs", submitted: "Offen", approved: "Genehmigt", rejected: "Abgelehnt" };
  const statusCls = { in_progress: "pill-warn", submitted: "pill", approved: "pill-ok", rejected: "pill-err" };
  list.innerHTML = rows.map((j) => {
    const when = j.submitted_at ? new Date(j.submitted_at).toLocaleString("de-DE") : "";
    const km = j.distance_km != null ? `${Math.round(j.distance_km)} km` : "—";
    const rev = j.revenue != null ? `${Math.round(j.revenue).toLocaleString("de-DE")} €` : "—";
    const s = j.status || "submitted";
    return `<div class="job-row"><div class="job-main"><div class="job-route">${escapeHtml(j.source_city || "?")} → ${escapeHtml(j.dest_city || "?")}</div><div class="job-sub">${escapeHtml(j.cargo || "")} · ${escapeHtml((j.game || "").toUpperCase())}${j.truck ? " · " + escapeHtml(j.truck) : ""}</div><div class="job-meta">${when}</div></div><div class="job-nums"><div class="job-km">${km}</div><div class="job-rev">${rev}</div><span class="pill ${statusCls[s] || "pill"}">${statusLabel[s] || s}</span></div></div>`;
  }).join("");
}

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function bindFilter(id, key) {
  const el = $(id); if (!el) return;
  el.addEventListener("input", () => { state.filters[key] = el.value; renderJobsHistory(); });
  el.addEventListener("change", () => { state.filters[key] = el.value; renderJobsHistory(); });
}
bindFilter("fltStatus", "status");
bindFilter("fltPeriod", "period");
bindFilter("fltGame", "game");
bindFilter("fltSearch", "search");

// ---- Export CSV / PDF ----
function exportedRows() { return applyFilters(state.jobsHistory); }

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toCsv(rows) {
  const cols = ["submitted_at","status","source_city","dest_city","cargo","distance_km","revenue","fuel_cost","damage_pct","game","truck"];
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",;\n]/.test(s) ? `"${s}"` : s;
  };
  const header = cols.join(";");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(";")).join("\n");
  return "\uFEFF" + header + "\n" + body;
}

$("btnExportCsv")?.addEventListener("click", () => {
  const rows = exportedRows();
  if (!rows.length) { alert("Keine Touren zum Export."); return; }
  downloadBlob(`touren-${new Date().toISOString().slice(0,10)}.csv`, new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
});

$("btnExportPdf")?.addEventListener("click", () => {
  const rows = exportedRows();
  if (!rows.length) { alert("Keine Touren zum Export."); return; }
  const style = `body{font-family:-apple-system,Segoe UI,sans-serif;color:#111;padding:24px}h1{font-size:18px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f4f4f5}.right{text-align:right}`;
  const rowsHtml = rows.map((r) => `<tr><td>${r.submitted_at ? new Date(r.submitted_at).toLocaleString("de-DE") : ""}</td><td>${escapeHtml(r.status||"")}</td><td>${escapeHtml(r.source_city||"")} → ${escapeHtml(r.dest_city||"")}</td><td>${escapeHtml(r.cargo||"")}</td><td class="right">${r.distance_km!=null?Math.round(r.distance_km)+" km":""}</td><td class="right">${r.revenue!=null?Math.round(r.revenue).toLocaleString("de-DE")+" €":""}</td><td>${escapeHtml((r.game||"").toUpperCase())}</td><td>${escapeHtml(r.truck||"")}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Touren-Export</title><style>${style}</style></head><body><h1>Touren-Export – ${new Date().toLocaleString("de-DE")} (${rows.length} Einträge)</h1><table><thead><tr><th>Eingereicht</th><th>Status</th><th>Route</th><th>Fracht</th><th class="right">Distanz</th><th class="right">Umsatz</th><th>Spiel</th><th>LKW</th></tr></thead><tbody>${rowsHtml}</tbody></table><script>window.onload=()=>{window.print();}</script></body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { alert("Popup blockiert. Bitte Popups erlauben."); return; }
  w.document.write(html); w.document.close();
});

const btnRefreshJobs = $("btnRefreshJobs");
if (btnRefreshJobs) btnRefreshJobs.addEventListener("click", refreshJobsHistory);

// ---- Manual "Sync now" ----
const btnSyncNow = $("btnSyncNow");
if (btnSyncNow) {
  btnSyncNow.addEventListener("click", async () => {
    const statusEl = $("syncNowStatus");
    btnSyncNow.disabled = true;
    const prev = btnSyncNow.textContent;
    btnSyncNow.textContent = "Synchronisiere…";
    if (statusEl) statusEl.textContent = "Starte manuelle Synchronisierung…";
    log("Manuelle Synchronisierung ausgelöst.");
    try {
      const url = ($("f_polUrl")?.value || "http://localhost:25555/api/ets2/telemetry").trim();
      // 1) sofortiger Telemetrie-Poll (Live-Frame + Job-Lebenszyklus)
      await pollOnce(url);
      // 2) Retry-Queue leeren
      if (state.queue.length) {
        if (statusEl) statusEl.textContent = `Sende ${state.queue.length} wartende Ereignisse…`;
        await flushQueue();
      }
      // 3) Full-Resync (lädt Historie und korrigiert Drift)
      if (statusEl) statusEl.textContent = "Führe Full-Resync aus…";
      await fullResync("manual");

      const remaining = state.queue.length;
      if (statusEl) {
        statusEl.textContent = remaining === 0
          ? `Synchronisiert ✓ (${new Date().toLocaleTimeString("de-DE")})`
          : `Teilweise synchronisiert – ${remaining} Ereignis(se) in Warteschlange verblieben.`;
      }
      log(remaining === 0 ? "Manuelle Synchronisierung abgeschlossen ✓" : `Manuelle Synchronisierung: ${remaining} Ereignis(se) verbleiben in Warteschlange.`);
    } catch (e) {
      if (statusEl) statusEl.textContent = `Fehler: ${e.message}`;
      log(`Fehler bei manueller Synchronisierung: ${e.message}`);
    } finally {
      btnSyncNow.disabled = false;
      btnSyncNow.textContent = prev;
      refreshDebug();
    }
  });
}


setConn(state.online);
refreshDebug();

// Auto-start polling if configured
setTimeout(() => {
  if (state.settings.autoStart !== false && !state.polling) {
    log("Auto-Start: verbinde mit lokalem Telemetrie-Server…");
    startPolling();
  }
}, 500);
