import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

const STAFF_ROLES = ["owner", "admin", "dispatcher"] as const;

async function assertStaff(supabase: any, userId: string, vtcId: string) {
  const { data, error } = await supabase
    .from("vtc_members")
    .select("role")
    .eq("vtc_id", vtcId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw dbError(error, "fleet");
  if (!data || !STAFF_ROLES.includes(data.role)) throw new Error("Forbidden");
}

// ---------- List with details ----------
export const listFleet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        search: z.string().optional(),
        status: z.string().optional(),
        brand: z.string().optional(),
        game: z.enum(["ets2", "ats"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("vehicles")
      .select("*")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false });
    if (data.status) q = q.eq("status", data.status);
    if (data.brand) q = q.ilike("brand", `%${data.brand}%`);
    if (data.search)
      q = q.or(
        `name.ilike.%${data.search}%,plate.ilike.%${data.search}%,model.ilike.%${data.search}%,brand.ilike.%${data.search}%`,
      );
    const { data: vehicles, error } = await q;
    if (error) throw dbError(error, "fleet");
    const ids = (vehicles ?? []).map((v) => v.id);
    if (ids.length === 0) return [];

    const [{ data: details }, { data: cond }] = await Promise.all([
      supabase.from("vehicle_details").select("*").in("vehicle_id", ids),
      supabase.from("vehicle_condition").select("*").in("vehicle_id", ids),
    ]);

    const detailMap = new Map((details ?? []).map((r: any) => [r.vehicle_id, r]));
    const condMap = new Map((cond ?? []).map((r: any) => [r.vehicle_id, r]));

    const driverIds = Array.from(
      new Set((vehicles ?? []).map((v) => v.current_driver_id).filter(Boolean)),
    ) as string[];
    let profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", driverIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.user_id,
          { display_name: p.display_name ?? "Fahrer", avatar_url: p.avatar_url },
        ]),
      );
    }

    let filtered = (vehicles ?? []).map((v) => ({
      ...v,
      details: detailMap.get(v.id) ?? null,
      condition: condMap.get(v.id) ?? null,
      driver: v.current_driver_id ? profiles[v.current_driver_id] ?? null : null,
    }));
    if (data.game) filtered = filtered.filter((v: any) => v.details?.game === data.game);
    return filtered;
  });

