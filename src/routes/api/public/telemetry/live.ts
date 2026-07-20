import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicError, logInternalError, newRequestId } from "@/lib/public-api-errors";

const frameSchema = z.object({
  driver_steam_id: z.string().optional(),
  driver_user_id: z.string().uuid().optional(),
  status: z.string().max(32).optional(),
  truck_model: z.string().max(120).optional(),
  truck_brand: z.string().max(80).optional(),
  truck_plate: z.string().max(24).optional(),
  speed_kmh: z.number().min(-50).max(400).optional(),
  position_x: z.number().optional(),
  position_y: z.number().optional(),
  position_z: z.number().optional(),
  heading: z.number().optional(),
  fuel: z.number().min(0).max(10000).optional(),
  fuel_capacity: z.number().min(0).max(10000).optional(),
  fuel_level: z.number().min(0).max(10000).optional(),
  fuel_consumption_avg: z.number().min(0).max(200).optional(),
  cargo: z.string().max(120).optional(),
  cargo_mass_kg: z.number().min(0).max(100000).optional(),
  source_city: z.string().max(120).optional(),
  dest_city: z.string().max(120).optional(),
  job_distance_km: z.number().min(0).max(100000).optional(),
  job_remaining_km: z.number().min(0).max(100000).optional(),
  damage_pct: z.number().min(0).max(100).optional(),
  damage_cabin: z.number().min(0).max(100).optional(),
  damage_chassis: z.number().min(0).max(100).optional(),
  damage_engine: z.number().min(0).max(100).optional(),
  damage_transmission: z.number().min(0).max(100).optional(),
  damage_wheels: z.number().min(0).max(100).optional(),
  driving_time_today_min: z.number().int().min(0).max(10000).optional(),
  rest_time_remaining_min: z.number().int().min(0).max(10000).optional(),
  game: z.enum(["ets2", "ats", "other"]).optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});


export const Route = createFileRoute("/api/public/telemetry/live")({
  server: {
    handlers: {
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
          logInternalError(requestId, "/api/public/telemetry/live", "POST", err, {
            stage: "parse_json",
          });
          return publicError("bad_request", { requestId });
        }
        const parsed = frameSchema.safeParse(body);
        if (!parsed.success) {
          logInternalError(
            requestId,
            "/api/public/telemetry/live",
            "POST",
            new Error("zod_validation_failed"),
            { zod: parsed.error.flatten() },
          );
          return publicError("bad_request", { requestId });
        }
        const f = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: vtcRow } = await supabaseAdmin
          .from("vtc_secrets")
          .select("vtc_id")
          .eq("api_key", apiKey)
          .maybeSingle();
        const vtc = vtcRow ? { id: vtcRow.vtc_id } : null;
        if (!vtc) return publicError("unauthorized", { requestId });

        let driverId: string | null = f.driver_user_id ?? null;
        if (!driverId && f.driver_steam_id) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("steam_id", f.driver_steam_id)
            .maybeSingle();
          driverId = prof?.user_id ?? null;
        }
        if (!driverId) return publicError("not_found", { requestId });

        const { data: membership } = await supabaseAdmin
          .from("vtc_members")
          .select("user_id")
          .eq("vtc_id", vtc.id)
          .eq("user_id", driverId)
          .maybeSingle();
        if (!membership) return publicError("forbidden", { requestId });

        // Upsert / update vehicle if plate provided
        let vehicleId: string | null = null;
        if (f.truck_plate) {
          const { data: veh } = await supabaseAdmin
            .from("vehicles")
            .upsert(
              {
                vtc_id: vtc.id,
                plate: f.truck_plate,
                name: f.truck_plate,
                brand: f.truck_brand ?? null,
                model: f.truck_model ?? null,
                current_driver_id: driverId,
                status: f.status ?? "driving",
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: "vtc_id,plate" },
            )
            .select("id")
            .single();
          vehicleId = veh?.id ?? null;
        }

        const row = {
          vtc_id: vtc.id,
          driver_id: driverId,
          vehicle_id: vehicleId,
          truck_model: f.truck_model ?? null,
          truck_brand: f.truck_brand ?? null,
          truck_plate: f.truck_plate ?? null,
          speed_kmh: f.speed_kmh ?? null,
          position_x: f.position_x ?? null,
          position_y: f.position_y ?? null,
          position_z: f.position_z ?? null,
          heading: f.heading ?? null,
          fuel: f.fuel ?? null,
          fuel_capacity: f.fuel_capacity ?? null,
          fuel_level: f.fuel_level ?? f.fuel ?? null,
          fuel_consumption_avg: f.fuel_consumption_avg ?? null,
          cargo: f.cargo ?? null,
          cargo_mass_kg: f.cargo_mass_kg ?? null,
          source_city: f.source_city ?? null,
          dest_city: f.dest_city ?? null,
          job_distance_km: f.job_distance_km ?? null,
          job_remaining_km: f.job_remaining_km ?? null,
          damage_pct: f.damage_pct ?? null,
          damage_cabin: f.damage_cabin ?? null,
          damage_chassis: f.damage_chassis ?? null,
          damage_engine: f.damage_engine ?? null,
          damage_transmission: f.damage_transmission ?? null,
          damage_wheels: f.damage_wheels ?? null,
          driving_time_today_min: f.driving_time_today_min ?? null,
          rest_time_remaining_min: f.rest_time_remaining_min ?? null,
          game: f.game ?? null,
          status: f.status ?? "driving",
          raw: (f.raw ?? {}) as never,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabaseAdmin
          .from("telemetry_data")
          .upsert(row, { onConflict: "vtc_id,driver_id" });
        if (error) {
          logInternalError(requestId, "/api/public/telemetry/live", "POST", error, {
            stage: "telemetry_upsert",
          });
          return publicError("server_error", { requestId });
        }

        return new Response(JSON.stringify({ ok: true, requestId }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
        } catch (err) {
          logInternalError(requestId, "/api/public/telemetry/live", "POST", err, {
            stage: "unhandled",
          });
          return publicError("server_error", { requestId });
        }
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type, authorization",
          },
        }),
    },
  },
});
