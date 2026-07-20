import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { randomCode } from "@/lib/format";
import { dbError, safeError } from "./server-errors";

const roleEnum = z.enum(["owner", "admin", "dispatcher", "driver"]);

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("vtc_members")
      .select("user_id, role, joined_at")
      .eq("vtc_id", data.vtcId)
      .order("joined_at", { ascending: true });
    if (error) throw dbError(error, "members");

    const ids = (members ?? []).map((m) => m.user_id);
    let profiles: Record<
      string,
      { display_name: string; avatar_url: string | null; steam_id: string | null }
    > = {};
    let stats: Record<string, { jobs: number; km: number; revenue: number }> = {};

    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, steam_id")
        .in("user_id", ids);
      profiles = (profs ?? []).reduce<typeof profiles>((acc, p) => {
        acc[p.user_id] = {
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          steam_id: p.steam_id,
        };
        return acc;
      }, {});

      const { data: jobs } = await supabase
        .from("jobs")
        .select("driver_id, distance_km, revenue, status")
        .eq("vtc_id", data.vtcId)
        .eq("status", "approved")
        .in("driver_id", ids);
      stats = (jobs ?? []).reduce<typeof stats>((acc, j) => {
        const k = j.driver_id;
        if (!acc[k]) acc[k] = { jobs: 0, km: 0, revenue: 0 };
        acc[k].jobs += 1;
        acc[k].km += Number(j.distance_km) || 0;
        acc[k].revenue += Number(j.revenue) || 0;
        return acc;
      }, {});
    }

    return (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      profile: profiles[m.user_id] ?? { display_name: "Unbekannt", avatar_url: null, steam_id: null },
      stats: stats[m.user_id] ?? { jobs: 0, km: 0, revenue: 0 },
    }));
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ vtcId: z.string().uuid(), userId: z.string().uuid(), role: roleEnum })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load actor + target roles in one call so we can enforce hierarchy.
    const { data: rows, error: rolesErr } = await supabase
      .from("vtc_members")
      .select("user_id, role")
      .eq("vtc_id", data.vtcId)
      .in("user_id", [userId, data.userId]);
    if (rolesErr) throw dbError(rolesErr, "members");
    const actorRole = rows?.find((r) => r.user_id === userId)?.role ?? null;
    const targetRole = rows?.find((r) => r.user_id === data.userId)?.role ?? null;

    if (!actorRole || (actorRole !== "owner" && actorRole !== "admin")) {
      throw new Error("Insufficient permissions to modify this user");
    }
    if (!targetRole) throw new Error("Zielmitglied nicht gefunden");

    // The owner is untouchable — nobody (not even another owner via this path) may demote them.
    if (targetRole === "owner") {
      throw new Error("Insufficient permissions to modify this user");
    }
    // Only an owner may modify another admin, or grant the owner role.
    if ((targetRole === "admin" || data.role === "owner" || data.role === "admin") && actorRole !== "owner") {
      throw new Error("Insufficient permissions to modify this user");
    }
    // Self-demotion of the sole/any owner via this path is blocked above (targetRole==='owner').

    const { error } = await supabase
      .from("vtc_members")
      .update({ role: data.role })
      .eq("vtc_id", data.vtcId)
      .eq("user_id", data.userId);
    if (error) throw dbError(error, "members");
    return { ok: true };
  });


export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid(), userId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Allow self-leave (any member removing themselves) without hierarchy checks.
    if (userId !== data.userId) {
      const { data: rows, error: rolesErr } = await supabase
        .from("vtc_members")
        .select("user_id, role")
        .eq("vtc_id", data.vtcId)
        .in("user_id", [userId, data.userId]);
      if (rolesErr) throw dbError(rolesErr, "members");
      const actorRole = rows?.find((r) => r.user_id === userId)?.role ?? null;
      const targetRole = rows?.find((r) => r.user_id === data.userId)?.role ?? null;

      if (!actorRole || (actorRole !== "owner" && actorRole !== "admin")) {
        throw new Error("Insufficient permissions to modify this user");
      }
      if (!targetRole) throw new Error("Zielmitglied nicht gefunden");
      // Owner is untouchable.
      if (targetRole === "owner") {
        throw new Error("Insufficient permissions to modify this user");
      }
      // Only an owner may remove an admin.
      if (targetRole === "admin" && actorRole !== "owner") {
        throw new Error("Insufficient permissions to modify this user");
      }
    }

    const { error } = await supabase
      .from("vtc_members")
      .delete()
      .eq("vtc_id", data.vtcId)
      .eq("user_id", data.userId);
    if (error) throw dbError(error, "members");
    return { ok: true };
  });


export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only owners/admins may view invite codes — regular drivers must never see codes
    // that could grant elevated access.
    const { data: me } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new Error("Nur Owner oder Admins können Einladungscodes einsehen");
    }
    const { data: invites, error } = await supabase
      .from("vtc_invites")
      .select("id, code, role, expires_at, created_at")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "members");
    return invites ?? [];
  });


export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        role: roleEnum.default("driver"),
        expiresInDays: z.number().int().min(1).max(90).default(7),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only an existing owner may create an owner invite.
    if (data.role === "owner") {
      const { data: me } = await supabase
        .from("vtc_members")
        .select("role")
        .eq("vtc_id", data.vtcId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!me || me.role !== "owner")
        throw new Error("Nur ein bestehender Owner kann Owner-Einladungen erstellen");
    }
    const code = randomCode(8);
    const expires_at = new Date(Date.now() + data.expiresInDays * 86400_000).toISOString();
    const { data: row, error } = await supabase
      .from("vtc_invites")
      .insert({ vtc_id: data.vtcId, code, role: data.role, expires_at, created_by: userId })
      .select("id, code, role, expires_at, created_at")
      .single();
    if (error || !row) throw safeError(error, "Fehler", "members");
    return row;
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ inviteId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("vtc_invites").delete().eq("id", data.inviteId);
    if (error) throw dbError(error, "members");
    return { ok: true };
  });
