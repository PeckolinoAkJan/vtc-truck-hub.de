/**
 * VTC Hub Desktop Client · UI Adapter (v1.0.3)
 *
 * READ-ONLY Präsentations-Adapter. Diese Datei darf renderer.js,
 * normalize-job.js oder update-check.js NIEMALS verändern. Sie
 * spiegelt lediglich bereits gerenderte DOM-Signale in die neue
 * v1.0.3-Oberfläche (Statuskarten, Statusleiste, Log-Feed) und
 * verdrahtet UI-only Interaktionen (Tab-Switching, data-goto-Buttons).
 *
 * Wenn ein erwartetes Zielelement fehlt, tut die jeweilige Funktion
 * nichts – der Adapter ist damit auch dann sicher, wenn Teile des
 * Layouts entfernt werden.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const q = (sel) => document.querySelector(sel);
  const qa = (sel) => Array.from(document.querySelectorAll(sel));

  // ---------- Tab-Switching (basiert auf .nav-item[data-tab] und .panel[data-panel]) ----------
  // renderer.js verdrahtet die Original-Sidebar. Die neue Sidebar (.side-nav) nutzt exakt die
  // gleichen data-tab-Werte, dieser Adapter re-verdrahtet die Klicks nur zusätzlich.
  function activateTab(name) {
    if (!name) return;
    qa(".nav-item[data-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === name);
    });
    qa(".panel[data-panel]").forEach((p) => {
      p.classList.toggle("active", p.getAttribute("data-panel") === name);
    });
  }
  qa(".nav-item[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => activateTab(btn.getAttribute("data-tab")));
  });
  qa("[data-goto]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const target = el.getAttribute("data-goto");
      if (!target) return;
      e.preventDefault();
      activateTab(target);
    });
  });

  // ---------- Helpers ----------
  function setCardStatus(card, status) {
    if (!card) return;
    card.setAttribute("data-status", status || "idle");
  }
  function setText(id, text) {
    const el = $(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  // ---------- Top status card mirrors ----------
  function refreshStatusCards() {
    // Telemetrie (Polling aktiv?)
    const pollStatus = ($("pollStatus")?.textContent || "").toLowerCase();
    const polling = pollStatus.includes("aktiv");
    setText("scTelemetryValue", polling ? "Aktiv" : "Inaktiv");
    setText("scTelemetrySub", polling ? "ETS2/ATS-Server verbunden" : "Warte auf ETS2/ATS-Server");
    setCardStatus($("scTelemetry"), polling ? "ok" : "idle");

    // Synchronisation (Retry-Queue)
    const queueText = ($("queueBadge")?.textContent || "").trim();
    const queueEmpty = /leer/i.test(queueText) || queueText === "" || /^0\b/.test(queueText);
    setText("scSyncValue", queueEmpty ? "Live" : "Warteschlange");
    const lastSync = ($("dbgLastSync")?.textContent || "—").trim();
    setText("scSyncSub", queueEmpty ? `Letzte Sync: ${lastSync}` : queueText);
    setCardStatus($("scSync"), queueEmpty ? "ok" : "warn");

    // Auftragsstatus (aktive Route)
    const ajRoute = ($("ajRoute")?.textContent || "").trim();
    const hasJob = ajRoute && !/kein aktiver/i.test(ajRoute);
    setText("scJobValue", hasJob ? "Unterwegs" : "Bereit");
    setText("scJobSub", hasJob ? ajRoute : "Kein Auftrag aktiv");
    setCardStatus($("scJob"), hasJob ? "ok" : "idle");

    // Verbindung (API)
    const connLabel = ($("connLabel")?.textContent || "").trim();
    const online = /verbunden|online/i.test(connLabel);
    const failing = /fehler|offline|nicht/i.test(connLabel);
    setText("scApiValue", online ? "Online" : (failing ? "Getrennt" : "Prüft…"));
    setText("scApiSub", connLabel || "VTC Hub API");
    setCardStatus($("scApi"), online ? "ok" : (failing ? "err" : "idle"));
  }

  // ---------- Bottom statusbar mirrors ----------
  function refreshStatusBar() {
    const pollStatus = ($("pollStatus")?.textContent || "").toLowerCase();
    const polling = pollStatus.includes("aktiv");
    const sbPolling = $("sbPolling");
    if (sbPolling) {
      sbPolling.textContent = polling ? "Aktiv" : "Inaktiv";
      sbPolling.classList.toggle("on", polling);
      sbPolling.classList.toggle("off", !polling);
    }

    const connLabel = ($("connLabel")?.textContent || "").trim();
    const online = /verbunden|online/i.test(connLabel);
    const sbConn = $("sbConn");
    if (sbConn) {
      sbConn.textContent = online ? "Verbunden" : (connLabel || "Nicht verbunden");
      sbConn.classList.toggle("on", online);
      sbConn.classList.toggle("off", !online);
    }
  }

  // ---------- Systemprotokoll-Feed (spiegelt #pollLog + #historyList) ----------
  const MAX_FEED = 40;
  const seenLog = new Set();
  function pushFeed(msg, tone) {
    const feed = $("logFeed");
    if (!feed || !msg) return;
    const key = tone + "::" + msg;
    if (seenLog.has(key)) return;
    seenLog.add(key);
    // Cap set-Größe
    if (seenLog.size > 250) {
      const it = seenLog.values();
      for (let i = 0; i < 50; i++) seenLog.delete(it.next().value);
    }

    // Placeholder ("Client gestartet — —") entfernen, sobald echte Zeile kommt
    const placeholder = feed.querySelector(".lf-item[data-placeholder]");
    if (placeholder) placeholder.remove();

    const li = document.createElement("li");
    li.className = "lf-item" + (tone ? ` ${tone}` : "");
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    li.innerHTML = `<span class="lf-dot"></span><span class="lf-msg"></span><span class="lf-time"></span>`;
    li.querySelector(".lf-msg").textContent = msg;
    li.querySelector(".lf-time").textContent = time;
    feed.insertBefore(li, feed.firstChild);
    while (feed.children.length > MAX_FEED) feed.removeChild(feed.lastChild);
  }

  function tone(line) {
    const s = String(line).toLowerCase();
    if (/error|fehler|abgelehnt|failed|❌/.test(s)) return "err";
    if (/warn|warteschlange|retry|↺|⏳/.test(s)) return "warn";
    return "";
  }

  function pumpPollLog() {
    const pre = $("pollLog");
    if (!pre) return;
    const raw = (pre.textContent || "").split("\n").filter(Boolean);
    // letzte Zeilen zuletzt hinzugefügt: iteriere von oben nach unten
    // (Feed schiebt neueste nach vorne, also älteste zuerst rein)
    for (const line of raw.slice(-15)) pushFeed(line.trim(), tone(line));
  }

  function pumpHistory() {
    const list = $("historyList");
    if (!list) return;
    // renderer.js legt hier <div>-Kinder mit Text an – wir nehmen die neuesten 5
    const items = Array.from(list.children).slice(0, 5);
    for (const el of items) {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t) pushFeed(t.slice(0, 140), tone(t));
    }
  }

  // Initial-Placeholder
  const feed = $("logFeed");
  if (feed && feed.firstElementChild) feed.firstElementChild.setAttribute("data-placeholder", "1");

  // ---------- Update-Version Mirror ----------
  // Einzige Quelle der Wahrheit: die installierte Version, die update-check.js in
  // "vtcUpdateMeta" schreibt ("Installierte Version: vX.Y.Z"). Fallback ist die
  // in index.html gerenderte Version im "Installierte Version"-Row.
  function readInstalledVersion() {
    const meta = ($("vtcUpdateMeta")?.textContent || "").trim();
    const m = meta.match(/Installierte Version:\s*v(\d+\.\d+\.\d+)/i);
    if (m) return m[1];
    const rows = document.querySelectorAll(".uv-row");
    for (const r of rows) {
      if (/Installierte Version/i.test(r.textContent || "")) {
        const s = r.querySelector("strong");
        const v = (s?.textContent || "").trim().replace(/^v/i, "");
        if (/^\d+\.\d+\.\d+$/.test(v)) return v;
      }
    }
    return null;
  }

  function refreshUpdateBadge() {
    const meta = ($("vtcUpdateMeta")?.textContent || "").trim();
    const arrow = meta.match(/v(\d+\.\d+\.\d+)\s*→\s*v(\d+\.\d+\.\d+)/i);
    const latestEl = $("uvLatest");
    const badge = $("sbUpdateBadge");
    if (arrow) {
      if (latestEl) latestEl.textContent = "v" + arrow[2];
      if (badge) badge.innerHTML = `<span class="pill pill-warn">Update verfügbar: v${arrow[2]}</span>`;
    } else {
      const installed = readInstalledVersion();
      if (installed) {
        if (latestEl) latestEl.textContent = "v" + installed;
        if (badge) badge.innerHTML = `<span class="pill pill-ok">Client aktuell: v${installed}</span>`;
      }
    }
  }

  // ---------- Live-Info Mirror (Fahrer/Standort/Motor aus Settings + Aktivem Job) ----------
  function refreshLiveInfo() {
    // Fahrer aus Settings-Inputs (bereits im DOM vorhanden)
    const steamId = ($("s_steamId")?.value || "").trim();
    const userId  = ($("s_userId")?.value || "").trim();
    const nameGuess = steamId ? `Steam · ${steamId.slice(-6)}` : (userId ? `User · ${userId.slice(0, 6)}` : "Unbekannt");
    setText("liDriver", nameGuess);
    setText("sideUserName", nameGuess === "Unbekannt" ? "Fahrer" : nameGuess);

    // Spiel aus Poll-URL raten
    const url = ($("f_polUrl")?.value || "").toLowerCase();
    setText("liGame", url.includes("/ats/") ? "American Truck Simulator" : "Euro Truck Simulator 2");

    // Standort/Motor/Odo Platzhalter – werden von renderer.js nicht separat gepflegt.
    // Wir leiten aus vorhandenen Signalen ab:
    const route = ($("ajRoute")?.textContent || "").trim();
    setText("liLocation", (route && !/kein/i.test(route)) ? route.split(/[→>-]/).pop().trim() || route : "—");
    setText("mapLabel", (route && !/kein/i.test(route)) ? route : "Standort unbekannt");

    const speed = ($("dsSpeed")?.textContent || "").trim();
    const engineOn = !!speed && !/^0\s*km\/h|^—/.test(speed);
    setText("liEngine", engineOn ? "Motor läuft" : "Motor aus");

    // Odometer bleibt bis renderer.js liefert
    if (!$("liOdo")?.textContent || $("liOdo").textContent === "— km") {
      const dist = ($("dsDistance")?.textContent || "").trim();
      if (dist && dist !== "— km") setText("liOdo", dist);
    }
  }

  // ---------- Master Tick ----------
  function tick() {
    try { refreshStatusCards(); } catch (_) {}
    try { refreshStatusBar();   } catch (_) {}
    try { refreshLiveInfo();    } catch (_) {}
    try { pumpPollLog();        } catch (_) {}
    try { pumpHistory();        } catch (_) {}
    try { refreshUpdateBadge(); } catch (_) {}
  }
  tick();
  setInterval(tick, 1500);
})();
