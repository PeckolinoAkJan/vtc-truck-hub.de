import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/public/jobs/recent
 * Returns the latest jobs for the authenticated (via VTC API key) driver.
 * Read-only, used by the desktop client's history view.
 *
 * Auth: `Authorization: Bearer <vtc api_key>`
 * Query params:
 *   - driver_user_id (uuid)  OR  driver_steam_id
 *   - limit (default 25, max 100)
 */
export const Route = createFileRoute("/api/public/jobs/recent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return json({ error: "missing bearer" }, 401);
        }
        const apiKey = authHeader.slice(7).trim();
        if (!/^[a-f0-9]{16,128}$/i.test(apiKey)) {
          return json({ error: "invalid key format" }, 401);
        }

        const url = new URL(request.url);
        const driverUserId = url.searchParams.get("driver_user_id");
        const driverSteamId = url.searchParams.get("driver_steam_id");
        const limit = Math.min(
          100,
          Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25),
        );

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: vtcRow } = await supabaseAdmin
          .from("vtc_secrets")
          .select("vtc_id")
          .eq("api_key", apiKey)
          .maybeSingle();
        const vtc = vtcRow ? { id: vtcRow.vtc_id } : null;
        if (!vtc) return json({ error: "unauthorized" }, 401);

        // Resolve driver
        let driverId: string | null = null;
        if (driverUserId && /^[0-9a-f-]{36}$/i.test(driverUserId)) {
          driverId = driverUserId;
        } else if (driverSteamId) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .eq("steam_id", driverSteamId)
            .maybeSingle();
          driverId = prof?.user_id ?? null;
        }
        if (!driverId) return json({ error: "driver not found" }, 404);

        // Confirm membership in caller VTC
        const { data: membership } = await supabaseAdmin
          .from("vtc_members")
          .select("user_id")
          .eq("vtc_id", vtc.id)
          .eq("user_id", driverId)
          .maybeSingle();
        if (!membership) return json({ error: "forbidden" }, 403);

        const { data: rows, error } = await supabaseAdmin
          .from("jobs")
          .select(
            "id, status, source_city, dest_city, cargo, distance_km, revenue, fuel_cost, damage_pct, game, truck, started_at, finished_at, submitted_at",
          )
          .eq("vtc_id", vtc.id)
          .eq("driver_id", driverId)
          .order("submitted_at", { ascending: false })
          .limit(limit);
        if (error) return json({ error: "query failed" }, 500);

        return json({ ok: true, jobs: rows ?? [] }, 200);
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
