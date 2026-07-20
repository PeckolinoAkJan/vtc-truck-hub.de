import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

const gameEnum = z.enum(["ets2", "ats", "other"]);
const statusEnum = z.enum(["in_progress", "submitted", "approved", "rejected", "cancelled"]);
const sortEnum = z.enum([
  "submitted_at_desc",
  "submitted_at_asc",
  "distance_desc",
  "distance_asc",
  "revenue_desc",
  "revenue_asc",
]);

export const listJobsPaged = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        status: statusEnum.optional(),
        game: gameEnum.optional(),
        driverId: z.string().uuid().optional(),
        search: z.string().trim().max(80).optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        sort: sortEnum.default("submitted_at_desc"),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(25),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("jobs")
      .select(
        "id, status, source_city, dest_city, cargo, distance_km, revenue, fuel_cost, damage_pct, game, truck, submitted_at, started_at, finished_at, updated_at, driver_id, odometer_start_km, odometer_end_km",
        { count: "exact" },
      )
      .eq("vtc_id", data.vtcId);

    if (data.status) q = q.eq("status", data.status);
    if (data.game) q = q.eq("game", data.game);
    if (data.driverId) q = q.eq("driver_id", data.driverId);
    if (data.from) q = q.gte("submitted_at", data.from);
    if (data.to) q = q.lte("submitted_at", data.to);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "").trim();
      if (s.length > 0) {
        const like = `%${s}%`;
        q = q.or(
          `cargo.ilike.${like},source_city.ilike.${like},dest_city.ilike.${like},truck.ilike.${like}`,
        );
      }
    }
    const [col, dir] = (() => {
      switch (data.sort) {
        case "submitted_at_asc":
          return ["submitted_at", true] as const;
        case "distance_desc":
          return ["distance_km", false] as const;
        case "distance_asc":
          return ["distance_km", true] as const;
        case "revenue_desc":
          return ["revenue", false] as const;
        case "revenue_asc":
          return ["revenue", true] as const;
        default:
          return ["submitted_at", false] as const;
      }
    })();
    q = q.order(col, { ascending: dir });

    const fromIdx = (data.page - 1) * data.pageSize;
    const toIdx = fromIdx + data.pageSize - 1;
    q = q.range(fromIdx, toIdx);

    const { data: rows, error, count } = await q;
    if (error) throw dbError(error, "jobs");

    const ids = Array.from(new Set((rows ?? []).map((r) => r.driver_id)));
    const profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      for (const p of profs ?? []) {
        profiles[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }

    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        driver: profiles[r.driver_id] ?? { display_name: "Unbekannt", avatar_url: null },
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const getJobsKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("jobs")
      .select("status, distance_km, revenue, fuel_cost")
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "jobs");

    const counts: Record<string, number> = {
      all: 0,
      in_progress: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };
    let totalKm = 0;
    let totalRevenue = 0;
    let totalFuel = 0;
    for (const r of rows ?? []) {
      counts.all += 1;
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      if (r.status === "approved" || r.status === "submitted") {
        totalKm += Number(r.distance_km ?? 0);
        totalRevenue += Number(r.revenue ?? 0);
        totalFuel += Number(r.fuel_cost ?? 0);
      }
    }
    return {
      counts,
      totals: {
        km: totalKm,
        revenue: totalRevenue,
        fuel: totalFuel,
        profit: totalRevenue - totalFuel,
        completed: counts.approved + counts.submitted,
      },
    };
  });

export const listJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        status: statusEnum.optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("jobs")
      .select(
        "id, status, source_city, dest_city, cargo, distance_km, revenue, fuel_cost, damage_pct, game, truck, submitted_at, driver_id",
      )
      .eq("vtc_id", data.vtcId)
      .order("submitted_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw dbError(error, "jobs");

    const ids = Array.from(new Set((rows ?? []).map((r) => r.driver_id)));
    const profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      for (const p of profs ?? []) {
        profiles[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      }
    }

    return (rows ?? []).map((r) => ({
      ...r,
      driver: profiles[r.driver_id] ?? { display_name: "Unbekannt", avatar_url: null },
    }));
  });

export const getJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw dbError(error, "jobs");
    if (!job) throw new Error("Tour nicht gefunden");

    const ids = [job.driver_id, job.reviewed_by].filter((v): v is string => !!v);
    const profs: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (ids.length) {
      const { data: rows } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", ids);
      for (const p of rows ?? [])
        profs[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
    }

    // Latest telemetry snapshot for this driver (used for live progress / route data)
    const { data: telemetry } = await supabase
      .from("telemetry_data")
      .select("*")
      .eq("driver_id", job.driver_id)
      .eq("vtc_id", job.vtc_id)
      .maybeSingle();

    // Event history for this job
    const { data: events } = await supabase
      .from("telemetry_events")
      .select("id, event_type, received_at, payload")
      .eq("job_id", job.id)
      .order("received_at", { ascending: false })
      .limit(50);

    return {
      ...job,
      driver: profs[job.driver_id] ?? { display_name: "Unbekannt", avatar_url: null },
      reviewer: job.reviewed_by ? (profs[job.reviewed_by] ?? null) : null,
      telemetry: telemetry ?? null,
      events: events ?? [],
    };
  });


export const submitJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        source_city: z.string().min(1).max(80),
        dest_city: z.string().min(1).max(80),
        cargo: z.string().min(1).max(80),
        distance_km: z.number().min(0).max(100000),
        revenue: z.number().min(0).max(10_000_000),
        fuel_cost: z.number().min(0).max(10_000_000).default(0),
        damage_pct: z.number().min(0).max(100).default(0),
        game: gameEnum.default("ets2"),
        truck: z.string().max(80).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("jobs")
      .insert({
        vtc_id: data.vtcId,
        driver_id: userId,
        source_city: data.source_city,
        dest_city: data.dest_city,
        cargo: data.cargo,
        distance_km: data.distance_km,
        revenue: data.revenue,
        fuel_cost: data.fuel_cost,
        damage_pct: data.damage_pct,
        game: data.game,
        truck: data.truck ?? null,
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !row) throw safeError(error, "Fehler", "jobs");
    return { id: row.id };
  });

export const reviewJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        jobId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        note: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("jobs")
      .update({
        status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
      })
      .eq("id", data.jobId);
    if (error) throw dbError(error, "jobs");
    return { ok: true };
  });

export const deleteJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: job, error: fetchErr } = await supabase
      .from("jobs")
      .select("id, vtc_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (fetchErr) throw dbError(fetchErr, "jobs");
    if (!job) throw new Error("Tour nicht gefunden");

    const { data: me } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", job.vtc_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || (me.role !== "owner" && me.role !== "admin")) {
      throw new Error("Keine Berechtigung zum Löschen");
    }

    const { error } = await supabase.from("jobs").delete().eq("id", data.jobId);
    if (error) throw dbError(error, "jobs");
    return { ok: true };
  });
