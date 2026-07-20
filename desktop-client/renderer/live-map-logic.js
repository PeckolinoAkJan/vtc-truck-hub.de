// VTC Hub · Desktop-Client · Live-Karte Stufe 2 – Shared Logic (JS-Spiegel).
// Muss 1:1 mit src/lib/live-map-logic.ts übereinstimmen. Wird von Tests und
// live-map.js genutzt.
'use strict';

function nearestCity(pos, cities) {
  if (!pos || !isFinite(pos.x) || !isFinite(pos.z)) return null;
  if (!cities || !cities.length) return null;
  let best = null;
  let bestSq = Infinity;
  for (const c of cities) {
    const dx = c.x - pos.x;
    const dz = c.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestSq) { bestSq = d2; best = c; }
  }
  if (!best) return null;
  return {
    name: best.name,
    country: best.country || null,
    distanceKm: Math.round((Math.sqrt(bestSq) / 1000) * 10) / 10,
  };
}

const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function headingToCompass(heading) {
  if (heading == null || !isFinite(heading)) return null;
  let deg = heading;
  if (deg <= 1 && deg >= -1) deg = deg * 360;
  deg = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

function computeEta(input, now) {
  const t0 = now || new Date();
  if (input.paused) return null;
  const rem = Number(input.remainingKm);
  if (!isFinite(rem) || rem <= 0) return null;
  const cur = Number(input.speedKmh || 0);
  const avg = Number(input.avgKmh || 0);
  let ref = 0, method = 'current-speed';
  if (avg > 20) { ref = avg; method = 'avg-speed'; }
  else if (cur > 15) { ref = cur; method = 'current-speed'; }
  else return null;
  const minutes = Math.max(1, Math.round((rem / ref) * 60));
  return { arrivalIso: new Date(t0.getTime() + minutes * 60000).toISOString(), minutes, method };
}

function formatEta(eta) {
  if (!eta) return null;
  const d = new Date(eta.arrivalIso);
  return `Geschätzte Ankunft: ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

function normalizeGameName(g) {
  return String(g || '').toUpperCase() === 'ATS' ? 'ATS' : 'ETS2';
}

function matchesFilter(d, f) {
  if (f.onlyOnline && d.status === 'offline') return false;
  if (f.game !== 'all' && normalizeGameName(d.game) !== f.game) return false;
  if (f.jobState === 'with-job' && !d.job) return false;
  if (f.jobState === 'no-job' && d.job) return false;
  const q = (f.search || '').trim().toLowerCase();
  if (q && !String(d.displayName).toLowerCase().includes(q)) return false;
  return true;
}

function fieldsVisibleTo(role, isSelf) {
  if (isSelf) return { telemetry: true, jobDetails: true, vehicleDetails: true, contact: true };
  if (role === 'owner' || role === 'admin' || role === 'dispatcher')
    return { telemetry: true, jobDetails: true, vehicleDetails: true, contact: true };
  if (role === 'driver')
    return { telemetry: true, jobDetails: false, vehicleDetails: true, contact: false };
  return { telemetry: false, jobDetails: false, vehicleDetails: false, contact: false };
}

function simplifyTrack(points, tolerance) {
  const tol = tolerance || 25;
  if (!points || points.length <= 2) return (points || []).slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const A = points[a], B = points[b];
    const dx = B.x - A.x, dz = B.z - A.z;
    const denom = Math.hypot(dx, dz) || 1;
    let maxD = 0, maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const P = points[i];
      const d = Math.abs((dz * P.x - dx * P.z + B.x * A.z - B.z * A.x) / denom);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > tol && maxI > 0) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

const __VtcLiveMapLogic = {
  nearestCity,
  headingToCompass,
  computeEta,
  formatEta,
  normalizeGameName,
  matchesFilter,
  fieldsVisibleTo,
  simplifyTrack,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = __VtcLiveMapLogic;
}
if (typeof window !== 'undefined') {
  window.VtcLiveMapLogic = __VtcLiveMapLogic;
}
