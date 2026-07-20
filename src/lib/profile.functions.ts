import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data: profile, error } = await supabase
      .from("profiles")
      .select(
        "user_id, display_name, real_name, discord_id, steam_id, avatar_url, created_at",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw dbError(error, "profile");
    if (!profile) throw new Error("Profil nicht gefunden");

    // client_key lives in the segregated profile_secrets table (server-only).
    // balance is column-restricted on profiles; fetch both via admin, strictly
    // scoped to the caller's own user_id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: secretRow }, { data: balRow }] = await Promise.all([
      supabaseAdmin
        .from("profile_secrets")
        .select("client_key")
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    const client_key = secretRow?.client_key ?? null;
    const balance = Number(balRow?.balance ?? 0);

    const { data: memberships } = await supabase
      .from("vtc_members")
      .select("role, joined_at, vtcs:vtc_id(id,name,slug,tag,logo_url)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: true });

    const rows = (memberships ?? []) as Array<{
      role: string;
      vtcs: { id: string; name: string; slug: string; tag: string; logo_url: string | null } | null;
    }>;
    const first = rows[0];
    const isOwner = rows.some((r) => r.role === "owner");

    const email =
      (claims as unknown as { email?: string })?.email ?? null;

    return {
      ...profile,
      client_key,
      balance,
      email,
      vtc: first?.vtcs ?? null,
      role: first?.role ?? null,
      isOwner,
    };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        displayName: z.string().trim().min(2).max(60),
        realName: z.string().trim().max(100).nullable().optional(),
        discordId: z.string().trim().max(64).nullable().optional(),
        steamId: z
          .string()
          .regex(/^\d{17}$/)
          .nullable()
          .optional(),
        avatarUrl: z.string().url().max(500).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: data.displayName,
        real_name: data.realName ?? null,
        discord_id: data.discordId ?? null,
        steam_id: data.steamId ?? null,
        avatar_url: data.avatarUrl ?? null,
      })
      .eq("user_id", userId);
    if (error) throw dbError(error, "profile");
    return { ok: true };
  });
