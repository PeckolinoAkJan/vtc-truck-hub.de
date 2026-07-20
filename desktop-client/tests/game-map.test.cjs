/**
 * Unit-Tests für die Koordinaten-Transformation. Deckt Origin, Boundaries,
 * ETS2 und ATS getrennt ab.
 */
const assert = require("assert");
const path = require("path");

// localStorage-Stub für Node
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.window = {};

const gm = require(path.join(__dirname, "..", "renderer", "game-map.js"));
// Fallback: unser Modul exportiert via module.exports oder window.
const api = gm && gm.gameCoordinatesToMapCoordinates ? gm : global.window.VtcGameMap;

function approx(a, b, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

const ETS2 = api.getMapProviderConfig("ETS2");
const ATS = api.getMapProviderConfig("ATS");

// 1) Origin (linke obere Ecke) → [extent, 0]
{
  const [lat, lng] = api.gameCoordinatesToMapCoordinates("ETS2", {
    x: ETS2.originX,
    z: ETS2.originZ,
  });
  assert.ok(approx(lat, ETS2.mapExtent), `ETS2 origin lat: ${lat}`);
  assert.ok(approx(lng, 0), `ETS2 origin lng: ${lng}`);
}

// 2) Gegenüberliegende Ecke → [0, extent]
{
  const [lat, lng] = api.gameCoordinatesToMapCoordinates("ETS2", {
    x: ETS2.originX + ETS2.worldSize,
    z: ETS2.originZ + ETS2.worldSize,
  });
  assert.ok(approx(lat, 0), `ETS2 far lat: ${lat}`);
  assert.ok(approx(lng, ETS2.mapExtent), `ETS2 far lng: ${lng}`);
}

// 3) Zentrum ETS2 (Berlin-nahe grob bei x=0,z=0) → [extent/2, extent/2]
{
  const [lat, lng] = api.gameCoordinatesToMapCoordinates("ETS2", { x: 0, z: 0 });
  assert.ok(approx(lat, ETS2.mapExtent / 2), `ETS2 center lat: ${lat}`);
  assert.ok(approx(lng, ETS2.mapExtent / 2), `ETS2 center lng: ${lng}`);
}

// 4) Negative Koordinaten (Skandinavien / Schottland-Region)
{
  const [lat, lng] = api.gameCoordinatesToMapCoordinates("ETS2", { x: -8000, z: -8000 });
  assert.ok(lat > ETS2.mapExtent / 2 && lat < ETS2.mapExtent, `NW lat: ${lat}`);
  assert.ok(lng > 0 && lng < ETS2.mapExtent / 2, `NW lng: ${lng}`);
}

// 5) ATS hat größere Welt — dieselben Spielkoordinaten liefern andere Kartenkoordinaten
{
  const ets2 = api.gameCoordinatesToMapCoordinates("ETS2", { x: 1000, z: 1000 });
  const ats = api.gameCoordinatesToMapCoordinates("ATS", { x: 1000, z: 1000 });
  assert.notStrictEqual(ets2[0], ats[0], "ETS2/ATS lat sollten sich unterscheiden");
}

// 6) ATS Zentrum
{
  const [lat, lng] = api.gameCoordinatesToMapCoordinates("ATS", { x: 0, z: 0 });
  assert.ok(approx(lat, ATS.mapExtent / 2), `ATS center lat: ${lat}`);
  assert.ok(approx(lng, ATS.mapExtent / 2), `ATS center lng: ${lng}`);
}

// 7) normalizeGame
assert.strictEqual(api.normalizeGame("ats"), "ATS");
assert.strictEqual(api.normalizeGame("ATS"), "ATS");
assert.strictEqual(api.normalizeGame("ets2"), "ETS2");
assert.strictEqual(api.normalizeGame(undefined), "ETS2");
assert.strictEqual(api.normalizeGame(""), "ETS2");

// 8) Config hat Pflichtfelder
for (const key of ["ETS2", "ATS"]) {
  const c = api.getMapProviderConfig(key);
  for (const f of ["originX", "originZ", "worldSize", "tileUrl", "minZoom", "maxZoom", "mapExtent"]) {
    assert.ok(c[f] !== undefined, `${key}.${f} fehlt`);
  }
  assert.ok(/\{z\}/.test(c.tileUrl) && /\{x\}/.test(c.tileUrl) && /\{y\}/.test(c.tileUrl),
    `${key} tileUrl braucht XYZ-Platzhalter`);
}

console.log("game-map: 8/8 Tests bestanden");
