# Live-Karte Stufe 2 – Plan

Umfangreiche Erweiterung der bestehenden Live-Karte in Web und Desktop-Client. Bestehende Stufe 1 (Tiles, Marker, CRS-Simple) bleibt unangetastet – erweitert wird nur additiv.

## 1. Datenmodell / Telemetrie-Erweiterung

**Neue Felder in `getLiveMap()` Response (server-seitig in `src/lib/telemetry.functions.ts`):**

Aus `telemetry_data` (bereits gespeichert) zusätzlich mappen:
- `heading` (Fahrtrichtung in °)
- `speed_kmh`, `cruise_control_kmh`
- `fuel_pct`, `engine_damage_pct`
- `truck_brand`, `truck_model`, `trailer_name`, `cargo_mass_t`
- `game` (ets2/ats)
- `nav_estimated_distance_km`, `nav_estimated_time_s` (Reststrecke + ETA aus Spieltelemetrie)
- `job_source_city`, `job_dest_city`, `job_source_company`, `job_dest_company`, `job_income`, `job_deadline_s`
- `session_started_at`, `last_seen_at`
- `x`, `z` (bereits vorhanden)

**Straße/Stadt/Region-Ermittlung (server):**
- Neue Hilfstabelle `game_cities` (id, game, name, country, x, z) mit statischem Seed für ETS2/ATS Hauptstädte (~150 Einträge) via Migration.
- Server-Funktion berechnet **nächstgelegene Stadt** + **Land/Region** + **Entfernung** per Euklid-Distanz auf CRS-Simple-Koordinaten.
- Straße: **nicht erfinden**. Wenn Telemetrie kein `road_name` liefert, Rückgabe `null` → UI zeigt "Straße nicht eindeutig erkannt".

**Rollen-basierte Feldsichtbarkeit (server):**
- Owner/Admin/Dispatcher: alle Felder.
- Driver: nur Grundinfos anderer Fahrer (Name, Stadt, Game, Online). Eigene Zeile: alle Felder.
- Nicht-Mitglied / anonym: leere Liste (bereits so).

## 2. Auftrags- und Routendaten

**Auftragsdaten:** direkt aus dem laufenden `jobs`-Row (status='in_progress') gejoined an den Fahrer im `getLiveMap`-Handler.

**Route:**
- **Geplante Route:** nur wenn Telemetrie `navigation.waypoints` liefert (aktuell nicht in DB) → Feature **deaktiviert mit klarem UI-Hinweis "Geplante Route nicht verfügbar"**. Keine Erfindung.
- **Gefahrene Strecke (Track):** Neue Tabelle `driver_tracks(user_id, game, points jsonb, session_id, updated_at)` – Server speichert im `ingest`-Endpoint bei jeder Position einen Punkt (max. 500, Douglas-Peucker vereinfacht). Feature-Flag pro Fahrer (`profile_secrets` oder `profiles.share_track boolean`).
- Server-Funktion `getDriverTrack(userId)` liefert Track. Klar als "gefahrene Strecke" gelabelt.

## 3. Web-Frontend (`src/components/LiveMap.tsx`)

Erweitert um:
- **Fahrer-Detailpanel** (Drawer/Popover bei Klick): Avatar/Initialen, Rang, Truck, Trailer, Speed, Cruise, Fuel-Bar, Damage-Bar, Position, Job-Block, ETA.
- **Filter-Panel** (kollabierbar): Suche, Toggles (Online/ETS2/ATS/mit Auftrag/ohne Auftrag), Rang-Dropdown.
- **Route-Layer-Toggle**: Checkbox "Gefahrene Strecke anzeigen" pro Fahrer (im Detailpanel).
- **POI-Layer** (Stufe 2 minimal): Statische `game_pois`-Tabelle mit Kategorien (Tankstelle, Werkstatt, Garage, Rastplatz, Fährhafen, Zugterminal). Toggle-Buttons in Karten-Topbar. Marker-Clustering via `leaflet.markercluster`.
- **ETA-Anzeige:** aus Telemetrie `nav_estimated_time_s` → als "Geschätzte Ankunft: HH:MM Uhr" formatiert. Fallback: `Reststrecke / avg(speed)` wenn speed>10. Sonst gar keine ETA.

