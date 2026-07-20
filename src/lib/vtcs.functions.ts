import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify, randomCode } from "@/lib/format";
import { dbError, safeError } from "./server-errors";

const socialSchema = z
  .string()
  .trim()
  .max(300)
  .url()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

export const listMyVtcs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("vtc_members")
      .select("role, joined_at, vtcs:vtc_id(id,name,slug,tag,logo_url)")
      .eq("user_id", userId);
    if (error) throw dbError(error, "vtcs");
    return (data ?? []).map((r) => ({
      role: r.role,
      joined_at: r.joined_at,
      vtc: (r as { vtcs: { id: string; name: string; slug: string; tag: string; logo_url: string | null } | null }).vtcs,
    }));
  });

export const createVtc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(60),
        tag: z.string().trim().min(2).max(8).optional(),
        description: z.string().trim().max(500).optional().nullable(),
        logoUrl: z.string().url().max(1000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const baseSlug = slugify(data.name) || `vtc-${randomCode(4).toLowerCase()}`;
    let slug = baseSlug;
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await supabase.from("vtcs").select("id").eq("slug", slug).maybeSingle();
      if (!exists) break;
      slug = `${baseSlug}-${randomCode(3).toLowerCase()}`;
    }
    const derivedTag = (
      data.tag && data.tag.trim().length >= 2
        ? data.tag
        : (data.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4) || `V${randomCode(3)}`)
    )
      .toUpperCase()
      .slice(0, 8);

    const { error } = await supabase
      .from("vtcs")
      .insert({
        name: data.name,
        tag: derivedTag,
        slug,
        description: data.description ?? null,
        logo_url: data.logoUrl ?? null,
        created_by: userId,
      });
    if (error) throw dbError(error, "vtcs");

    const { data: vtc, error: readError } = await supabase
      .from("vtcs_public")
      .select("id, slug")
      .eq("slug", slug)
      .single();
    if (readError || !vtc) throw safeError(readError, "VTC konnte nicht erstellt werden", "vtcs");
    return { id: vtc.id, slug: vtc.slug };
  });

export const joinByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ code: z.string().min(4).max(32) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const code = data.code.toUpperCase().trim();
    // Join happens through a SECURITY DEFINER RPC that validates the invite
    // server-side. Direct client INSERTs into vtc_members are no longer allowed.
    const { data: row, error } = await supabase
      .rpc("accept_vtc_invite", { _code: code })
      .single();
    if (error) throw dbError(error, "vtcs");
    const result = row as { vtc_id: string; slug: string } | null;
    if (!result) throw new Error("Beitritt fehlgeschlagen");
    return { vtcId: result.vtc_id, slug: result.slug ?? "" };
  });

export const getVtcContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ slug: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: vtc, error } = await supabase
      .from("vtcs_public")
      .select("id, name, slug, tag, description, logo_url, discord_url, website_url, instagram_url, created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    console.log("[getVtcContext] slug=%s userId=%s vtc=%o error=%o", data.slug, userId, vtc, error);
    if (error) throw dbError(error, "vtcs");
    if (!vtc || !vtc.id || !vtc.slug) {
      // Fallback: check via admin client to distinguish "does not exist" from "no access".
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: exists } = await supabaseAdmin
        .from("vtcs")
        .select("id")
        .eq("slug", data.slug)
        .maybeSingle();
      if (!exists) throw new Error("VTC nicht gefunden");
      throw new Error("Kein Zugriff auf diese VTC");
    }
    const vtcId = vtc.id;
    const { data: me } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me) throw new Error("Kein Zugriff auf diese VTC");
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      vtc: {
        id: vtcId,
        name: vtc.name ?? "",
        slug: vtc.slug,
        tag: vtc.tag ?? "",
        description: vtc.description,
        logo_url: vtc.logo_url,
        discord_url: vtc.discord_url,
        website_url: vtc.website_url,
        instagram_url: vtc.instagram_url,
      },
      role: me.role as "owner" | "admin" | "dispatcher" | "driver",
      profile: {
        display_name: prof?.display_name ?? null,
        avatar_url: prof?.avatar_url ?? null,
      },
    };
  });

export const getVtcSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ slug: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: vtc, error } = await supabase
      .from("vtcs")
      .select("id, name, slug, tag, description, logo_url, discord_url, website_url, instagram_url")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw dbError(error, "vtcs");
    if (!vtc) throw new Error("Keine Berechtigung");
    const { data: me } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", vtc.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || (me.role !== "owner" && me.role !== "admin"))
      throw new Error("Keine Berechtigung");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: keyRow, error: keyErr } = await supabaseAdmin
      .from("vtc_secrets")
      .select("api_key")
      .eq("vtc_id", vtc.id)
      .maybeSingle();
    if (keyErr) throw dbError(keyErr, "vtcs");
    return { ...vtc, api_key: keyRow?.api_key ?? "", role: me.role as "owner" | "admin" };
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || me.role !== "owner") throw new Error("Keine Berechtigung");
    const newKey = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vtc_secrets")
      .update({ api_key: newKey, rotated_at: new Date().toISOString() })
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "vtcs");
    return { api_key: newKey };
  });

