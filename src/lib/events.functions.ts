import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

const gameEnum = z.enum(["ets2", "ats"]);
const difficultyEnum = z.enum(["easy", "normal", "hard", "expert"]);
const rsvpEnum = z.enum(["going", "maybe", "declined", "waitlist"]);
const convoyRoleEnum = z.enum([
  "driver",
  "lead_driver",
  "tail_driver",
  "scout",
  "convoy_control",
  "event_manager",
  "media_team",
  "moderator",
]);

const createSchema = z.object({
  vtcId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(4000).optional().nullable(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  registrationDeadline: z.string().optional().nullable(),
  meetingPoint: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200),
  route: z.string().trim().max(300).optional().nullable(),
  maxParticipants: z.number().int().positive().max(1000).optional().nullable(),
  visibility: z.enum(["public", "members"]).default("public"),
  game: gameEnum.default("ets2"),
  server: z.string().trim().max(80).optional().nullable(),
  voiceServer: z.string().trim().max(120).optional().nullable(),
  difficulty: difficultyEnum.default("normal"),
  bannerUrl: z.string().url().max(1000).optional().nullable(),
  discordLink: z.string().url().max(500).optional().nullable(),
  routeLink: z.string().url().max(500).optional().nullable(),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  dlcRequirements: z.array(z.string().trim().max(60)).max(20).optional(),
});

export type VtcEvent = {
  id: string;
  vtc_id: string;
  created_by: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  registration_deadline: string | null;
  meeting_point: string;
  destination: string;
  route: string | null;
  max_participants: number | null;
  visibility: "public" | "members";
  status: "planned" | "open" | "closed" | "cancelled" | "completed";
  game: "ets2" | "ats";
  server: string | null;
  voice_server: string | null;
  difficulty: "easy" | "normal" | "hard" | "expert";
  banner_url: string | null;
  discord_link: string | null;
  route_link: string | null;
  contact_person: string | null;
  dlc_requirements: string[] | null;
  participant_count: number;
  going_count: number;
  maybe_count: number;
  declined_count: number;
  waitlist_count: number;
  is_participant: boolean;
  my_rsvp: "going" | "maybe" | "declined" | "waitlist" | null;
};

async function decorate(
  supabase: ReturnType<typeof Object>,
  rows: any[],
  userId?: string,
): Promise<VtcEvent[]> {
  const ids = rows.map((r) => r.id);
  const counts: Record<string, { going: number; maybe: number; declined: number; waitlist: number }> = {};
  const mine = new Map<string, string>();
  if (ids.length > 0) {
    const { data: parts } = await (supabase as any)
      .from("vtc_event_participants")
      .select("event_id, user_id, rsvp")
      .in("event_id", ids);
    for (const p of parts ?? []) {
      const c = counts[p.event_id] ?? { going: 0, maybe: 0, declined: 0, waitlist: 0 };
      const key = (p.rsvp ?? "going") as keyof typeof c;
      c[key] = (c[key] ?? 0) + 1;
      counts[p.event_id] = c;
      if (userId && p.user_id === userId) mine.set(p.event_id, p.rsvp ?? "going");
    }
  }
  return rows.map((r) => {
    const c = counts[r.id] ?? { going: 0, maybe: 0, declined: 0, waitlist: 0 };
    return {
      ...r,
      participant_count: c.going + c.maybe + c.waitlist,
      going_count: c.going,
      maybe_count: c.maybe,
      declined_count: c.declined,
      waitlist_count: c.waitlist,
      is_participant: mine.has(r.id),
      my_rsvp: (mine.get(r.id) as any) ?? null,
    } as VtcEvent;
  });
}

export const listVtcEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        scope: z.enum(["all", "upcoming", "running", "past"]).default("all"),
        game: z.enum(["all", "ets2", "ats"]).default("all"),
        search: z.string().trim().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase.from("vtc_events").select("*").eq("vtc_id", data.vtcId);
    const nowIso = new Date().toISOString();
    if (data.scope === "upcoming") q = q.gt("starts_at", nowIso);
    else if (data.scope === "past") q = q.lt("starts_at", nowIso);
    else if (data.scope === "running") q = q.lte("starts_at", nowIso).eq("status", "open");
    if (data.game !== "all") q = q.eq("game", data.game);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q.order("starts_at", { ascending: true }).limit(500);
    if (error) throw dbError(error, "events");
    return decorate(supabase, rows ?? [], userId);
  });

