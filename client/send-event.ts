#!/usr/bin/env bun
/**
 * External telemetry client (Node.js / Bun) for the VTC platform.
 *
 * Sends a single example `job_delivered` event to the ingest endpoint.
 *
 * Usage:
 *   API_KEY=<your_vtc_api_key> \
 *   API_URL=https://virtual-fleet-forge.lovable.app \
 *   DRIVER_STEAM_ID=76561198000000000 \
 *   bun run client/send-event.ts
 *
 * Or with Node 18+:
 *   node --experimental-strip-types client/send-event.ts
 */

const API_URL = process.env.API_URL ?? "http://localhost:8080";
const API_KEY = process.env.API_KEY;
const DRIVER_STEAM_ID = process.env.DRIVER_STEAM_ID;
const DRIVER_USER_ID = process.env.DRIVER_USER_ID;

if (!API_KEY) {
  console.error("Missing API_KEY env var (VTC API key from Settings page).");
  process.exit(1);
}
if (!DRIVER_STEAM_ID && !DRIVER_USER_ID) {
  console.error("Set DRIVER_STEAM_ID or DRIVER_USER_ID so the driver can be resolved.");
  process.exit(1);
}

const event = {
  driver_steam_id: DRIVER_STEAM_ID,
  driver_user_id: DRIVER_USER_ID,
  event_type: "job_delivered",
  payload: {
    source_city: "Berlin",
    dest_city: "Hamburg",
    cargo: "Electronics",
    distance_km: 289,
    revenue: 4200,
    fuel_cost: 380,
    damage_pct: 0.5,
    game: "ets2" as const,
    truck: "Scania S 730",
  },
};

const endpoint = `${API_URL.replace(/\/$/, "")}/api/public/telemetry/ingest`;
console.log(`POST ${endpoint}`);

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${API_KEY}`,
  },
  body: JSON.stringify(event),
});

const text = await res.text();
console.log(`Status: ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 1);