export const updateVtc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        name: z.string().min(2).max(60),
        tag: z.string().min(2).max(8),
        description: z.string().max(500).nullable().optional(),
        logoUrl: z.string().url().max(1000).nullable().optional(),
        discordUrl: socialSchema,
        websiteUrl: socialSchema,
        instagramUrl: socialSchema,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch = {
      name: data.name,
      tag: data.tag.toUpperCase(),
      description: data.description ?? null,
      discord_url: data.discordUrl ?? null,
      website_url: data.websiteUrl ?? null,
      instagram_url: data.instagramUrl ?? null,
      ...(data.logoUrl !== undefined ? { logo_url: data.logoUrl } : {}),
    };
    const { error } = await supabase.from("vtcs").update(patch).eq("id", data.vtcId);
    if (error) throw dbError(error, "vtcs");
    return { ok: true };
  });

export const deleteVtc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: me } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || me.role !== "owner") throw new Error("Nur der Inhaber darf die Spedition löschen");
    const { error } = await supabase.from("vtcs").delete().eq("id", data.vtcId);
    if (error) throw dbError(error, "vtcs");
    return { ok: true };
  });

// -------- Directory & Join Requests --------

export const listVtcDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("vtcs_directory")
      .select("id, name, slug, tag, description, logo_url, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw dbError(error, "vtcs");
    return data ?? [];
  });

export const getVtcPublicProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ slug: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: vtc, error } = await supabase
      .from("vtcs_directory")
      .select("id, name, slug, tag, description, logo_url, discord_url, website_url, instagram_url, created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw dbError(error, "vtcs");
    if (!vtc || !vtc.id) throw new Error("Spedition nicht gefunden");
    const vtcId = vtc.id;

    const { data: member } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", vtcId)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: request } = await supabase
      .from("vtc_join_requests")
      .select("id, status, created_at")
      .eq("vtc_id", vtcId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();

    return {
      vtc,
      isMember: !!member,
      role: member?.role ?? null,
      pendingRequest: request ?? null,
    };
  });

export const createJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid(), message: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: member } = await supabase
      .from("vtc_members")
      .select("vtc_id")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (member) throw new Error("Du bist bereits Mitglied dieser Spedition");
    const { error } = await supabase.from("vtc_join_requests").insert({
      vtc_id: data.vtcId,
      user_id: userId,
      message: data.message ?? null,
    });
    if (error) throw dbError(error, "vtcs");
    return { ok: true };
  });

export const cancelJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("vtc_join_requests")
      .delete()
      .eq("id", data.requestId)
      .eq("user_id", userId);
    if (error) throw dbError(error, "vtcs");
    return { ok: true };
  });

export const listVtcJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("vtc_join_requests")
      .select("id, user_id, message, status, created_at")
      .eq("vtc_id", data.vtcId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "vtcs");
    const ids = (rows ?? []).map((r) => r.user_id);
    let profiles: Array<{ user_id: string; display_name: string; avatar_url: string | null }> = [];
    if (ids.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      profiles = p ?? [];
    }
    return (rows ?? []).map((r) => ({
      ...r,
      profile: profiles.find((p) => p.user_id === r.user_id) ?? null,
    }));
  });

export const acceptJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify request exists and caller is an owner/admin of the target VTC (RLS-scoped)
    const { data: req, error: reqErr } = await supabase
      .from("vtc_join_requests")
      .select("id, vtc_id, user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw dbError(reqErr, "vtcs");
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already decided");

    const { data: membership, error: memErr } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", req.vtc_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw dbError(memErr, "vtcs");
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: insErr } = await supabaseAdmin
      .from("vtc_members")
      .upsert({ vtc_id: req.vtc_id, user_id: req.user_id, role: "driver" }, { onConflict: "vtc_id,user_id" });
    if (insErr) throw dbError(insErr, "vtcs");

    const { error: updErr } = await supabaseAdmin
      .from("vtc_join_requests")
      .update({ status: "accepted", decided_at: new Date().toISOString(), decided_by: userId })
      .eq("id", data.requestId);
    if (updErr) throw dbError(updErr, "vtcs");

    return { ok: true };
  });

export const rejectJoinRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("vtc_join_requests")
      .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: userId })
      .eq("id", data.requestId);
    if (error) throw dbError(error, "vtcs");
    return { ok: true };
  });

export const listMyJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("vtc_join_requests")
      .select("id, vtc_id, status, message, created_at, decided_at, vtcs:vtc_id(name, slug, tag, logo_url)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "vtcs");
    return (data ?? []).map((r) => ({
      id: r.id,
      vtc_id: r.vtc_id,
      status: r.status,
      message: r.message,
      created_at: r.created_at,
      decided_at: r.decided_at,
      vtc: (r as { vtcs: { name: string; slug: string; tag: string; logo_url: string | null } | null }).vtcs,
    }));
  });

export const listAllVtcJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("vtc_join_requests")
      .select("id, user_id, message, status, created_at, decided_at")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "vtcs");
    const ids = (rows ?? []).map((r) => r.user_id);
    let profiles: Array<{ user_id: string; display_name: string; avatar_url: string | null }> = [];
    if (ids.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      profiles = p ?? [];
    }
    return (rows ?? []).map((r) => ({
      ...r,
      profile: profiles.find((p) => p.user_id === r.user_id) ?? null,
    }));
  });

export const countPendingJoinRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { count, error } = await supabase
      .from("vtc_join_requests")
      .select("id", { count: "exact", head: true })
      .eq("vtc_id", data.vtcId)
      .eq("status", "pending");
    if (error) throw dbError(error, "vtcs");
    return { count: count ?? 0 };
  });