export const getVtcEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase.from("vtc_events").select("*").eq("id", data.eventId).maybeSingle();
    if (error) throw dbError(error, "events");
    if (!row) throw new Error("Event nicht gefunden");
    const [decorated] = await decorate(supabase, [row], userId);
    const { data: stops } = await supabase
      .from("vtc_event_stops")
      .select("*")
      .eq("event_id", data.eventId)
      .order("position", { ascending: true });
    const { data: media } = await supabase
      .from("vtc_event_media")
      .select("*")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false });
    const { data: feedback } = await supabase
      .from("vtc_event_feedback")
      .select("id,user_id,rating,comment,created_at")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false });
    return { event: decorated, stops: stops ?? [], media: media ?? [], feedback: feedback ?? [] };
  });

export const createVtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("vtc_events")
      .insert({
        vtc_id: data.vtcId,
        created_by: userId,
        title: data.title,
        description: data.description ?? null,
        starts_at: new Date(data.startsAt).toISOString(),
        ends_at: data.endsAt ? new Date(data.endsAt).toISOString() : null,
        registration_deadline: data.registrationDeadline ? new Date(data.registrationDeadline).toISOString() : null,
        meeting_point: data.meetingPoint,
        destination: data.destination,
        route: data.route ?? null,
        max_participants: data.maxParticipants ?? null,
        visibility: data.visibility,
        game: data.game,
        server: data.server ?? null,
        voice_server: data.voiceServer ?? null,
        difficulty: data.difficulty,
        banner_url: data.bannerUrl ?? null,
        discord_link: data.discordLink ?? null,
        route_link: data.routeLink ?? null,
        contact_person: data.contactPerson ?? null,
        dlc_requirements: data.dlcRequirements ?? [],
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "events");
    return row;
  });

export const updateVtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    createSchema.partial().extend({ eventId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { eventId, vtcId: _vtc, ...rest } = data as any;
    void _vtc;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      const map: Record<string, string> = {
        startsAt: "starts_at",
        endsAt: "ends_at",
        registrationDeadline: "registration_deadline",
        meetingPoint: "meeting_point",
        maxParticipants: "max_participants",
        voiceServer: "voice_server",
        bannerUrl: "banner_url",
        discordLink: "discord_link",
        routeLink: "route_link",
        contactPerson: "contact_person",
        dlcRequirements: "dlc_requirements",
      };
      const col = map[k] ?? k;
      patch[col] = v && ["starts_at", "ends_at", "registration_deadline"].includes(col) ? new Date(v as string).toISOString() : v;
    }
    const { error } = await (context.supabase.from("vtc_events") as any).update(patch).eq("id", eventId);
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const deleteVtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_events").delete().eq("id", data.eventId);
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const setEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        status: z.enum(["planned", "open", "closed", "cancelled", "completed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_events").update({ status: data.status }).eq("id", data.eventId);
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const rsvpVtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ eventId: z.string().uuid(), rsvp: rsvpEnum, notes: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Enforce capacity for 'going' → auto waitlist
    let rsvp = data.rsvp;
    if (rsvp === "going") {
      const { data: ev } = await supabase
        .from("vtc_events")
        .select("max_participants")
        .eq("id", data.eventId)
        .maybeSingle();
      if (ev?.max_participants) {
        const { count } = await supabase
          .from("vtc_event_participants")
          .select("id", { count: "exact", head: true })
          .eq("event_id", data.eventId)
          .eq("rsvp", "going");
        if ((count ?? 0) >= ev.max_participants) rsvp = "waitlist";
      }
    }
    const { error } = await supabase
      .from("vtc_event_participants")
      .upsert(
        { event_id: data.eventId, user_id: userId, rsvp, notes: data.notes ?? null },
        { onConflict: "event_id,user_id" },
      );
    if (error) throw dbError(error, "events");
    return { ok: true, rsvp };
  });

