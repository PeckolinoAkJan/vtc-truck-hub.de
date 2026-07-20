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

export const FALLBACK_GAME_CITIES = [
  ["ETS2","London",-2570,-9370],["ETS2","Paris",-1440,-7770],["ETS2","Amsterdam",330,-9560],
  ["ETS2","Brüssel",-260,-8400],["ETS2","Frankfurt",2540,-8180],["ETS2","Hamburg",3960,-10770],
  ["ETS2","Berlin",5460,-9270],["ETS2","München",5030,-6770],["ETS2","Zürich",2600,-5900],
  ["ETS2","Wien",6520,-6960],["ETS2","Prag",6410,-8460],["ETS2","Warschau",9330,-9780],
  ["ETS2","Budapest",8010,-6500],["ETS2","Mailand",2610,-4470],["ETS2","Rom",4790,-1990],
  ["ETS2","Barcelona",-2410,-4020],["ETS2","Madrid",-4650,-3660],["ETS2","Lissabon",-7360,-3210],
  ["ETS2","Bukarest",11290,-4880],["ETS2","Brașov",11220,-4210],["ETS2","Sofia",11430,-3040],
  ["ETS2","Istanbul",13720,-3140],["ETS2","Kopenhagen",3990,-12140],["ETS2","Stockholm",6250,-14830],
  ["ETS2","Oslo",3020,-14570],["ATS","Seattle",-108430,-6800],["ATS","Portland",-110480,-1470],
  ["ATS","San Francisco",-108690,10770],["ATS","Los Angeles",-104650,17070],["ATS","San Diego",-101400,20200],
  ["ATS","Las Vegas",-96500,17370],["ATS","Phoenix",-89330,20460],["ATS","Salt Lake City",-84070,10460],
  ["ATS","Denver",-72240,13520],["ATS","Albuquerque",-77930,20400],["ATS","El Paso",-79900,23400],
  ["ATS","Dallas",-56200,23400],["ATS","Houston",-52400,25920],["ATS","Oklahoma City",-55890,19200],
  ["ATS","Kansas City",-52000,15450],
].map(([game, name, x, z]) => ({ game: String(game), name: String(name), country: null, x: Number(x), z: Number(z) }));

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
    "VTC Hub Stadtkarte · Weltkoordinaten: SCS Software"
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
