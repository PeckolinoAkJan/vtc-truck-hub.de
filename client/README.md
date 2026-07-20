# VTC Telemetry Client

Externer Node/Bun-Client, der ein Beispiel-Event an den Telemetrie-Endpoint der VTC-Plattform schickt.

## Endpoint

`POST /api/public/telemetry/ingest`

Auth: `Authorization: Bearer <VTC_API_KEY>` — den API-Key findest du in den VTC-Settings (Owner/Admin).

## Verwendung

```bash
API_KEY="<dein_vtc_api_key>" \
API_URL="https://virtual-fleet-forge.lovable.app" \
DRIVER_STEAM_ID="76561198000000000" \
bun run client/send-event.ts
```

Alternativ mit Node 18+:

```bash
node --experimental-strip-types client/send-event.ts
```

## Env-Variablen

| Variable          | Pflicht | Beschreibung                                                  |
| ----------------- | ------- | ------------------------------------------------------------- |
| `API_KEY`         | ja      | VTC API-Key aus den Settings                                  |
| `API_URL`         | nein    | Basis-URL (Default: `http://localhost:8080`)                  |
| `DRIVER_STEAM_ID` | \*      | Steam-ID des Fahrers (aus dem Profil)                         |
| `DRIVER_USER_ID`  | \*      | Alternativ: interne User-UUID                                 |

\* Mindestens eine der beiden Driver-Optionen ist erforderlich.

## Event-Payload

Das Script sendet ein `job_delivered`-Event mit Beispiel-Ladung (Berlin → Hamburg, Electronics). Wenn der Fahrer aufgelöst werden kann, wird zusätzlich ein Job-Datensatz angelegt. Payload-Felder anpassen: `event.payload` in `send-event.ts`.
