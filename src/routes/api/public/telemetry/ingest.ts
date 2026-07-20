import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicError, logInternalError, newRequestId } from "@/lib/public-api-errors";

const eventSchema = z.object({
  driver_steam_id: z.string().optional(),
  driver_user_id: z.string().uuid().optional(),
  event_type: z.string().min(1).max(64),
  job_id: z.string().uuid().optional(),
  payload: z
    .object({
      event_id: z.string().max(64).optional(),
      source_city: z.string().max(80).optional(),
      dest_city: z.string().max(80).optional(),
      cargo: z.string().max(80).optional(),
      cargo_mass_kg: z.number().min(0).max(100000).optional(),
      distance_km: z.number().min(0).max(100000).optional(),
      odometer_km: z.number().min(0).max(10_000_000).optional(),
      revenue: z.number().min(0).max(10_000_000).optional(),
      fuel_cost: z.number().min(0).max(10_000_000).optional(),
      damage_pct: z.number().min(0).max(100).optional(),
      game: z.enum(["ets2", "ats", "other"]).optional(),
      truck: z.string().max(80).optional(),
      truck_brand: z.string().max(80).optional(),
      truck_model: z.string().max(80).optional(),
      truck_plate: z.string().max(32).optional(),
    })
    .catchall(z.unknown())
    .default({}),
});