// ---------- Get single vehicle ----------
export const getVehicle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: v, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (error) throw dbError(error, "fleet");
    if (!v) throw new Error("Not found");
    const [{ data: details }, { data: cond }, { data: maint }, { data: docs }, { data: history }] =
      await Promise.all([
        supabase.from("vehicle_details").select("*").eq("vehicle_id", v.id).maybeSingle(),
        supabase.from("vehicle_condition").select("*").eq("vehicle_id", v.id).maybeSingle(),
        supabase.from("vehicle_maintenance_schedule").select("*").eq("vehicle_id", v.id),
        supabase
          .from("vehicle_documents")
          .select("*")
          .eq("vehicle_id", v.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("vehicle_history")
          .select("*")
          .eq("vehicle_id", v.id)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    let driver: any = null;
    if (v.current_driver_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .eq("user_id", v.current_driver_id)
        .maybeSingle();
      driver = p;
    }
    return {
      vehicle: v,
      details: details ?? null,
      condition: cond ?? null,
      maintenance: maint ?? [],
      documents: docs ?? [],
      history: history ?? [],
      driver,
    };
  });

// ---------- Create vehicle ----------
export const createVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        name: z.string().min(1),
        brand: z.string().optional().nullable(),
        model: z.string().optional().nullable(),
        plate: z.string().optional().nullable(),
        year: z.number().int().optional().nullable(),
        color: z.string().optional().nullable(),
        vehicle_code: z.string().optional().nullable(),
        engine_hp: z.number().int().optional().nullable(),
        engine_torque_nm: z.number().int().optional().nullable(),
        gearbox: z.string().optional().nullable(),
        fuel_tank_l: z.number().int().optional().nullable(),
        location: z.string().optional().nullable(),
        game: z.enum(["ets2", "ats"]).optional().nullable(),
        dlc: z.array(z.string()).optional(),
        image_url: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        purchase_price: z.number().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId, data.vtcId);

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .insert({
        vtc_id: data.vtcId,
        name: data.name,
        brand: data.brand ?? null,
        model: data.model ?? null,
        plate: data.plate ?? null,
        status: "idle",
      })
      .select("*")
      .single();
    if (error) throw dbError(error, "fleet");

    await supabase.from("vehicle_details").insert({
      vehicle_id: vehicle.id,
      vtc_id: data.vtcId,
      year: data.year ?? null,
      color: data.color ?? null,
      vehicle_code: data.vehicle_code ?? null,
      engine_hp: data.engine_hp ?? null,
      engine_torque_nm: data.engine_torque_nm ?? null,
      gearbox: data.gearbox ?? null,
      fuel_tank_l: data.fuel_tank_l ?? null,
      location: data.location ?? null,
      game: data.game ?? null,
      dlc: data.dlc ?? [],
      image_url: data.image_url ?? null,
      notes: data.notes ?? null,
      purchase_price: data.purchase_price ?? null,
    });
    await supabase.from("vehicle_condition").insert({ vehicle_id: vehicle.id, vtc_id: data.vtcId });
    await supabase.from("vehicle_history").insert({
      vehicle_id: vehicle.id,
      vtc_id: data.vtcId,
      event_type: "created",
      actor_id: userId,
      description: `Fahrzeug ${data.name} angelegt`,
    });
    return vehicle;
  });

// ---------- Update vehicle ----------
export const updateVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        base: z
          .object({
            name: z.string().optional(),
            brand: z.string().optional().nullable(),
            model: z.string().optional().nullable(),
            plate: z.string().optional().nullable(),
            status: z.string().optional(),
            current_driver_id: z.string().uuid().nullable().optional(),
          })
          .optional(),
        details: z.record(z.any()).optional(),
        condition: z.record(z.any()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("vehicles")
      .select("vtc_id, status, current_driver_id")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!v) throw new Error("Not found");
    await assertStaff(supabase, userId, v.vtc_id);

    if (data.base && Object.keys(data.base).length) {
      const { error } = await supabase.from("vehicles").update(data.base).eq("id", data.vehicleId);
      if (error) throw dbError(error, "fleet");
      if (data.base.status && data.base.status !== v.status) {
        await supabase.from("vehicle_history").insert({
          vehicle_id: data.vehicleId,
          vtc_id: v.vtc_id,
          event_type: "status_changed",
          actor_id: userId,
          description: `Status: ${v.status} → ${data.base.status}`,
        });
      }
    }
    if (data.details) {
      await supabase
        .from("vehicle_details")
        .upsert({ vehicle_id: data.vehicleId, vtc_id: v.vtc_id, ...data.details });
    }
    if (data.condition) {
      await supabase
        .from("vehicle_condition")
        .upsert({ vehicle_id: data.vehicleId, vtc_id: v.vtc_id, ...data.condition });
    }
    return { ok: true };
  });

// ---------- Assign / release driver ----------
export const assignDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        driverId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("vehicles")
      .select("vtc_id, current_driver_id, name")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!v) throw new Error("Not found");
    await assertStaff(supabase, userId, v.vtc_id);

    const nextStatus = data.driverId ? "assigned" : "idle";
    const { error } = await supabase
      .from("vehicles")
      .update({ current_driver_id: data.driverId, status: nextStatus })
      .eq("id", data.vehicleId);
    if (error) throw dbError(error, "fleet");

    await supabase.from("vehicle_history").insert({
      vehicle_id: data.vehicleId,
      vtc_id: v.vtc_id,
      event_type: data.driverId ? "assigned" : "released",
      actor_id: userId,
      driver_id: data.driverId,
      description: data.driverId
        ? `Fahrzeug zugewiesen`
        : `Fahrzeug freigegeben (war: ${v.current_driver_id ?? "—"})`,
    });
    return { ok: true };
  });

