/**
 * VTC Hub Desktop Client · Live-Karte (Stufe 1: Tile-Layer für ETS2 / ATS)
 *
 * Zeigt die bereits vom Server gelieferten Fahrerpositionen jetzt auf einer
 * echten Spielkarte an (Städte, Straßen). Nutzt Leaflet + TileLayer und die
 * gemeinsame Koordinaten-Transformation aus `game-map.js`.
 *
 * Bestehende Verträge (Telemetrie-Ingest, Queue, Smart Resume, Ghost-Filter,
 * Updater, Chat, Auto-Polling) sind NICHT betroffen. Diese Datei ändert
 * ausschließlich die visuelle Kartenebene.
 *
 * Fehlerbehandlung: Wenn Tiles nicht laden (Fehler-Schwellwert überschritten),
 * fällt die Karte automatisch auf den bisherigen Grid-Hintergrund zurück —
 * Fahrerpositionen bleiben sichtbar.
 */
(function () {
  "use strict";

  const POLL_MS = 8000;
  const SMALL_MAP_ID = "lmMap";
  const BIG_MAP_ID = "lmMapBig";
  const STORAGE_KEY = "mpl.settings";
  const TILE_ERROR_THRESHOLD = 1; // v1.0.4-hotfix: sofortiger Grid-Fallback statt 8

  const GM = (typeof window !== "undefined" && window.VtcGameMap) || null;

  if (window.L && L.Icon && L.Icon.Default) {
    L.Icon.Default.mergeOptions({
      iconUrl: "vendor/leaflet/images/marker-icon.png",
      iconRetinaUrl: "vendor/leaflet/images/marker-icon-2x.png",
      shadowUrl: "vendor/leaflet/images/marker-shadow.png",
    });
  }

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }
  function driverIdent(s) {
    if (s.userId) return { driver_user_id: s.userId };
    if (s.steamId) return { driver_steam_id: s.steamId };
    return null;
  }

  const maps = {
    small: { map: null, markers: new Map(), tileLayer: null, baseLayer: null, tileErrors: 0, currentGame: null, fallback: false, centered: false },
    big: { map: null, markers: new Map(), tileLayer: null, baseLayer: null, tileErrors: 0, currentGame: null, fallback: false, centered: false },
  };
  let lastDrivers = [];
  let mapCities = [];
  let lastUpdatedAt = null;
  let gameMode = "auto"; // auto | ETS2 | ATS
  let followSelf = true;
  let filterMode = "vtc";
  let gameFilter = "all";
  let searchQuery = "";
  let focusDriverId = null;
  let pollTimer = null;
  let inFlight = false;

  function activeGame() {
    if (gameMode !== "auto") return gameMode;
    // Bevorzugt eigenes Spiel; sonst Mehrheit
    const self = lastDrivers.find((d) => d.isSelf && d.game);
    if (self) return GM ? GM.normalizeGame(self.game) : "ETS2";
    const counts = { ETS2: 0, ATS: 0 };
    for (const d of lastDrivers) {
      const g = GM ? GM.normalizeGame(d.game) : "ETS2";
      counts[g] = (counts[g] || 0) + 1;
    }
    return counts.ATS > counts.ETS2 ? "ATS" : "ETS2";
  }

  function toLatLng(pos, game) {
    if (GM) return GM.gameCoordinatesToMapCoordinates(game, pos);
    return [-pos.z, pos.x];
  }

  function ensureMap(kind) {
    const holder = document.getElementById(kind === "small" ? SMALL_MAP_ID : BIG_MAP_ID);
    if (!holder || !window.L) return null;
    if (maps[kind].map) return maps[kind].map;
    const map = L.map(holder, {
      crs: L.CRS.Simple,
      minZoom: 0,
      maxZoom: 7,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
    });
    map.setView([2048, 2048], 2);
    maps[kind].map = map;
    return map;
  }

  function applyTileLayer(kind) {
    const state = maps[kind];
    const map = state.map;
    if (!map || !GM) return;
    const game = activeGame();
    if (state.currentGame === game && state.tileLayer && !state.fallback) return;

    if (state.tileLayer) {
      map.removeLayer(state.tileLayer);
      state.tileLayer = null;
    }
    state.tileErrors = 0;
    state.fallback = false;

    if (!GM.isGameMapEnabled()) {
      state.currentGame = game;
      setAttribution("Einfache Kartenansicht (Spielkarte deaktiviert)");
      return;
    }

    const cfg = GM.getMapProviderConfig(game);
    if (!cfg.tileUrl) {
      state.currentGame = game;
      state.fallback = true;
      setAttribution(GM.getAttribution() + " · " + game);
      return;
    }
    const layer = L.tileLayer(cfg.tileUrl, {
      minZoom: cfg.minZoom,
      maxZoom: cfg.maxZoom,
      tileSize: 256,
      noWrap: true,
      // In CRS.Simple entspricht ein volles Weltquadrat der mapExtent.
      bounds: L.latLngBounds([0, 0], [cfg.mapExtent, cfg.mapExtent]),
    });
    let tileLoads = 0;
    layer.on("tileload", () => { tileLoads += 1; state.tileLoads = tileLoads; });
    layer.on("tileerror", (e) => {
      state.tileErrors += 1;
      try {
        console.warn("[live-map] tileerror", {
          url: (e && e.tile && e.tile.src) || cfg.tileUrl,
          errors: state.tileErrors,
          loads: tileLoads,
        });
      } catch (_) {}
      if (state.tileErrors > TILE_ERROR_THRESHOLD && !state.fallback) {
        state.fallback = true;
        map.removeLayer(layer);
        state.tileLayer = null;
        setAttribution(
          "Spielkarte nicht verfügbar (Tile-Fehler). Grid-Ansicht aktiv."
        );
      }
    });
    layer.addTo(map);
    state.tileLayer = layer;
    state.currentGame = game;
    // Kein setMaxBounds mehr: Fahrer außerhalb der Basiswelt (DLC, ATS)
    // sollen sichtbar bleiben. Grid-Fallback + Follow-Self reichen aus.
    setAttribution(GM.getAttribution() + " · " + game);
  }

  function renderCityBase(kind) {
    const state = maps[kind];
    const map = state.map;
    if (!map || !GM || !window.L) return;
    if (state.baseLayer) { map.removeLayer(state.baseLayer); state.baseLayer = null; }
    const game = activeGame();
    const cities = mapCities.filter((city) => GM.normalizeGame(city.game) === game);
    if (!cities.length) return;
    const layer = L.layerGroup();
    const connected = new Set();
    for (const city of cities) {
      const from = GM.gameCoordinatesToMapCoordinates(game, city);
      let nearest = null;
      let nearestSq = Infinity;
      for (const other of cities) {
        if (other === city) continue;
        const dx = city.x - other.x, dz = city.z - other.z;
        const sq = dx * dx + dz * dz;
        if (sq < nearestSq) { nearestSq = sq; nearest = other; }
      }
      if (nearest) {
        const key = [city.name, nearest.name].sort().join("|");
        if (!connected.has(key)) {
          connected.add(key);
          L.polyline([from, GM.gameCoordinatesToMapCoordinates(game, nearest)], {
            color: "#1f6f46", weight: 1.5, opacity: 0.42, interactive: false,
          }).addTo(layer);
        }
      }
      L.circleMarker(from, {
        radius: 3, color: "#49d17d", weight: 1, fillColor: "#123c2a", fillOpacity: 0.95,
      }).bindTooltip(city.name, { direction: "top", opacity: 0.9 }).addTo(layer);
    }
    layer.addTo(map);
    state.baseLayer = layer;
  }

  function setAttribution(txt) {
    const el = document.getElementById("lmAttribution");
    if (el) el.textContent = txt;
  }

  function makeIcon(driver) {
    const heading = ((driver.position && driver.position.heading) || 0) * 360;
    const cls = ["lm-marker"];
    if (driver.isSelf) cls.push("lm-self");
    const gameBadge = driver.game ? '<span class="lm-badge">' + escapeHtml(driver.game) + "</span>" : "";
    const html =
      '<div class="' + cls.join(" ") + '" style="transform:rotate(' + heading + 'deg)">' +
      '<div class="lm-arrow"></div>' +
      '<div class="lm-label">' + escapeHtml(driver.displayName) + gameBadge + "</div>" +
      "</div>";
    return L.divIcon({ className: "lm-marker-wrap", html, iconSize: [30, 30], iconAnchor: [15, 15] });
  }

  const LL = (typeof window !== "undefined" && window.VtcLiveMapLogic) || null;

  function popupHtml(d) {
    const ageSec = Math.max(0, Math.round((Date.now() - new Date(d.lastSeen).getTime()) / 1000));
    const job = d.job
      ? '<div class="lm-pop-row">' + escapeHtml(d.job.source || "?") + " → " + escapeHtml(d.job.destination || "?") + "</div>"
      : "";
    const compass = LL ? LL.headingToCompass(d.position && d.position.heading) : null;
    const fuel = d.fuelPct != null ? Math.round(d.fuelPct * 100) + "% Tank" : null;
    const dmg = d.damagePct != null ? Math.round(d.damagePct * 100) + "% Schaden" : null;
    const cargo = d.cargoMassT != null ? d.cargoMassT + " t" : null;
    const rem = d.jobRemainingKm != null ? Math.round(d.jobRemainingKm) + " km Rest" : null;
    const eta = LL && d.jobRemainingKm != null
      ? LL.formatEta(LL.computeEta({ remainingKm: d.jobRemainingKm, speedKmh: d.speed }))
      : null;
    const extras = [fuel, dmg, cargo, rem, compass && ("Richtung " + compass)]
      .filter(Boolean).map((s) => '<div class="lm-pop-row">' + escapeHtml(s) + "</div>").join("");
    const etaRow = eta ? '<div class="lm-pop-row">' + escapeHtml(eta) + "</div>" : "";
    return (
      '<div class="lm-popup"><div class="lm-pop-name">' + escapeHtml(d.displayName) +
      ' <span class="lm-pop-game">' + escapeHtml(d.game) + "</span></div>" +
      '<div class="lm-pop-row">🚛 ' + escapeHtml(d.truck || "—") + "</div>" +
      '<div class="lm-pop-row">📍 ' + escapeHtml(d.city || "—") + "</div>" +
      '<div class="lm-pop-row">⏱ ' + Math.round(d.speed) + " km/h</div>" +
      '<div class="lm-pop-row">Status: ' + escapeHtml(d.status || "—") + "</div>" +
      job + extras + etaRow +
      '<div class="lm-pop-time">Update: vor ' + ageSec + "s</div></div>"
    );
  }

  function applyFilters(drivers) {
    return drivers.filter((d) => {
      if (!d.position) return false;
      if (filterMode === "self" && !d.isSelf) return false;
      if (LL) {
        if (!LL.matchesFilter(d, { search: searchQuery, onlyOnline: false, game: gameFilter, jobState: "all" })) return false;
      } else {
        if (gameFilter !== "all" && (GM ? GM.normalizeGame(d.game) : d.game) !== gameFilter) return false;
        if (searchQuery && !d.displayName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      }
      return true;
    });
  }

  function renderInto(kind, drivers) {
    const state = maps[kind];
    const map = ensureMap(kind);
    if (!map) return;
    applyTileLayer(kind);
    renderCityBase(kind);
    const game = activeGame();
    const seen = new Set();
    let selfLatLng = null;
    const allLatLngs = [];

    for (const d of drivers) {
      seen.add(d.driverId);
      const ll = toLatLng(d.position, GM ? GM.normalizeGame(d.game) : game);
      allLatLngs.push(ll);
      if (d.isSelf) selfLatLng = ll;
      let marker = state.markers.get(d.driverId);
      const icon = makeIcon(d);
      if (!marker) {
        marker = L.marker(ll, { icon }).addTo(map);
        state.markers.set(d.driverId, marker);
      } else {
        marker.setLatLng(ll);
        marker.setIcon(icon);
      }
      marker.bindPopup(popupHtml(d));
    }
    for (const [id, m] of state.markers) {
      if (!seen.has(id)) { map.removeLayer(m); state.markers.delete(id); }
    }

    if (kind === "big" && focusDriverId) {
      const t = drivers.find((d) => d.driverId === focusDriverId);
      if (t && t.position) map.setView(toLatLng(t.position, GM ? GM.normalizeGame(t.game) : game), Math.max(map.getZoom(), 3));
    } else if (selfLatLng && followSelf) {
      // v1.0.4-hotfix: bei jedem Poll auf sich selbst zentrieren, damit der
      // Marker auch außerhalb der Tile-Weltbounds (DLC / ATS / Osteuropa)
      // sichtbar bleibt. Frühere Version zentrierte nur einmal → Marker off-screen.
      const z = state.centered ? map.getZoom() : 3;
      map.setView(selfLatLng, z, { animate: state.centered });
      state.centered = true;
    } else if (!state.centered && allLatLngs.length > 0) {
      map.setView(allLatLngs[0], 3); state.centered = true;
    }
    if (kind === "small") updateDebug(state, drivers, selfLatLng, game);
    setTimeout(() => map.invalidateSize(), 60);
  }

  function updateDebug(state, drivers, selfLatLng, game) {
    const el = document.getElementById("lmDebug");
    if (!el) return;
    const cfg = GM ? GM.getMapProviderConfig(game) : null;
    const c = state.map ? state.map.getCenter() : null;
    const lines = [
      "game=" + game + "  mode=" + gameMode,
      "tile=" + (cfg ? cfg.tileUrl : "-"),
      "enabled=" + (GM ? GM.isGameMapEnabled() : "?") +
        "  fallback=" + (state.fallback ? "yes" : "no"),
      "tiles: loaded=" + (state.tileLoads || 0) + "  err=" + state.tileErrors,
      "zoom=" + (state.map ? state.map.getZoom() : "-") +
        "  center=" + (c ? Math.round(c.lat) + "," + Math.round(c.lng) : "-"),
      "drivers=" + drivers.length + "  self=" + (selfLatLng ? Math.round(selfLatLng[0]) + "," + Math.round(selfLatLng[1]) : "—"),
    ];
    el.textContent = lines.join("\n");
  }

  function fitAll(kind) {
    const state = maps[kind];
    if (!state.map) return;
    const pts = [];
    for (const [, m] of state.markers) pts.push(m.getLatLng());
    if (pts.length === 0) return;
    state.map.fitBounds(L.latLngBounds(pts).pad(0.2));
  }

  function renderAll() {
    const filtered = applyFilters(lastDrivers);
    const empty = document.getElementById("lmEmpty");
    if (empty) empty.style.display = filtered.length ? "none" : "flex";
    renderInto("small", filtered);
    if (isModalOpen()) renderInto("big", filtered);
    const list = document.getElementById("lmModalList");
    const count = document.getElementById("lmModalCount");
    if (list) list.innerHTML = filtered
      .map((d) =>
        '<button class="lm-list-item ' + (focusDriverId === d.driverId ? "active" : "") +
        '" data-driver="' + escapeAttr(d.driverId) + '"><span class="lm-dot ' +
        (d.isSelf ? "self" : "") + '"></span><div class="lm-list-txt"><div class="lm-list-name">' +
        escapeHtml(d.displayName) + '</div><div class="lm-list-sub">' +
        escapeHtml(d.game) + " · " + escapeHtml(d.city || "—") + " · " + Math.round(d.speed) + " km/h</div></div></button>"
      ).join("");
    if (count) count.textContent = "· " + filtered.length + " Fahrer";
    const ts = document.getElementById("lmUpdated");
    if (ts && lastUpdatedAt) ts.textContent = "Live · " + new Date(lastUpdatedAt).toLocaleTimeString("de-DE");
  }

  async function fetchOnce() {
    if (inFlight) return;
    const s = getSettings();
    if (!s.apiUrl || !s.apiKey) return;
    const ident = driverIdent(s);
    if (!ident) return;
    inFlight = true;
    try {
      const r = await fetch(s.apiUrl + "/api/public/telemetry/livemap", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + s.apiKey },
        body: JSON.stringify(Object.assign({}, ident, { include_map_assets: mapCities.length === 0 })),
      });
      if (!r.ok) throw new Error("http_" + r.status);
      const data = await r.json();
      lastDrivers = Array.isArray(data.drivers) ? data.drivers : [];
      if (Array.isArray(data.cities) && data.cities.length) mapCities = data.cities;
      lastUpdatedAt = data.updatedAt || new Date().toISOString();
      const err = document.getElementById("lmError"); if (err) err.style.display = "none";
      renderAll();
    } catch (_) {
      const err = document.getElementById("lmError"); if (err) err.style.display = "flex";
    } finally {
      inFlight = false;
    }
  }

  function startPolling() {
    stopPolling();
    fetchOnce();
    pollTimer = setInterval(() => { if (document.hidden) return; fetchOnce(); }, POLL_MS);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  function isModalOpen() {
    const el = document.getElementById("lmModal");
    return !!(el && el.style.display !== "none");
  }
  function openModal() {
    const el = document.getElementById("lmModal"); if (!el) return;
    el.style.display = "flex"; el.setAttribute("aria-hidden", "false");
    ensureMap("big"); renderInto("big", applyFilters(lastDrivers));
  }
  function closeModal() {
    const el = document.getElementById("lmModal"); if (!el) return;
    el.style.display = "none"; el.setAttribute("aria-hidden", "true");
    focusDriverId = null;
  }

  function bindControls() {
    document.getElementById("lmZoomIn")?.addEventListener("click", () => maps.small.map?.zoomIn());
    document.getElementById("lmZoomOut")?.addEventListener("click", () => maps.small.map?.zoomOut());
    document.getElementById("lmCenterSelf")?.addEventListener("click", () => {
      const self = lastDrivers.find((d) => d.isSelf && d.position);
      if (self && maps.small.map) {
        maps.small.map.setView(toLatLng(self.position, GM ? GM.normalizeGame(self.game) : activeGame()), 4);
      }
    });
    document.getElementById("lmFit")?.addEventListener("click", () => fitAll("small"));
    document.getElementById("lmFollow")?.addEventListener("click", (e) => {
      followSelf = !followSelf;
      e.currentTarget.classList.toggle("active", followSelf);
    });
    document.getElementById("lmReload")?.addEventListener("click", () => {
      for (const kind of ["small", "big"]) {
        const st = maps[kind];
        if (st.tileLayer && st.map) { st.map.removeLayer(st.tileLayer); st.tileLayer = null; }
        st.currentGame = null; st.tileErrors = 0; st.fallback = false;
      }
      renderAll();
    });
    document.querySelectorAll("[data-lm-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-lm-mode]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        gameMode = btn.getAttribute("data-lm-mode");
        // Tile-Layer neu berechnen
        for (const kind of ["small", "big"]) {
          const st = maps[kind];
          if (st.tileLayer && st.map) { st.map.removeLayer(st.tileLayer); st.tileLayer = null; }
          st.currentGame = null;
        }
        renderAll();
      });
    });
    document.getElementById("lmExpand")?.addEventListener("click", openModal);
    document.getElementById("lmModalClose")?.addEventListener("click", closeModal);
    document.getElementById("lmSearch")?.addEventListener("input", (e) => {
      searchQuery = e.target.value || ""; renderAll();
    });
    document.querySelectorAll("[data-lm-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-lm-filter]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        filterMode = btn.getAttribute("data-lm-filter"); renderAll();
      });
    });
    document.querySelectorAll("[data-lm-game]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-lm-game]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        gameFilter = btn.getAttribute("data-lm-game"); renderAll();
      });
    });
    document.getElementById("lmModalList")?.addEventListener("click", (e) => {
      const t = e.target.closest("[data-driver]");
      if (!t) return;
      focusDriverId = t.getAttribute("data-driver");
      renderInto("big", applyFilters(lastDrivers)); renderAll();
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) fetchOnce(); });

    const followBtn = document.getElementById("lmFollow");
    if (followBtn) followBtn.classList.toggle("active", followSelf);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[<>&"']/g, (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function boot() {
    if (!window.L) return;
    ensureMap("small");
    bindControls();
    startPolling();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