export const Route = createFileRoute("/api/public/telemetry/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        try {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return publicError("unauthorized", { requestId });
        }
        const apiKey = authHeader.slice(7).trim();
        if (!/^[a-f0-9]{16,128}$/i.test(apiKey)) {
          return publicError("unauthorized", { requestId });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch (err) {
          logInternalError(requestId, "/api/public/telemetry/ingest", "POST", err, {
            stage: "parse_json",
          });
          return publicError("bad_request", { requestId });
        }
        const parsed = eventSchema.safeParse(body);
        if (!parsed.success) {
          logInternalError(
            requestId,
            "/api/public/telemetry/ingest",
            "POST",
            new Error("zod_validation_failed"),
            { zod: parsed.error.flatten() },
          );
          return publicError("bad_request", { requestId });
        }
        const event = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Verify api key -> vtc
        const { data: vtcRow, error: vtcErr } = await supabaseAdmin
          .from("vtc_secrets")
          .select("vtc_id")
          .eq("api_key", apiKey)
          .maybeSingle();
        const vtc = vtcRow ? { id: vtcRow.vtc_id } : null;
        if (vtcErr) {
          logInternalError(requestId, "/api/public/telemetry/ingest", "POST", vtcErr, {
            stage: "vtc_lookup",
          });
        }
        if (vtcErr || !vtc) {
          return publicError("unauthorized", { requestId });
        }

        // Resolve driver
        let driverId: string | null = event.driver_user_id ?? null;
        if (!driverId && event.driver_steam_id) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("steam_id", event.driver_steam_id)
            .maybeSingle();
          driverId = prof?.user_id ?? null;
        }

        // Verify resolved driver is a member of the caller's VTC.
        // Prevents an api_key holder from attributing jobs/telemetry to
        // arbitrary users outside their own VTC.
        if (driverId) {
          const { data: membership } = await supabaseAdmin
            .from("vtc_members")
            .select("user_id")
            .eq("vtc_id", vtc.id)
            .eq("user_id", driverId)
            .maybeSingle();
          if (!membership) {
            driverId = null;
          }
        }

        // Auto-upsert vehicle for the fleet view.
        // Uses (vtc_id, plate) when a plate is provided, otherwise falls back to (vtc_id, name).
        if (driverId) {
          const p = event.payload;
          const plate = typeof p.truck_plate === "string" ? p.truck_plate.trim() : null;
          const brand = typeof p.truck_brand === "string" ? p.truck_brand.trim() : null;
          const model = typeof p.truck_model === "string" ? p.truck_model.trim() : null;
          const truckName = typeof p.truck === "string" ? p.truck.trim() : null;
          const name = [brand, model].filter(Boolean).join(" ") || truckName || plate || null;
          if (name || plate) {
            const status = event.event_type === "job_delivered" ? "idle" : "driving";
            // Try to find by plate first, else by name (case-insensitive)
            let existingId: string | null = null;
            if (plate) {
              const { data: byPlate } = await supabaseAdmin
                .from("vehicles")
                .select("id")
                .eq("vtc_id", vtc.id)
                .eq("plate", plate)
                .maybeSingle();
              existingId = byPlate?.id ?? null;
            }
            if (!existingId && name) {
              const { data: byName } = await supabaseAdmin
                .from("vehicles")
                .select("id")
                .eq("vtc_id", vtc.id)
                .ilike("name", name)
                .is("plate", null)
                .maybeSingle();
              existingId = byName?.id ?? null;
            }
            if (existingId) {
              await supabaseAdmin
                .from("vehicles")
                .update({
                  current_driver_id: driverId,
                  last_seen_at: new Date().toISOString(),
                  status,
                  ...(brand ? { brand } : {}),
                  ...(model ? { model } : {}),
                  ...(plate ? { plate } : {}),
                  ...(name ? { name } : {}),
                })
                .eq("id", existingId);
            } else {
              await supabaseAdmin.from("vehicles").insert({
                vtc_id: vtc.id,
                name: name ?? plate ?? "LKW",
                brand,
                model,
                plate,
                current_driver_id: driverId,
                last_seen_at: new Date().toISOString(),
                status,
              });
            }
          }
        }

        // Idempotency: if the client supplied an event_id we've already seen,
        // return the previously-persisted job_id without re-applying side effects.
        const eventId = typeof (event.payload as Record<string, unknown>).event_id === "string"
          ? ((event.payload as Record<string, string>).event_id as string)
          : null;
        if (eventId) {
          const { data: prior } = await supabaseAdmin
            .from("telemetry_events")
            .select("id, job_id")
            .eq("vtc_id", vtc.id)
            .eq("event_type", event.event_type)
            .contains("payload", { event_id: eventId })
            .limit(1)
            .maybeSingle();
          if (prior) {
            return new Response(
              JSON.stringify({ ok: true, job_id: prior.job_id ?? null, duplicate: true }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
        }

        // Job lifecycle: start / deliver / cancel
        let jobId: string | null = event.job_id ?? null;
        const p = event.payload;

        if (event.event_type === "job_started" && driverId && p.source_city) {
          const srcCity = p.source_city;
          const dstCity = p.dest_city ?? "?";
          const cargoName = p.cargo ?? "?";

          // Hinweis: Der frühere Ghost-Round-Trip-Filter (Start==Ziel & <5 km)
          // wurde entfernt – innerstädtische Kurztouren (z. B. Skopje → Skopje,
          // 3 km) sind in ETS2/ATS regulär möglich. Der 5-Minuten-Dedup unten
          // reicht als Spam-Schutz aus.

          // Smart Resume: statt einer Zeitfenster-Regel prüfen wir, ob der
          // Fahrer bereits einen offenen Auftrag (status = 'in_progress') mit
          // identischer Signatur (Fracht + Start + Ziel) hat. Falls ja, wird
          // dieser IMMER fortgesetzt – egal wie viel Zeit vergangen ist
          // (Pause, PC-Neustart, Spielabsturz etc.). Gilt identisch für alle
          // Rollen (Owner/Admin/Dispatcher/Driver), da der Server mit
          // Service-Role arbeitet und RLS hier nicht greift.
          const { data: recentJob } = await supabaseAdmin
            .from("jobs")
            .select("id, status, distance_km, odometer_start_km, odometer_end_km")
            .eq("vtc_id", vtc.id)
            .eq("driver_id", driverId)
            .eq("status", "in_progress")
            .eq("source_city", srcCity)
            .eq("dest_city", dstCity)
            .eq("cargo", cargoName)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (recentJob) {
            jobId = recentJob.id;
            const updatePatch: {
              distance_km?: number;
              revenue?: number;
              fuel_cost?: number;
              damage_pct?: number;
              truck?: string;
              cargo_mass_kg?: number;
              odometer_start_km?: number;
              odometer_end_km?: number;
            } = {};

            // Odometer: Start-Kilometerstand nur setzen, wenn noch nicht
            // vorhanden. End-Kilometerstand nur monoton nach oben aktualisieren
            // (verhindert Rücksprünge durch Save-Load-Glitches).
            let odometerDistance: number | null = null;
            if (typeof p.odometer_km === "number" && p.odometer_km > 0) {
              if (recentJob.odometer_start_km == null) {
                updatePatch.odometer_start_km = p.odometer_km;
              }
              if (
                recentJob.odometer_end_km == null ||
                p.odometer_km >= Number(recentJob.odometer_end_km)
              ) {
                updatePatch.odometer_end_km = p.odometer_km;
              }
              if (recentJob.odometer_start_km != null) {
                const delta = p.odometer_km - Number(recentJob.odometer_start_km);
                if (delta >= 0 && delta <= 5000) odometerDistance = delta;
              }
            }

            // Distance-Sanity: bereits gespeicherte, plausible distance_km wird
            // NICHT durch plötzlich extrem abweichende Werte überschrieben
            // (ETS2-Save-Load-Bug meldet manchmal 700+ km bei Stadt-Tour).
            // Regel: neuer Wert wird nur übernommen, wenn er entweder
            //  a) höher als der alte ist (monoton wachsende Fahrstrecke), UND
            //  b) nicht mehr als das 3-fache + 50 km über dem alten liegt.
            if (odometerDistance != null) {
              updatePatch.distance_km = odometerDistance;
            } else if (typeof p.distance_km === "number") {
              const oldDist = Number(recentJob.distance_km ?? 0);
              const newDist = p.distance_km;
              const glitchCap = Math.max(oldDist * 3, oldDist + 50);
              if (newDist >= oldDist && newDist <= glitchCap) {
                updatePatch.distance_km = newDist;
              }
              // sonst: alten Wert behalten (Glitch ignoriert)
            }

            if (typeof p.revenue === "number") updatePatch.revenue = p.revenue;
            if (typeof p.fuel_cost === "number") updatePatch.fuel_cost = p.fuel_cost;
            if (typeof p.damage_pct === "number") updatePatch.damage_pct = p.damage_pct;
            if (p.truck) updatePatch.truck = p.truck;
            if (typeof p.cargo_mass_kg === "number" && p.cargo_mass_kg > 0) {
              updatePatch.cargo_mass_kg = p.cargo_mass_kg;
            }
            if (Object.keys(updatePatch).length > 0) {
              await supabaseAdmin.from("jobs").update(updatePatch).eq("id", jobId);
            }
          } else if (!jobId) {
            // Auto-Cancel: Fahrer hat einen offenen Auftrag mit ANDERER
            // Signatur → er wurde im Spiel offenbar abgebrochen. Wir setzen
            // alle solchen Alt-Aufträge auf 'cancelled', bevor ein neuer
            // angelegt wird. Gilt identisch für alle Rollen.
            await supabaseAdmin
              .from("jobs")
              .update({
                status: "cancelled",
                finished_at: new Date().toISOString(),
                review_note: "auto-cancelled: neuer Auftrag mit anderer Signatur gestartet",
              })
              .eq("vtc_id", vtc.id)
              .eq("driver_id", driverId)
              .eq("status", "in_progress");

            const odoStart =
              typeof p.odometer_km === "number" && p.odometer_km > 0 ? p.odometer_km : null;
            const { data: created } = await supabaseAdmin
              .from("jobs")
              .insert({
                vtc_id: vtc.id,
                driver_id: driverId,
                status: "in_progress",
                source_city: srcCity,
                dest_city: dstCity,
                cargo: cargoName,
                cargo_mass_kg: p.cargo_mass_kg ?? null,
                distance_km: p.distance_km ?? 0,
                revenue: p.revenue ?? 0,
                fuel_cost: p.fuel_cost ?? 0,
                damage_pct: p.damage_pct ?? 0,
                game: p.game ?? "ets2",
                truck: p.truck ?? null,
                started_at: new Date().toISOString(),
                odometer_start_km: odoStart,
                odometer_end_km: odoStart,
              })
              .select("id")
              .single();
            if (created) jobId = created.id;
          }
        } else if (
          (event.event_type === "job_cancelled" || event.event_type === "job_aborted") &&
          driverId
        ) {
          const note =
            typeof (event.payload as Record<string, unknown>).reason === "string"
              ? `auto-cancelled: ${(event.payload as Record<string, string>).reason}`
              : "auto-cancelled: Auftrag im Spiel abgebrochen";
          const cancelPatch = {
            status: "cancelled" as const,
            finished_at: new Date().toISOString(),
            review_note: note,
          };
          if (jobId) {
            await supabaseAdmin.from("jobs").update(cancelPatch).eq("id", jobId);
          } else {
            const { data: active } = await supabaseAdmin
              .from("jobs")
              .select("id")
              .eq("vtc_id", vtc.id)
              .eq("driver_id", driverId)
              .eq("status", "in_progress")
              .order("started_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (active) {
              await supabaseAdmin.from("jobs").update(cancelPatch).eq("id", active.id);
              jobId = active.id;
            }
          }
        } else if (
          (event.event_type === "job_delivered" ||
            event.event_type === "job_finished" ||
            event.event_type === "job_submitted") &&
          driverId
        ) {
          // Anti-Ghost-Job: 0-km Abgabe-Events (Glitch beim Abkuppeln) verwerfen.
          // Wir geben trotzdem 200 OK zurück, damit der Client die Queue leert.
          const dist = typeof p.distance_km === "number" ? p.distance_km : null;
          if (dist !== null && dist < 2) {
            return new Response(
              JSON.stringify({ ok: true, dropped: "zero_km_ghost_job" }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
        }
        if (
          (event.event_type === "job_delivered" ||
            event.event_type === "job_finished" ||
            event.event_type === "job_submitted") &&
          driverId
        ) {
          const patch: {
            status: "submitted";
            finished_at: string;
            source_city?: string;
            dest_city?: string;
            cargo?: string;
            distance_km?: number;
            revenue?: number;
            fuel_cost?: number;
            damage_pct?: number;
            game?: "ets2" | "ats" | "other";
            truck?: string;
            cargo_mass_kg?: number;
            odometer_end_km?: number;
          } = {
            status: "submitted",
            finished_at: new Date().toISOString(),
          };
          if (p.source_city) patch.source_city = p.source_city;
          if (p.dest_city) patch.dest_city = p.dest_city;
          if (p.cargo) patch.cargo = p.cargo;
          if (typeof p.revenue === "number") patch.revenue = p.revenue;
          if (typeof p.fuel_cost === "number") patch.fuel_cost = p.fuel_cost;
          if (typeof p.damage_pct === "number") patch.damage_pct = p.damage_pct;
          if (p.game) patch.game = p.game;
          if (p.truck) patch.truck = p.truck;
          if (typeof p.cargo_mass_kg === "number" && p.cargo_mass_kg > 0) {
            patch.cargo_mass_kg = p.cargo_mass_kg;
          }
          if (typeof p.odometer_km === "number" && p.odometer_km > 0) {
            patch.odometer_end_km = p.odometer_km;
          }

          // Finale Distanz-Berechnung: bevorzugt aus echter Odometer-Differenz
          // (LKW-Kilometerstand Ende − Start). Fallback: bisheriger gespeicherter
          // Wert, dann höchstes bekanntes distance_km/odometer_km aus der
          // Telemetrie-Historie. Wir speichern NIEMALS 0/1 km, wenn zuvor
          // plausible Werte gemeldet wurden.
          const resolveFinalDistance = async (
            existing: {
              distance_km: number | null;
              odometer_start_km: number | null;
              odometer_end_km: number | null;
            },
            currentJobId: string | null,
          ): Promise<number | undefined> => {
            const odoStart = existing.odometer_start_km != null ? Number(existing.odometer_start_km) : null;
            const incomingOdoEnd =
              typeof p.odometer_km === "number" && p.odometer_km > 0 ? p.odometer_km : null;
            let odoEnd = incomingOdoEnd ?? (existing.odometer_end_km != null ? Number(existing.odometer_end_km) : null);
            const oldDist = existing.distance_km != null ? Number(existing.distance_km) : 0;
            const incomingDist = typeof p.distance_km === "number" ? p.distance_km : null;

            // Fallback: aus telemetry_events die höchsten historisch gemeldeten
            // odometer_km / distance_km ziehen (schützt vor 0/1-km-Glitch beim
            // Abkuppeln).
            let histMaxOdo: number | null = null;
            let histMaxDist: number | null = null;
            if (currentJobId) {
              const { data: hist } = await supabaseAdmin
                .from("telemetry_events")
                .select("payload")
                .eq("job_id", currentJobId)
                .limit(500);
              if (Array.isArray(hist)) {
                for (const row of hist) {
                  const pl = (row as { payload?: Record<string, unknown> }).payload ?? {};
                  const o = typeof pl.odometer_km === "number" ? pl.odometer_km : null;
                  const d = typeof pl.distance_km === "number" ? pl.distance_km : null;
                  if (o != null && o > 0 && (histMaxOdo == null || o > histMaxOdo)) histMaxOdo = o;
                  if (d != null && d > 0 && (histMaxDist == null || d > histMaxDist)) histMaxDist = d;
                }
              }
            }
            if (histMaxOdo != null && (odoEnd == null || histMaxOdo > odoEnd)) odoEnd = histMaxOdo;

            // 1) Echte Odometer-Differenz
            if (odoStart != null && odoEnd != null && odoEnd > odoStart) {
              const diff = odoEnd - odoStart;
              if (diff > 0 && diff <= 5000) return diff;
            }

            // Kandidaten sammeln, den höchsten plausiblen Wert nehmen.
            const candidates: number[] = [];
            if (oldDist > 0) candidates.push(oldDist);
            if (histMaxDist != null) candidates.push(histMaxDist);
            if (incomingDist != null && incomingDist >= 2) {
              const glitchCap = Math.max(oldDist * 3, oldDist + 50, 50);
              if (incomingDist <= glitchCap || oldDist === 0) candidates.push(incomingDist);
            }
            if (candidates.length > 0) {
              const best = Math.max(...candidates);
              if (best >= 2) return best;
            }
            // Nichts Plausibles: bestehenden Wert nicht überschreiben.
            return undefined;
          };

          if (jobId) {
            const { data: existing } = await supabaseAdmin
              .from("jobs")
              .select("distance_km, odometer_start_km, odometer_end_km")
              .eq("id", jobId)
              .maybeSingle();
            const finalDist = await resolveFinalDistance(
              existing ?? { distance_km: null, odometer_start_km: null, odometer_end_km: null },
              jobId,
            );
            if (typeof finalDist === "number") patch.distance_km = finalDist;
            await supabaseAdmin.from("jobs").update(patch).eq("id", jobId);
          } else {
            const { data: active } = await supabaseAdmin
              .from("jobs")
              .select("id, distance_km, odometer_start_km, odometer_end_km")
              .eq("vtc_id", vtc.id)
              .eq("driver_id", driverId)
              .eq("status", "in_progress")
              .order("started_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (active) {
              const finalDist = await resolveFinalDistance(active, active.id);
              if (typeof finalDist === "number") patch.distance_km = finalDist;
              await supabaseAdmin.from("jobs").update(patch).eq("id", active.id);
              jobId = active.id;
            } else if (p.source_city) {
              // Fallback ohne Vorgeschichte: nur den eingehenden distance_km nutzen.
              const { data: created } = await supabaseAdmin
                .from("jobs")
                .insert({
                  vtc_id: vtc.id,
                  driver_id: driverId,
                  status: "submitted",
                  source_city: p.source_city ?? "?",
                  dest_city: p.dest_city ?? "?",
                  cargo: p.cargo ?? "?",
                  cargo_mass_kg: p.cargo_mass_kg ?? null,
                  distance_km: p.distance_km ?? 0,
                  revenue: p.revenue ?? 0,
                  fuel_cost: p.fuel_cost ?? 0,
                  damage_pct: p.damage_pct ?? 0,
                  game: p.game ?? "ets2",
                  truck: p.truck ?? null,
                  finished_at: new Date().toISOString(),
                  odometer_end_km:
                    typeof p.odometer_km === "number" && p.odometer_km > 0 ? p.odometer_km : null,
                })
                .select("id")
                .single();
              if (created) jobId = created.id;
            }
          }

        }

        // Fortschrittsereignisse dürfen das Gewicht auch dann nachtragen,
        // wenn der Auftrag durch einen kurzen Telemetrie-Aussetzer bereits
        // irrtümlich als eingereicht markiert wurde.
        if (
          jobId &&
          driverId &&
          typeof p.cargo_mass_kg === "number" &&
          p.cargo_mass_kg > 0
        ) {
          await supabaseAdmin
            .from("jobs")
            .update({ cargo_mass_kg: p.cargo_mass_kg })
            .eq("id", jobId)
            .eq("vtc_id", vtc.id)
            .eq("driver_id", driverId);
        }

        const { error: teErr } = await supabaseAdmin.from("telemetry_events").insert({
          vtc_id: vtc.id,
          job_id: jobId,
          driver_id: driverId,
          event_type: event.event_type,
          payload: event.payload as Record<string, unknown> as never,
        });
        if (teErr) {
          // Nur Log-Eintrag konnte nicht geschrieben werden – Job-Update war
          // aber erfolgreich. Wir antworten mit 200, damit der Client das Event
          // aus seiner Warteschlange entfernt und nicht in eine Retry-Schleife läuft.
          return new Response(
            JSON.stringify({ ok: true, job_id: jobId, warning: "telemetry log skipped" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(
          JSON.stringify({ ok: true, job_id: jobId }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
        } catch (err) {
          logInternalError(requestId, "/api/public/telemetry/ingest", "POST", err, {
            stage: "unhandled",
          });
          return publicError("server_error", { requestId });
        }
      },
    },
  },
});