// ---------- Delete vehicle ----------
export const deleteVehicle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vehicleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("vehicles")
      .select("vtc_id")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!v) throw new Error("Not found");
    await assertStaff(supabase, userId, v.vtc_id);
    const { error } = await supabase.from("vehicles").delete().eq("id", data.vehicleId);
    if (error) throw dbError(error, "fleet");
    return { ok: true };
  });

// ---------- Maintenance schedule upsert ----------
export const upsertMaintenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        kind: z.enum(["oil", "inspection", "brakes", "tires", "tuv", "ac", "other"]),
        interval_km: z.number().optional().nullable(),
        interval_days: z.number().int().optional().nullable(),
        last_service_km: z.number().optional().nullable(),
        last_service_at: z.string().optional().nullable(),
        next_due_km: z.number().optional().nullable(),
        next_due_at: z.string().optional().nullable(),
        note: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("vehicles")
      .select("vtc_id")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!v) throw new Error("Not found");
    await assertStaff(supabase, userId, v.vtc_id);
    const { vehicleId, ...rest } = data;
    const { error } = await supabase
      .from("vehicle_maintenance_schedule")
      .upsert(
        { vehicle_id: vehicleId, vtc_id: v.vtc_id, ...rest },
        { onConflict: "vehicle_id,kind" },
      );
    if (error) throw dbError(error, "fleet");
    return { ok: true };
  });

// ---------- Add history note ----------
export const addHistoryNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vehicleId: z.string().uuid(),
        event_type: z.enum([
          "assigned",
          "released",
          "reserved",
          "driver_changed",
          "fuel",
          "service",
          "repair",
          "damage",
          "status_changed",
          "odometer",
          "note",
        ]),
        description: z.string().min(1),
        cost: z.number().optional().nullable(),
        odometer_km: z.number().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("vehicles")
      .select("vtc_id")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!v) throw new Error("Not found");
    await assertStaff(supabase, userId, v.vtc_id);
    const { vehicleId, ...rest } = data;
    const { error } = await supabase
      .from("vehicle_history")
      .insert({ vehicle_id: vehicleId, vtc_id: v.vtc_id, actor_id: userId, ...rest });
    if (error) throw dbError(error, "fleet");
    return { ok: true };
  });

// ---------- Fleet KPIs ----------
export const getFleetKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("vehicles")
      .select("status")
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "fleet");
    const total = rows?.length ?? 0;
    const by = (s: string) => (rows ?? []).filter((r: any) => r.status === s).length;
    return {
      total,
      idle: by("idle"),
      assigned: by("assigned"),
      driving: by("driving"),
      maintenance: by("maintenance"),
      retired: by("retired"),
    };
  });

// ---------- List drivers of VTC (for assign dialog) ----------
export const listVtcDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("vtc_members")
      .select("user_id, role")
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "fleet");
    const ids = (members ?? []).map((m) => m.user_id);
    if (!ids.length) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ids);
    const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
    return (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      display_name: (map.get(m.user_id) as any)?.display_name ?? "Fahrer",
      avatar_url: (map.get(m.user_id) as any)?.avatar_url ?? null,
    }));
  });

// ---------- Upload signed URL for vehicle image (returns storage path, image uploaded client-side) ----------
export const setVehicleImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ vehicleId: z.string().uuid(), imageUrl: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v } = await supabase
      .from("vehicles")
      .select("vtc_id")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (!v) throw new Error("Not found");
    await assertStaff(supabase, userId, v.vtc_id);
    const { error } = await supabase
      .from("vehicle_details")
      .upsert({ vehicle_id: data.vehicleId, vtc_id: v.vtc_id, image_url: data.imageUrl });
    if (error) throw dbError(error, "fleet");
    return { ok: true };
  });
