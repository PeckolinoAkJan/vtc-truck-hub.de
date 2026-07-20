/**
 * VTC Hub Desktop Client · Game-Map-Konfiguration (ETS2 / ATS)
 *
 * Portierung von `src/lib/game-map.ts`. Werte müssen identisch bleiben —
 * bei Änderungen beide Dateien anpassen. Keine externen Abhängigkeiten.
 */
(function () {
  "use strict";

  const DEFAULTS = {
    ETS2: {
      originX: -16384,
      originZ: -16384,
      worldSize: 32768,
      tileUrl: "",
      minZoom: 0,
      maxZoom: 7,
      mapExtent: 4096,
    },
    ATS: {
      originX: -32768,
      originZ: -32768,
      worldSize: 65536,
      tileUrl: "",
      minZoom: 0,
      maxZoom: 7,
      mapExtent: 4096,
    },
  };

  function normalizeGame(raw) {
    return String(raw || "").toLowerCase() === "ats" ? "ATS" : "ETS2";
  }

  function getSettingsOverride(key) {
    try {
      const raw = localStorage.getItem("mpl.settings");
      const s = raw ? JSON.parse(raw) : {};
      return (s && s[key]) || null;
    } catch (_) {
      return null;
    }
  }

  function getMapProviderConfig(game) {
    const g = normalizeGame(game);
    const base = DEFAULTS[g];
    const override =
      g === "ETS2"
        ? getSettingsOverride("ets2TileUrl")
        : getSettingsOverride("atsTileUrl");
    return Object.assign({}, base, override ? { tileUrl: override } : {});
  }

  function isGameMapEnabled() {
    const flag = getSettingsOverride("gameMapEnabled");
    return flag !== false;
  }

  function getAttribution() {
    return (
      getSettingsOverride("mapAttribution") ||
      "VTC Hub Stadtkarte · Weltkoordinaten: SCS Software"
    );
  }

  /**
   * Spielwelt (x, z) → Leaflet CRS.Simple [lat, lng].
   * u = (x-originX)/worldSize; v = (z-originZ)/worldSize;
   * lat = (1-v)*extent; lng = u*extent.
   */
  function gameCoordinatesToMapCoordinates(game, pos) {
    const cfg = getMapProviderConfig(game);
    const u = (pos.x - cfg.originX) / cfg.worldSize;
    const v = (pos.z - cfg.originZ) / cfg.worldSize;
    return [(1 - v) * cfg.mapExtent, u * cfg.mapExtent];
  }

  const api = {
    normalizeGame,
    getMapProviderConfig,
    isGameMapEnabled,
    getAttribution,
    gameCoordinatesToMapCoordinates,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (typeof window !== "undefined") {
    window.VtcGameMap = api;
  }
})();