## 4. Desktop-Client (`desktop-client/renderer/live-map.js`)

**GESPERRT laut Nutzer? → Nein, Nutzer sagt "Web und Desktop" ist Pflicht.** Der Desktop-Client ist zwar für Telemetrie-Kernlogik gesperrt, aber die Live-Karte wurde in Stufe 1 explizit erweitert und der Nutzer verlangt Stufe 2 auch dort. Wir erweitern **nur `live-map.js` + zugehöriges CSS/HTML für das Karten-Widget**, ohne `renderer.js`, `preload.js`, `main.cjs`, Telemetrie-Polling anzufassen.

Gleiche fachliche Logik wie Web – als Vanilla-JS-Modul.

## 5. Performance

- Marker: `setLatLng` statt Neuerstellung (bereits so).
- Track-Polyline: nur bei Änderung neu setzen.
- Filter: `useMemo` mit 150ms Debounce auf Suche.
- POI-Clustering ab Zoom < 8.
- Polling: `document.visibilityState === 'hidden'` → pausieren (Web + Desktop).

## 6. Migrationen

```sql
-- game_cities (statischer Seed)
CREATE TABLE public.game_cities (id serial pk, game text, name text, country text, x real, z real);
GRANT SELECT ON public.game_cities TO anon, authenticated;
ALTER TABLE ... ENABLE RLS; CREATE POLICY "public read" ... USING (true);
INSERT INTO game_cities VALUES ... (~150 rows für ETS2 + ATS Hauptstädte);

-- game_pois
CREATE TABLE public.game_pois (id serial pk, game text, kind text, name text, x real, z real);
GRANT/RLS analog.

-- driver_tracks
CREATE TABLE public.driver_tracks (user_id uuid pk, game text, session_id uuid, points jsonb, updated_at timestamptz);
GRANT SELECT to authenticated; RLS: nur VTC-Mitglieder desselben VTC + eigener Track.

-- profiles.share_live_track boolean default true
ALTER TABLE profiles ADD COLUMN share_live_track boolean not null default true;
```

## 7. Tests

`desktop-client/tests/live-map-logic.test.cjs` erweitert:
- Nächste-Stadt-Zuordnung (mit/ohne Daten)
- ETA-Berechnung (mit/ohne Speed)
- Filter-Prädikate
- Rollen-Sichtbarkeitsmaske

## 8. Was NICHT gebaut wird (bewusst)

- **Geplante Route mit echten Wegpunkten** – Telemetrie liefert das nicht; UI signalisiert "nicht verfügbar", keine Fake-Route aus Positionshistorie.
- **Straßennamen aus OSM-Reverse-Geocoding** – ETS2/ATS-Karte ist kein OSM. Ohne Telemetrie-Straßenfeld: "Straße nicht eindeutig erkannt".
- **Long-term Heatmap** – explizit auf Stufe 3 verschoben.
- **Realistischer POI-Vollbestand** – Stufe 2 seedet nur eine überschaubare Startmenge (~50 POIs), Erweiterung später.

## Geänderte Dateien (voraussichtlich)

- `supabase/migrations/2026071907xxxx_livemap_stage2.sql` (neu)
- `src/lib/telemetry.functions.ts` (erweitert)
- `src/lib/live-map-logic.ts` (neu – Shared Logic)
- `src/components/LiveMap.tsx` (erweitert)
- `src/components/LiveMapDriverPanel.tsx` (neu)
- `src/components/LiveMapFilters.tsx` (neu)
- `src/routes/api/public/telemetry/livemap.ts` (Response-Shape erweitert)
- `desktop-client/renderer/live-map.js` (erweitert)
- `desktop-client/renderer/live-map-logic.js` (neu – Port der Shared Logic)
- `desktop-client/renderer/styles.css` (Panel/Filter-Styles)
- `desktop-client/tests/live-map-logic.test.cjs` (neu)

## Umfangshinweis

Das ist eine **große** Umsetzung (~15 Dateien, ~2000 Zeilen). Realistisch in einer Runde umsetzbar, aber ohne Zwischenschritte. Ich baue direkt durch, sofern der Plan passt.
