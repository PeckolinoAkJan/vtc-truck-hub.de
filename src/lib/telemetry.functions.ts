import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

/**
 * Live-Map API — sichere Positionsdaten für die Dashboard-Karte.
 * Sichtbarkeit: private (nur selbst) · vtc (Standard) · public (v1 = wie vtc) · hidden.
 * Es werden ausschließlich sichere Felder zurückgegeben; niemals Keys oder Rohfehler.
 */
export const getLiveMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: mem } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem) return { ok: true, updatedAt: new Date().toISOString(), drivers: [], role: null };
    const role = (mem.role as string) ?? null;
    const isStaff = role === "owner" || role === "admin" || role === "dispatcher";

    const cutoffOffline = new Date(Date.now() - 3 * 60_000).toISOString();
    const { data: rows, error } = await supabase
      .from("telemetry_data")
      .select(
        "driver_id, vtc_id, status, speed_kmh, position_x, position_y, position_z, heading, truck_brand, truck_model, truck_plate, source_city, dest_city, game, cargo, cargo_mass_kg, job_distance_km, job_remaining_km, fuel, fuel_level, fuel_capacity, damage_pct, damage_engine, updated_at",
      )
      .eq("vtc_id", data.vtcId)
      .gte("updated_at", cutoffOffline);
    if (error) return { ok: true, updatedAt: new Date().toISOString(), drivers: [], role };

    const ids = Array.from(new Set((rows ?? []).map((r) => r.driver_id)));
    let profiles: Record<string, { display_name: string | null; avatar_url: string | null; live_visibility: string; share_live_track: boolean }> = {};
    let activeJobs: Record<string, { id: string; source_city: string | null; dest_city: string | null; cargo: string | null; distance_km: number | null; started_at: string | null }> = {};
    if (ids.length > 0) {
      const [{ data: profs }, { data: jobs }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url, live_visibility, share_live_track")
          .in("user_id", ids),
        supabase
          .from("jobs")
          .select("id, driver_id, source_city, dest_city, cargo, distance_km, started_at")
          .eq("vtc_id", data.vtcId)
          .in("driver_id", ids)
          .eq("status", "in_progress"),
      ]);
      profiles = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.user_id,
          {
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            live_visibility: (p.live_visibility as string) ?? "vtc",
            share_live_track: (p as { share_live_track?: boolean }).share_live_track ?? true,
          },
        ]),
      );
      for (const j of jobs ?? []) {
        activeJobs[j.driver_id] = {
          id: j.id,
          source_city: j.source_city,
          dest_city: j.dest_city,
          cargo: j.cargo,
          distance_km: j.distance_km,
          started_at: j.started_at,
        };
      }
    }

    const drivers = (rows ?? [])
      .filter((r) => {
        const vis = profiles[r.driver_id]?.live_visibility ?? "vtc";
        if (r.driver_id === userId) return vis !== "hidden";
        return vis === "vtc" || vis === "public";
      })
      .map((r) => {
        const prof = profiles[r.driver_id];
        const isSelf = r.driver_id === userId;
        const seeJob = isSelf || isStaff;
        const seeVehicle = true; // truck info is not sensitive
        const activeJob = activeJobs[r.driver_id] ?? null;
        const fuelPct =
          r.fuel_level != null && r.fuel_capacity != null && Number(r.fuel_capacity) > 0
            ? Math.max(0, Math.min(1, Number(r.fuel_level) / Number(r.fuel_capacity)))
            : r.fuel != null && r.fuel_capacity != null && Number(r.fuel_capacity) > 0
              ? Math.max(0, Math.min(1, Number(r.fuel) / Number(r.fuel_capacity)))
              : null;
        return {
          driverId: r.driver_id,
          displayName: prof?.display_name ?? "Fahrer",
          avatarUrl: prof?.avatar_url ?? null,
          vtcId: r.vtc_id,
          game: (r.game ?? "ets2").toUpperCase(),
          position:
            r.position_x != null && r.position_z != null
              ? {
                  x: Number(r.position_x),
                  y: Number(r.position_y ?? 0),
                  z: Number(r.position_z),
                  heading: Number(r.heading ?? 0),
                }
              : null,
          city: r.source_city ?? r.dest_city ?? null,
          speed: Number(r.speed_kmh ?? 0),
          truck: seeVehicle ? [r.truck_brand, r.truck_model].filter(Boolean).join(" ") || null : null,
          truckPlate: seeVehicle ? r.truck_plate ?? null : null,
          fuelPct,
          damagePct:
            r.damage_engine != null
              ? Math.max(0, Math.min(1, Number(r.damage_engine)))
              : r.damage_pct != null
                ? Math.max(0, Math.min(1, Number(r.damage_pct) / 100))
                : null,
          cargoMassT: r.cargo_mass_kg != null ? Math.round(Number(r.cargo_mass_kg) / 10) / 100 : null,
          status: r.status ?? "idle",
          jobRemainingKm: r.job_remaining_km != null ? Number(r.job_remaining_km) : null,
          jobDistanceKm: r.job_distance_km != null ? Number(r.job_distance_km) : null,
          job: seeJob && (activeJob || r.source_city || r.dest_city)
            ? {
                source: activeJob?.source_city ?? r.source_city,
                destination: activeJob?.dest_city ?? r.dest_city,
                cargo: activeJob?.cargo ?? r.cargo,
                startedAt: activeJob?.started_at ?? null,
              }
            : null,
          progress:
            r.job_distance_km && r.job_remaining_km
              ? Math.max(0, Math.min(1, 1 - Number(r.job_remaining_km) / Number(r.job_distance_km)))
              : null,
          shareTrack: prof?.share_live_track ?? true,
          lastSeen: r.updated_at,
          isSelf,
        };
      });

    return { ok: true, updatedAt: new Date().toISOString(), drivers, role };
  });

