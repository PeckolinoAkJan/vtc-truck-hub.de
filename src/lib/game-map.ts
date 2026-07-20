/**
 * VTC Hub · Game-Map-Konfiguration (ETS2 / ATS)
 *
 * Zentrale Quelle für:
 *   1. Tile-Provider-URLs pro Spiel (Community-Tiles, per ENV überschreibbar)
 *   2. Koordinaten-Transformation Spielwelt → Leaflet-CRS.Simple
 *   3. Attribution & Feature-Flag
 *
 * Web (React) und Desktop-Client (Vanilla) müssen exakt dieselben Werte
 * benutzen. Die Desktop-Portierung liegt in `desktop-client/renderer/game-map.js`
 * und spiegelt diese Konstanten 1:1.
 *
 * Lizenzhinweis: Die Default-URLs zeigen auf öffentliche Community-Karten
 * (TruckyApp / TruckersMP). Wer eigene Tiles einsetzen möchte, überschreibt
 * `VITE_ETS2_TILE_URL` / `VITE_ATS_TILE_URL` in der .env. Setzt man
 * `VITE_GAME_MAP_ENABLED=false`, bleibt der bisherige Grid-Fallback aktiv.
 */

export type GameKey = "ETS2" | "ATS";

export interface GameMapConfig {
  /** Ursprung der Spielwelt in Spiel-Einheiten (x, z) */
  originX: number;
  originZ: number;
  /** Kantenlänge der abgebildeten Welt in Spiel-Einheiten */
  worldSize: number;
  /** Tile-URL im XYZ-Schema {z}/{x}/{y}.png */
  tileUrl: string;
  minZoom: number;
  maxZoom: number;
  /** Leaflet-Skalen-Referenz: Anzahl Karten-Einheiten für ein volles World-Quadrat */
  mapExtent: number;
}

const DEFAULTS: Record<GameKey, GameMapConfig> = {
  ETS2: {
    originX: -16384,
    originZ: -16384,
    worldSize: 32768,
    tileUrl: "https://tiles.truckyapp.com/ets2/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 7,
    mapExtent: 4096,
  },
  ATS: {
    originX: -32768,
    originZ: -32768,
    worldSize: 65536,
    tileUrl: "https://tiles.truckyapp.com/ats/{z}/{x}/{y}.png",
    minZoom: 0,
    maxZoom: 7,
    mapExtent: 4096,
  },
};

function env(name: string): string | undefined {
  const meta =
    typeof import.meta !== "undefined" ? (import.meta as ImportMeta & { env?: Record<string, string> }).env : undefined;
  return meta?.[name];
}

export function isGameMapEnabled(): boolean {
  return (env("VITE_GAME_MAP_ENABLED") ?? "true") !== "false";
}

export function getMapProviderConfig(game: GameKey): GameMapConfig {
  const base = DEFAULTS[game];
  const override =
    game === "ETS2" ? env("VITE_ETS2_TILE_URL") : env("VITE_ATS_TILE_URL");
  return { ...base, tileUrl: override && override.length > 0 ? override : base.tileUrl };
}

export function getAttribution(): string {
  return (
    env("VITE_MAP_ATTRIBUTION") ??
    "Karte: © TruckyApp / TruckersMP · Welt: © SCS Software"
  );
}

/**
 * Wandelt Spielwelt-Koordinaten (x, z) in Leaflet-CRS.Simple-LatLng um.
 *
 *   u = (x - originX) / worldSize          ∈ [0..1]
 *   v = (z - originZ) / worldSize          ∈ [0..1]
 *   lat = (1 - v) * extent                 (Y ist nach oben invertiert)
 *   lng =       u  * extent
 *
 * Werte außerhalb [0..1] sind erlaubt — Leaflet zeichnet Marker auch außerhalb
 * des Kartenbildes (nützlich für DLC-Regionen, deren Tiles fehlen).
 */
export function gameCoordinatesToMapCoordinates(
  game: GameKey,
  pos: { x: number; z: number },
): [number, number] {
  const cfg = getMapProviderConfig(game);
  const u = (pos.x - cfg.originX) / cfg.worldSize;
  const v = (pos.z - cfg.originZ) / cfg.worldSize;
  const lat = (1 - v) * cfg.mapExtent;
  const lng = u * cfg.mapExtent;
  return [lat, lng];
}

export function normalizeGame(raw: string | null | undefined): GameKey {
  const s = String(raw ?? "").toLowerCase();
  return s === "ats" ? "ATS" : "ETS2";
}
