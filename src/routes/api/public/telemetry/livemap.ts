// Public map endpoint for Desktop Client.
// Reuses the same visibility rules as the internal getLiveMap server function,
// but authenticates via the VTC API key (Bearer) + driver identifier instead of
// a user session. Never leaks raw DB errors and never returns secrets.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicError, logInternalError, newRequestId } from "@/lib/public-api-errors";

const bodySchema = z.object({
  driver_steam_id: z.string().max(64).optional(),
  driver_user_id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/api/public/telemetry/livemap")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
          },
        }),
      POST: async ({ request }) => {
        const requestId = newRequestId();
        try {
          const auth = request.headers.get("authorization") ?? "";
          if (!auth.startsWith("Bearer ")) return publicError("unauthorized", { requestId });
          const apiKey = auth.slice(7).trim();
          if (!/^[a-f0-9]{16,128}$/i.test(apiKey))
            return publicError("unauthorized", { requestId });

          let body: unknown;
          try {
            body = await request.json();
          } catch (err) {
            logInternalError(requestId, "/api/public/telemetry/livemap", "POST", err, {
              stage: "parse_json",
            });
            return publicError("bad_request", { requestId });
          }
          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) return publicError("bad_request", { requestId });
          const f = parsed.data;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: vtcRow } = await supabaseAdmin
            .from("vtc_secrets")
            .select("vtc_id")
            .eq("api_key", apiKey)
            .maybeSingle();
          if (!vtcRow) return publicError("unauthorized", { requestId });
          const vtcId = vtcRow.vtc_id;

          let callerId: string | null = f.driver_user_id ?? null;
          if (!callerId && f.driver_steam_id) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("user_id")
              .eq("steam_id", f.driver_steam_id)
              .maybeSingle();
            callerId = prof?.user_id ?? null;
          }
          if (!callerId) return publicError("not_found", { requestId });

          const { data: membership } = await supabaseAdmin
            .from("vtc_members")
            .select("user_id")
            .eq("vtc_id", vtcId)
            .eq("user_id", callerId)
            .maybeSingle();
          if (!membership) return publicError("forbidden", { requestId });

          const cutoffOffline = new Date(Date.now() - 3 * 60_000).toISOString();
          const { data: rows, error } = await supabaseAdmin
            .from("telemetry_data")
            .select(
              "driver_id, vtc_id, status, speed_kmh, position_x, position_y, position_z, heading, truck_brand, truck_model, truck_plate, source_city, dest_city, game, cargo, cargo_mass_kg, job_distance_km, job_remaining_km, fuel, fuel_level, fuel_capacity, damage_pct, damage_engine, updated_at",
            )
            .eq("vtc_id", vtcId)
            .gte("updated_at", cutoffOffline);
          if (error) {
            logInternalError(requestId, "/api/public/telemetry/livemap", "POST", error, {
              stage: "telemetry_query",
            });
            return publicError("server_error", { requestId });
          }

          const ids = Array.from(new Set((rows ?? []).map((r) => r.driver_id)));
          let profiles: Record<
            string,
            { display_name: string | null; live_visibility: string }
          > = {};
          const activeJobs: Record<
            string,
            { source_city: string | null; dest_city: string | null; cargo: string | null; started_at: string | null }
          > = {};
          if (ids.length > 0) {
            const [{ data: profs }, { data: jobs }] = await Promise.all([
              supabaseAdmin
                .from("profiles")
                .select("user_id, display_name, live_visibility")
                .in("user_id", ids),
              supabaseAdmin
                .from("jobs")
                .select("driver_id, source_city, dest_city, cargo, started_at")
                .eq("vtc_id", vtcId)
                .in("driver_id", ids)
                .eq("status", "in_progress"),
            ]);
            profiles = Object.fromEntries(
              (profs ?? []).map((p) => [
                p.user_id,
                {
                  display_name: p.display_name,
                  live_visibility: (p.live_visibility as string) ?? "vtc",
                },
              ]),
            );
            for (const j of jobs ?? []) {
              activeJobs[j.driver_id] = {
                source_city: j.source_city,
                dest_city: j.dest_city,
                cargo: j.cargo,
                started_at: j.started_at,
              };
            }
          }

          const drivers = (rows ?? [])
            .filter((r) => {
              const vis = profiles[r.driver_id]?.live_visibility ?? "vtc";
              if (r.driver_id === callerId) return vis !== "hidden";
              return vis === "vtc" || vis === "public";
            })
            .map((r) => {
              const activeJob = activeJobs[r.driver_id] ?? null;
              const fuelPct =
                r.fuel_level != null && r.fuel_capacity != null && Number(r.fuel_capacity) > 0
                  ? Math.max(0, Math.min(1, Number(r.fuel_level) / Number(r.fuel_capacity)))
                  : null;
              return {
                driverId: r.driver_id,
                displayName: profiles[r.driver_id]?.display_name ?? "Fahrer",
                vtcId: r.vtc_id,
                game: (r.game ?? "ets2").toUpperCase(),
                position:
                  r.position_x != null && r.position_z != null
                    ? {
                        x: Number(r.position_x),
                        y: Number(r.position_y ?? 0),
                        z: Number(r.position_z),
                        heading: Number(r.heading ?? 0),
                      }
                    : null,
                city: r.source_city ?? r.dest_city ?? null,
                speed: Number(r.speed_kmh ?? 0),
                truck:
                  [r.truck_brand, r.truck_model].filter(Boolean).join(" ") || null,
                truckPlate: r.truck_plate ?? null,
                fuelPct,
                damagePct:
                  r.damage_engine != null
                    ? Math.max(0, Math.min(1, Number(r.damage_engine)))
                    : r.damage_pct != null
                      ? Math.max(0, Math.min(1, Number(r.damage_pct) / 100))
                      : null,
                cargoMassT:
                  r.cargo_mass_kg != null
                    ? Math.round(Number(r.cargo_mass_kg) / 10) / 100
                    : null,
                status: r.status ?? "idle",
                jobRemainingKm: r.job_remaining_km != null ? Number(r.job_remaining_km) : null,
                jobDistanceKm: r.job_distance_km != null ? Number(r.job_distance_km) : null,
                job:
                  activeJob || r.source_city || r.dest_city
                    ? {
                        source: activeJob?.source_city ?? r.source_city,
                        destination: activeJob?.dest_city ?? r.dest_city,
                        cargo: activeJob?.cargo ?? r.cargo,
                        startedAt: activeJob?.started_at ?? null,
                      }
                    : null,
                progress:
                  r.job_distance_km && r.job_remaining_km
                    ? Math.max(
                        0,
                        Math.min(1, 1 - Number(r.job_remaining_km) / Number(r.job_distance_km)),
                      )
                    : null,
                lastSeen: r.updated_at,
                isSelf: r.driver_id === callerId,
              };
            });

          return new Response(
            JSON.stringify({
              ok: true,
              requestId,
              updatedAt: new Date().toISOString(),
              drivers,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          logInternalError(requestId, "/api/public/telemetry/livemap", "POST", err, {
            stage: "unhandled",
          });
          return publicError("server_error", { requestId });
        }
      },
    },
  },
});