/**
 * Statische Live-Map-Assets: Städte & POIs für ETS2 und ATS.
 * Werden vom Client einmalig geladen und lokal gecacht.
 */
export const getLiveMapAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: cities }, { data: pois }] = await Promise.all([
      supabase.from("game_cities").select("game, name, country, x, z"),
      supabase.from("game_pois").select("game, kind, name, x, z"),
    ]);
    return { cities: cities ?? [], pois: pois ?? [] };
  });

/**
 * Gefahrene Strecke eines Fahrers (nur laufende Sitzung).
 * RLS prüft VTC-Mitgliedschaft; gibt leeres Array zurück, wenn der Fahrer
 * die Track-Freigabe deaktiviert hat.
 */
export const getDriverTrack = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("share_live_track")
      .eq("user_id", data.userId)
      .maybeSingle();
    const shared = (prof as { share_live_track?: boolean } | null)?.share_live_track ?? true;
    if (!shared) return { points: [], game: null as string | null };
    const { data: row } = await supabase
      .from("driver_tracks")
      .select("points, game")
      .eq("user_id", data.userId)
      .maybeSingle();
    return {
      points: Array.isArray(row?.points) ? (row!.points as Array<{ x: number; z: number; t: number }>) : [],
      game: (row?.game as string | null) ?? null,
    };
  });

export const setShareLiveTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ share: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ share_live_track: data.share })
      .eq("user_id", userId);
    if (error) throw safeError(error, "Update fehlgeschlagen");
    return { ok: true };
  });


export const updateLiveVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ visibility: z.enum(["private", "vtc", "public", "hidden"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ live_visibility: data.visibility })
      .eq("user_id", userId);
    if (error) throw new Error("Update fehlgeschlagen");
    return { ok: true };
  });

export const listLiveTelemetry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("telemetry_data")
      .select("*")
      .eq("vtc_id", data.vtcId)
      .order("updated_at", { ascending: false });
    if (error) throw dbError(error, "telemetry");

    // Attach driver display names
    const ids = Array.from(new Set((rows ?? []).map((r) => r.driver_id)));
    const activeByDriver = new Map<
      string,
      { id: string; source_city: string; dest_city: string }
    >();
    if (ids.length > 0) {
      const { data: activeJobs } = await supabase
        .from("jobs")
        .select("id, driver_id, source_city, dest_city, started_at")
        .eq("vtc_id", data.vtcId)
        .eq("status", "in_progress")
        .in("driver_id", ids)
        .order("started_at", { ascending: false });
      for (const job of activeJobs ?? []) {
        if (!activeByDriver.has(job.driver_id)) {
          activeByDriver.set(job.driver_id, job);
        }
      }
    }
    let profiles: Record<string, { display_name: string | null }> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      profiles = Object.fromEntries((profs ?? []).map((p) => [p.user_id, { display_name: p.display_name }]));
    }
    return (rows ?? []).map((r) => {
      const activeJob = activeByDriver.get(r.driver_id);
      return {
        ...r,
        job_id: activeJob?.id ?? null,
        job_source_city: activeJob?.source_city ?? r.source_city ?? null,
        job_dest_city: activeJob?.dest_city ?? r.dest_city ?? null,
        driver_name: profiles[r.driver_id]?.display_name ?? "Fahrer",
      };
    });
  });