export const leaveVtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("vtc_event_participants")
      .delete()
      .eq("event_id", data.eventId)
      .eq("user_id", userId);
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const setParticipantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ eventId: z.string().uuid(), userId: z.string().uuid(), role: convoyRoleEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vtc_event_participants")
      .update({ convoy_role: data.role })
      .eq("event_id", data.eventId)
      .eq("user_id", data.userId);
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const listEventParticipants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: parts, error } = await supabase
      .from("vtc_event_participants")
      .select("user_id, joined_at, rsvp, convoy_role, notes")
      .eq("event_id", data.eventId)
      .order("joined_at", { ascending: true });
    if (error) throw dbError(error, "events");
    const ids = (parts ?? []).map((p) => p.user_id);
    let names: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      names = Object.fromEntries(
        (profs ?? []).map((p) => [p.user_id, { display_name: p.display_name, avatar_url: p.avatar_url }]),
      );
    }
    return (parts ?? []).map((p) => ({
      user_id: p.user_id,
      joined_at: p.joined_at,
      rsvp: (p.rsvp ?? "going") as z.infer<typeof rsvpEnum>,
      convoy_role: (p.convoy_role ?? "driver") as z.infer<typeof convoyRoleEnum>,
      notes: p.notes ?? null,
      display_name: names[p.user_id]?.display_name ?? "Fahrer",
      avatar_url: names[p.user_id]?.avatar_url ?? null,
    }));
  });

// Stops
export const setEventStops = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        stops: z.array(
          z.object({
            name: z.string().trim().min(1).max(120),
            kind: z.enum(["waypoint", "rest", "fuel", "finish"]).default("waypoint"),
            arriveAt: z.string().optional().nullable(),
            note: z.string().max(300).optional().nullable(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase.from("vtc_event_stops").delete().eq("event_id", data.eventId);
    if (data.stops.length === 0) return { ok: true };
    const { error } = await supabase.from("vtc_event_stops").insert(
      data.stops.map((s, i) => ({
        event_id: data.eventId,
        position: i,
        name: s.name,
        kind: s.kind,
        arrive_at: s.arriveAt ? new Date(s.arriveAt).toISOString() : null,
        note: s.note ?? null,
      })),
    );
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

// Media
export const addEventMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        url: z.string().url().max(1000),
        caption: z.string().max(200).optional().nullable(),
        kind: z.enum(["screenshot", "replay", "video", "other"]).default("screenshot"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_event_media").insert({
      event_id: data.eventId,
      uploaded_by: context.userId,
      url: data.url,
      caption: data.caption ?? null,
      kind: data.kind,
    });
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const deleteEventMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mediaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_event_media").delete().eq("id", data.mediaId);
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

// Feedback
export const submitEventFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ eventId: z.string().uuid(), rating: z.number().int().min(1).max(5), comment: z.string().max(1000).optional().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vtc_event_feedback")
      .upsert(
        { event_id: data.eventId, user_id: context.userId, rating: data.rating, comment: data.comment ?? null },
        { onConflict: "event_id,user_id" },
      );
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

// Reminders
export const setEventReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ eventId: z.string().uuid(), offsets: z.array(z.number().int().min(0).max(60 * 48)) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("vtc_event_reminders").delete().eq("event_id", data.eventId).eq("user_id", userId);
    if (data.offsets.length === 0) return { ok: true };
    const { error } = await supabase.from("vtc_event_reminders").insert(
      data.offsets.map((offset_minutes) => ({ event_id: data.eventId, user_id: userId, offset_minutes })),
    );
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

export const listEventReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("vtc_event_reminders")
      .select("offset_minutes")
      .eq("event_id", data.eventId)
      .eq("user_id", context.userId);
    if (error) throw dbError(error, "events");
    return (rows ?? []).map((r) => r.offset_minutes);
  });

// Banner upload signed URL (private bucket)
export const createBannerUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid(), ext: z.string().max(6) }).parse(d))
  .handler(async ({ data, context }) => {
    // Only VTC staff (owner/admin/dispatcher) may upload banners for the target VTC.
    const { data: me, error: roleErr } = await context.supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (roleErr) throw dbError(roleErr, "events");
    if (!me || (me.role !== "owner" && me.role !== "admin" && me.role !== "dispatcher")) {
      throw new Error("Forbidden");
    }
    const ext = data.ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
    const path = `${data.vtcId}/${context.userId}/${Date.now()}.${ext}`;
    const { data: signed, error } = await (context.supabase.storage.from("event-banners") as any).createSignedUploadUrl(path);
    if (error) throw dbError(error, "events");
    const { data: pub } = context.supabase.storage.from("event-banners").getPublicUrl(path);
    return { path, token: (signed as any).token, publicUrl: pub.publicUrl };
  });


