/**
 * VTC Hub · Live-Karte Stufe 2 – Shared Logic
 * -------------------------------------------------------------------
 * Reine, seiten-agnostische Funktionen für:
 *  - Nächstgelegene Stadt / Land / Entfernung
 *  - Kompasspunkt aus Heading
 *  - ETA-Berechnung mit Konservativitäts-Guard
 *  - Filter-Prädikate
 *  - Rollen-Sichtbarkeitsmaske
 *
 * KEIN DOM-, KEIN LEAFLET-, KEIN SUPABASE-IMPORT!
 * Web (React) und Desktop-Client (Vanilla) importieren beides
 * synchron – die Desktop-Portierung liegt in
 * `desktop-client/renderer/live-map-logic.js` und spiegelt diese
 * Funktionen 1:1 (mit Tests).
 */

export type GameKey = "ETS2" | "ATS";

export interface CityPoint {
  name: string;
  country: string | null;
  x: number;
  z: number;
}

export interface NearestCityResult {
  name: string;
  country: string | null;
  distanceKm: number;
}

/**
 * Faustformel: 1 Karten-Einheit (SCS-Meter) ≈ 1 Meter Spielwelt.
 * Da SCS-Distanzen ohnehin nicht 1:1 realen Straßen entsprechen,
 * teilen wir durch 1000 für eine sinnvolle Kilometer-Anzeige.
 */
export function nearestCity(
  pos: { x: number; z: number } | null | undefined,
  cities: readonly CityPoint[],
): NearestCityResult | null {
  if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null;
  if (!cities?.length) return null;
  let best: CityPoint | null = null;
  let bestSq = Infinity;
  for (const c of cities) {
    const dx = c.x - pos.x;
    const dz = c.z - pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestSq) {
      bestSq = d2;
      best = c;
    }
  }
  if (!best) return null;
  return {
    name: best.name,
    country: best.country,
    distanceKm: Math.round((Math.sqrt(bestSq) / 1000) * 10) / 10,
  };
}

const COMPASS = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"] as const;
export function headingToCompass(heading: number | null | undefined): string | null {
  if (heading == null || !Number.isFinite(heading)) return null;
  // Telemetrie liefert 0..1 (SCS-Fraction). Wir akzeptieren beides.
  let deg = heading;
  if (deg <= 1 && deg >= -1) deg = deg * 360;
  deg = ((deg % 360) + 360) % 360;
  const idx = Math.round(deg / 45) % 8;
  return COMPASS[idx];
}

export interface EtaInput {
  /** Reststrecke in km */
  remainingKm: number | null | undefined;
  /** Aktuelle Geschwindigkeit in km/h */
  speedKmh: number | null | undefined;
  /** Durchschnittsgeschwindigkeit in km/h (optional, wenn vorhanden bevorzugt) */
  avgKmh?: number | null;
  /** Ist der Fahrer gerade in Pause? */
  paused?: boolean;
}
export interface EtaResult {
  arrivalIso: string;
  minutes: number;
  method: "current-speed" | "avg-speed";
}

/**
 * Berechnet eine ETA **nur**, wenn ausreichende Daten vorliegen.
 * - Reststrecke muss > 0 sein
 * - Effektive Geschwindigkeit muss > 15 km/h sein (sonst zu unsicher)
 * - Bei Pause: keine ETA
 * Gibt `null` zurück, wenn nicht genug Sicherheit besteht.
 */
export function computeEta(input: EtaInput, now: Date = new Date()): EtaResult | null {
  const { remainingKm, speedKmh, avgKmh, paused } = input;
  if (paused) return null;
  if (remainingKm == null || !Number.isFinite(remainingKm) || remainingKm <= 0) return null;
  const cur = Number(speedKmh ?? 0);
  const avg = Number(avgKmh ?? 0);
  let ref = 0;
  let method: EtaResult["method"] = "current-speed";
  if (avg > 20) {
    ref = avg;
    method = "avg-speed";
  } else if (cur > 15) {
    ref = cur;
    method = "current-speed";
  } else {
    return null;
  }
  const minutes = Math.max(1, Math.round((remainingKm / ref) * 60));
  const arrival = new Date(now.getTime() + minutes * 60_000);
  return { arrivalIso: arrival.toISOString(), minutes, method };
}

export function formatEta(eta: EtaResult | null): string | null {
  if (!eta) return null;
  const d = new Date(eta.arrivalIso);
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `Geschätzte Ankunft: ${t} Uhr`;
}

// ─── Filter-Prädikate ──────────────────────────────────────────────

export interface DriverFilterState {
  search: string;
  onlyOnline: boolean;
  game: "all" | GameKey;
  jobState: "all" | "with-job" | "no-job";
}

export interface FilterableDriver {
  displayName: string;
  game: string;
  status: string; // "driving" | "idle" | "offline" ...
  job: unknown | null;
}

export function matchesFilter(d: FilterableDriver, f: DriverFilterState): boolean {
  if (f.onlyOnline && d.status === "offline") return false;
  if (f.game !== "all") {
    const g = normalizeGameName(d.game);
    if (g !== f.game) return false;
  }
  if (f.jobState === "with-job" && !d.job) return false;
  if (f.jobState === "no-job" && d.job) return false;
  const q = f.search.trim().toLowerCase();
  if (q && !d.displayName.toLowerCase().includes(q)) return false;
  return true;
}

export function normalizeGameName(g: string | null | undefined): GameKey {
  const v = String(g ?? "").toUpperCase();
  return v === "ATS" ? "ATS" : "ETS2";
}

// ─── Rollen-Sichtbarkeitsmaske ─────────────────────────────────────

export type MemberRole = "owner" | "admin" | "dispatcher" | "driver" | null;

/**
 * Serverseitig muss zusätzlich RLS greifen; diese Funktion beschreibt
 * die *fachliche* Sichtbarkeit für die UI und wird spiegelbildlich
 * im Server-Handler eingesetzt.
 */
export function fieldsVisibleTo(role: MemberRole, isSelf: boolean): {
  telemetry: boolean;
  jobDetails: boolean;
  vehicleDetails: boolean;
  contact: boolean;
} {
  if (isSelf) return { telemetry: true, jobDetails: true, vehicleDetails: true, contact: true };
  if (role === "owner" || role === "admin" || role === "dispatcher")
    return { telemetry: true, jobDetails: true, vehicleDetails: true, contact: true };
  if (role === "driver")
    return { telemetry: true, jobDetails: false, vehicleDetails: true, contact: false };
  return { telemetry: false, jobDetails: false, vehicleDetails: false, contact: false };
}

// ─── Track (gefahrene Strecke) ─────────────────────────────────────

export interface TrackPoint {
  x: number;
  z: number;
  t: number; // epoch ms
}

/**
 * Douglas-Peucker light: entfernt Punkte, die weniger als `tolerance`
 * (Karten-Einheiten) von der Verbindungslinie ihrer Nachbarn abweichen.
 * Nicht optimal, aber genug für Track-Reduktion clientseitig.
 */
export function simplifyTrack(points: readonly TrackPoint[], tolerance = 25): TrackPoint[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b - a < 2) continue;
    const A = points[a],
      B = points[b];
    const dx = B.x - A.x,
      dz = B.z - A.z;
    const denom = Math.hypot(dx, dz) || 1;
    let maxD = 0,
      maxI = -1;
    for (let i = a + 1; i < b; i++) {
      const P = points[i];
      const d = Math.abs((dz * P.x - dx * P.z + B.x * A.z - B.z * A.x) / denom);
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > tolerance && maxI > 0) {
      keep[maxI] = true;
      stack.push([a, maxI], [maxI, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
