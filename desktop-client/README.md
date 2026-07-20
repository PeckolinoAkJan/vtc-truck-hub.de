# VTC Fleet Forge Desktop Client

Electron desktop app for sending telemetry events to VTC Fleet Forge.

## Features

- Manual `job_delivered` form
- Auto-polling of a local `ets2-telemetry-server` on `http://localhost:25555`
- Connection test against the ingest endpoint
- Local event history (last 200 events)
- Settings persist in localStorage

## Run in development

```bash
cd desktop-client
npm install --save-dev electron
npm start
```

## Build Windows .zip

```bash
cd desktop-client
npm install --save-dev electron @electron/packager
npx @electron/packager . "VTC Fleet Forge Client" \
  --platform=win32 --arch=x64 \
  --out=release --overwrite \
  --ignore='^/release'
```

The output folder `release/VTC Fleet Forge Client-win32-x64/` contains
`VTC Fleet Forge Client.exe`. Zip it up and distribute.

## Configuration (in the app → Settings tab)

- **API base URL** — e.g. `https://virtual-fleet-forge.lovable.app`
- **VTC API key** — issued in the VTC settings page
- **Driver Steam ID** *or* **Driver user ID**

The client sends `POST {API}/api/public/telemetry/ingest` with
`Authorization: Bearer <API_KEY>` and a JSON body:

```json
{
  "type": "job_delivered",
  "occurred_at": "2026-07-15T19:00:00.000Z",
  "driver": { "steam_id": "76561198000000000" },
  "payload": {
    "source_city": "Berlin",
    "dest_city": "Hamburg",
    "cargo": "Electronics",
    "distance_km": 289,
    "revenue": 4200,
    "fuel_cost": 380,
    "game": "ets2"
  }
}
```