// Stats
export const getEventStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: events } = await supabase
      .from("vtc_events")
      .select("id, starts_at, status, destination, meeting_point")
      .eq("vtc_id", data.vtcId);
    const ids = (events ?? []).map((e) => e.id);
    let totalPart = 0;
    let goingPart = 0;
    let declinedPart = 0;
    const routeCounts = new Map<string, number>();
    const hourCounts = new Map<number, number>();
    for (const e of events ?? []) {
      const key = `${e.meeting_point} → ${e.destination}`;
      routeCounts.set(key, (routeCounts.get(key) ?? 0) + 1);
      const h = new Date(e.starts_at).getHours();
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }
    if (ids.length > 0) {
      const { data: parts } = await supabase.from("vtc_event_participants").select("rsvp").in("event_id", ids);
      for (const p of parts ?? []) {
        totalPart++;
        if (p.rsvp === "going") goingPart++;
        if (p.rsvp === "declined") declinedPart++;
      }
    }
    const responses = goingPart + declinedPart;
    const attendanceRate = responses > 0 ? Math.round((goingPart / responses) * 100) : 0;
    const avgParticipants = ids.length > 0 ? Math.round(totalPart / ids.length) : 0;
    return {
      totalEvents: ids.length,
      totalParticipants: totalPart,
      attendanceRate,
      avgParticipants,
      topRoutes: [...routeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([label, count]) => ({ label, count })),
      topHours: [...hourCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([hour, count]) => ({ hour, count })),
    };
  });

// Public list for VTC profile page
export const listPublicVtcEvents = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vtc } = await supabaseAdmin.from("vtcs").select("id").eq("slug", data.slug).maybeSingle();
    if (!vtc) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("vtc_events")
      .select("id, title, description, starts_at, meeting_point, destination, max_participants, status, visibility, banner_url, game")
      .eq("vtc_id", vtc.id)
      .eq("visibility", "public")
      .gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(50);
    if (error) throw dbError(error, "events");
    const ids = (rows ?? []).map((r) => r.id);
    const counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: parts } = await supabaseAdmin
        .from("vtc_event_participants")
        .select("event_id")
        .in("event_id", ids)
        .eq("rsvp", "going");
      for (const p of parts ?? []) counts[p.event_id] = (counts[p.event_id] ?? 0) + 1;
    }
    return (rows ?? []).map((r) => ({ ...r, participant_count: counts[r.id] ?? 0 }));
  });

export const joinPublicVtcEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("vtc_event_participants")
      .upsert({ event_id: data.eventId, user_id: context.userId, rsvp: "going" }, { onConflict: "event_id,user_id" });
    if (error) throw dbError(error, "events");
    return { ok: true };
  });

// Driver profile — my events across VTCs
export const listMyEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: parts } = await supabase
      .from("vtc_event_participants")
      .select("event_id, rsvp, joined_at, convoy_role")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(200);
    const ids = (parts ?? []).map((p) => p.event_id);
    if (ids.length === 0)
      return { upcoming: [], past: [], stats: { total: 0, going: 0, maybe: 0, declined: 0, rate: 0 } };
    const { data: rows } = await supabase
      .from("vtc_events")
      .select("id, title, starts_at, meeting_point, destination, status, banner_url, vtc_id")
      .in("id", ids);
    const map = new Map((rows ?? []).map((r) => [r.id, r]));
    const now = Date.now();
    const upcoming: any[] = [];
    const past: any[] = [];
    let going = 0,
      maybe = 0,
      declined = 0;
    for (const p of parts ?? []) {
      const ev = map.get(p.event_id);
      if (!ev) continue;
      const withRsvp = { ...ev, rsvp: p.rsvp, convoy_role: p.convoy_role };
      if (new Date(ev.starts_at).getTime() >= now) upcoming.push(withRsvp);
      else past.push(withRsvp);
      if (p.rsvp === "going") going++;
      else if (p.rsvp === "maybe") maybe++;
      else if (p.rsvp === "declined") declined++;
    }
    const responses = going + declined;
    const rate = responses > 0 ? Math.round((going / responses) * 100) : 0;
    return { upcoming, past, stats: { total: parts?.length ?? 0, going, maybe, declined, rate } };
  });