export const getTelemetryDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid(), driverId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: mem } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = mem?.role ?? null;
    const canSeeAll = role === "owner" || role === "admin" || role === "dispatcher";
    const targetDriver = canSeeAll ? data.driverId ?? userId : userId;

    const { data: tRows } = await supabase
      .from("telemetry_data")
      .select("*")
      .eq("vtc_id", data.vtcId)
      .eq("driver_id", targetDriver)
      .order("updated_at", { ascending: false })
      .limit(1);
    const telemetry = tRows?.[0] ?? null;

    const { data: jobs } = await supabase
      .from("jobs")
      .select(
        "id, source_city, dest_city, cargo, distance_km, status, started_at, odometer_start_km, odometer_end_km",
      )
      .eq("vtc_id", data.vtcId)
      .eq("driver_id", targetDriver)
      .in("status", ["in_progress", "submitted"])
      .order("started_at", { ascending: false })
      .limit(1);
    const activeJob = jobs?.[0] ?? null;
    const hasActiveJob = !!(activeJob && activeJob.status === "in_progress");

    const { data: events } = await supabase
      .from("telemetry_events")
      .select("id, event_type, payload, received_at")
      .eq("vtc_id", data.vtcId)
      .eq("driver_id", targetDriver)
      .order("received_at", { ascending: false })
      .limit(50);

    let vehicle: { brand: string | null; model: string | null; plate: string | null } | null =
      null;
    if (telemetry) {
      vehicle = {
        brand: telemetry.truck_brand ?? null,
        model: telemetry.truck_model ?? null,
        plate: telemetry.truck_plate ?? null,
      };
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", targetDriver)
      .maybeSingle();

    // ---- Derived route metrics (client sends job_distance_km but rarely job_remaining_km) ----
    const position =
      telemetry?.position_x != null && telemetry?.position_z != null
        ? {
            x: Number(telemetry.position_x),
            y: Number(telemetry.position_y ?? 0),
            z: Number(telemetry.position_z),
            heading: Number(telemetry.heading ?? 0),
          }
        : null;

    const sourceCity = telemetry?.source_city ?? activeJob?.source_city ?? null;
    const destCity = telemetry?.dest_city ?? activeJob?.dest_city ?? null;
    const cargo = telemetry?.cargo ?? activeJob?.cargo ?? null;
    const totalKm =
      hasActiveJob && activeJob?.distance_km != null
        ? Number(activeJob.distance_km)
        : telemetry?.job_distance_km != null
          ? Number(telemetry.job_distance_km)
          : null;

    let drivenKm: number | null = null;
    if (
      activeJob &&
      activeJob.odometer_start_km != null &&
      activeJob.odometer_end_km != null &&
      Number(activeJob.odometer_end_km) >= Number(activeJob.odometer_start_km)
    ) {
      drivenKm =
        Math.round(
          (Number(activeJob.odometer_end_km) - Number(activeJob.odometer_start_km)) * 10,
        ) / 10;
    }

    let remainingKm: number | null =
      telemetry?.job_remaining_km != null ? Number(telemetry.job_remaining_km) : null;
    if (remainingKm == null && position && destCity && telemetry?.game && hasActiveJob) {
      const { data: cityRow } = await supabase
        .from("game_cities")
        .select("x, z")
        .eq("game", String(telemetry.game).toUpperCase())
        .ilike("name", destCity)
        .maybeSingle();
      if (cityRow && cityRow.x != null && cityRow.z != null) {
        const dx = Number(cityRow.x) - position.x;
        const dz = Number(cityRow.z) - position.z;
        // Game units ≈ meters; * 1.25 approximates road factor over straight line.
        const eucKm = Math.sqrt(dx * dx + dz * dz) / 1000;
        remainingKm = Math.round(eucKm * 1.25 * 10) / 10;
      }
    }
    if (remainingKm == null && totalKm != null && drivenKm != null) {
      remainingKm = Math.max(0, Math.round((totalKm - drivenKm) * 10) / 10);
    }
    if (drivenKm == null && totalKm != null && remainingKm != null) {
      drivenKm = Math.max(0, Math.round((totalKm - remainingKm) * 10) / 10);
    }

    return {
      role,
      canSeeAll,
      driverId: targetDriver,
      driverName: prof?.display_name ?? "Fahrer",
      driverAvatar: prof?.avatar_url ?? null,
      telemetry,
      activeJob,
      hasActiveJob,
      vehicle,
      events: events ?? [],
      route: {
        source: sourceCity,
        destination: destCity,
        cargo,
        totalKm,
        drivenKm,
        remainingKm,
        position,
        game: telemetry?.game ?? null,
      },
    };
  });
