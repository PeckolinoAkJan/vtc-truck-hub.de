import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("vtc_messages")
      .select("id, vtc_id, user_id, body, created_at")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw dbError(error, "messages");
    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p) => [p.user_id, { display_name: p.display_name ?? "User", avatar_url: p.avatar_url ?? null }]),
      );
    }
    return (rows ?? [])
      .reverse()
      .map((r) => ({
        id: r.id,
        vtc_id: r.vtc_id,
        user_id: r.user_id,
        body: r.body,
        created_at: r.created_at,
        display_name: profiles[r.user_id]?.display_name ?? "User",
        avatar_url: profiles[r.user_id]?.avatar_url ?? null,
      }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("vtc_messages")
      .insert({ vtc_id: data.vtcId, user_id: userId, body: data.body });
    if (error) throw dbError(error, "messages");
    return { ok: true };
  });

export const getProfileName = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", data.userId)
      .maybeSingle();
    return { display_name: p?.display_name ?? "User", avatar_url: p?.avatar_url ?? null };
  });
