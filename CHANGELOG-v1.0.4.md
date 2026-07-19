# VTC HUB v1.0.4

## Neu
- **Live-Karte Stufe 2**: Detail-Panel je Fahrer (Speed, Tank, Schaden, Fracht, Route, Kompass), ETA-Berechnung, POI-Layer (Tank, Werkstatt, Fähre, Rast) und Track-Anzeige auf Wunsch.
- **Erweiterte Filter**: Suche, Nur-Online, ETS2/ATS/Alle, Job-Status (fahrend / stehend / kein Auftrag).
- **Städte-Erkennung**: Nächstgelegene Stadt automatisch aus Koordinaten – auch ohne SDK-Ereignis.
- **Desktop-Popups aufgewertet**: Zeigen jetzt Kompassrichtung, Restkilometer, ETA, Tankfüllung und Schaden.

## Verbesserungen
- Gemeinsame `live-map-logic`-Bibliothek für Web & Desktop – identisches Verhalten, 14 zusätzliche Unit-Tests.
- Kompaktere Fehlermeldungen aus Server-Funktionen (Request-ID statt Postgres-Rohtext).
- Präzisere Rollen-Hierarchie im Mitgliederschutz.
- Tile-Fallback der Live-Karte greift jetzt zuverlässig auch bei kurzen Netzstörungen.

## Sicherheitsverbesserungen
- Owner-Schutz gegen Degradierung durch Admins (Server + DB-Trigger).
- Sensible Schlüssel (`client_key`, `api_key`) in getrennte Secret-Tabellen mit ausschließlichem `service_role`-Zugriff verschoben.
- Öffentliche API mit neutralisierten Fehler-Antworten (kein DB-Leck).
- Storage-Policy `vehicle-media` prüft jetzt Pfad-Ownership.
- Realtime-Broadcast-Kanal für `messages` deaktiviert.

## Fehlerbehebungen
- Duplizierte Fahrten (Smart Resume) durch Signatur-Check final unterbunden.
- Ghost-Jobs unter 1 km werden serverseitig verworfen.
- Kartenzoom springt beim ersten Fahrer nicht mehr auf Welt-Ansicht zurück.
- Fahrzeugliste im Fuhrpark aktualisiert sich nach Telemetrie-Ingest ohne Reload.

---
**Version**: 1.0.4 · **Datum**: 2026-07-18
