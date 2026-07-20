import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { publicError, logInternalError, newRequestId } from "@/lib/public-api-errors";

const bodySchema = z.object({
  driver_steam_id: z.string().optional(),
  driver_user_id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});

export const Route = createFileRoute("/api/public/messages/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestId = newRequestId();
        try {
          const authHeader = request.headers.get("authorization") ?? "";
          if (!authHeader.startsWith("Bearer ")) return publicError("unauthorized", { requestId });
          const apiKey = authHeader.slice(7).trim();
          if (!/^[a-f0-9]{16,128}$/i.test(apiKey))
            return publicError("unauthorized", { requestId });

          let body: unknown;
          try {
            body = await request.json();
          } catch (err) {
            logInternalError(requestId, "/api/public/messages/send", "POST", err, {
              stage: "parse_json",
            });
            return publicError("bad_request", { requestId });
          }
          const parsed = bodySchema.safeParse(body);
          if (!parsed.success) {
            logInternalError(
              requestId,
              "/api/public/messages/send",
              "POST",
              new Error("zod_validation_failed"),
              { zod: parsed.error.flatten() },
            );
            return publicError("bad_request", { requestId });
          }
          const { driver_steam_id, driver_user_id, message } = parsed.data;

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

          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("display_name")
            .eq("user_id", driverId)
            .maybeSingle();
          const senderName = prof?.display_name?.trim() || "Fahrer";

          const { data: inserted, error } = await supabaseAdmin
            .from("messages")
            .insert({
              vtc_id: vtc.id,
              sender_id: driverId,
              sender_name: senderName,
              message,
            })
            .select("id, created_at, vtc_id, sender_id, sender_name, message")
            .single();
          if (error) {
            logInternalError(requestId, "/api/public/messages/send", "POST", error, {
              stage: "messages_insert",
            });
            return publicError("server_error", { requestId });
          }

          return new Response(JSON.stringify({ message: inserted, requestId }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          logInternalError(requestId, "/api/public/messages/send", "POST", err, {
            stage: "unhandled",
          });
          return publicError("server_error", { requestId });
        }
      },
    },
  },
});
