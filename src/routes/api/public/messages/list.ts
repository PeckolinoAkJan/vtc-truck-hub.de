import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicError, logInternalError, newRequestId } from "@/lib/public-api-errors";

const querySchema = z.object({
  driver_steam_id: z.string().optional(),
  driver_user_id: z.string().uuid().optional(),
  since: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const Route = createFileRoute("/api/public/messages/list")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestId = newRequestId();
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          if (!authHeader.startsWith("Bearer ")) return publicError("unauthorized", { requestId });
          const apiKey = authHeader.slice(7).trim();
          if (!/^[a-f0-9]{16,128}$/i.test(apiKey))
            return publicError("unauthorized", { requestId });

          const url = new URL(request.url);
          const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
          if (!parsed.success) {
            logInternalError(
              requestId,
              "/api/public/messages/list",
              "GET",
              new Error("zod_validation_failed"),
              { zod: parsed.error.flatten() },
            );
            return publicError("bad_request", { requestId });
          }
          const { driver_steam_id, driver_user_id, since, limit } = parsed.data;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          const { data: vtcRow } = await supabaseAdmin
            .from("vtc_secrets")
            .select("vtc_id")
            .eq("api_key", apiKey)
            .maybeSingle();
          const vtc = vtcRow ? { id: vtcRow.vtc_id } : null;
          if (!vtc) return publicError("unauthorized", { requestId });

          let driverId: string | null = driver_user_id ?? null;
          if (!driverId && driver_steam_id) {
            const { data: prof } = await supabaseAdmin
              .from("profiles")
              .select("user_id")
              .eq("steam_id", driver_steam_id)
              .maybeSingle();
            driverId = prof?.user_id ?? null;
          }
          if (!driverId) return publicError("forbidden", { requestId });
          const { data: membership } = await supabaseAdmin
            .from("vtc_members")
            .select("user_id")
            .eq("vtc_id", vtc.id)
            .eq("user_id", driverId)
            .maybeSingle();
          if (!membership) return publicError("forbidden", { requestId });

          let q = supabaseAdmin
            .from("messages")
            .select("id, created_at, vtc_id, sender_id, sender_name, message")
            .eq("vtc_id", vtc.id)
            .order("created_at", { ascending: false })
            .limit(limit ?? 100);
          if (since) q = q.gt("created_at", since);

          const { data, error } = await q;
          if (error) {
            logInternalError(requestId, "/api/public/messages/list", "GET", error, {
              stage: "messages_query",
            });
            return publicError("server_error", { requestId });
          }

          return new Response(
            JSON.stringify({ messages: (data ?? []).slice().reverse(), requestId }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          logInternalError(requestId, "/api/public/messages/list", "GET", err, {
            stage: "unhandled",
          });
          return publicError("server_error", { requestId });
        }
      },
    },
  },
});
