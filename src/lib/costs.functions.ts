import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

/* =============================================================
 * Types
 * ============================================================= */
export type FuelLog = {
  id: string;
  vtc_id: string;
  driver_id: string | null;
  vehicle_id: string | null;
  game: string | null;
  liters: number;
  price_per_liter: number;
  total_cost: number;
  fuel_level_pct: number | null;
  odometer_km: number | null;
  station: string | null;
  notes: string | null;
  occurred_at: string;
  driver_name?: string | null;
  vehicle_label?: string | null;
};

export type ServiceLog = {
  id: string;
  vtc_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  service_type: "oil" | "tires" | "tuv" | "brakes" | "inspection" | "engine" | "gearbox" | "other";
  workshop: string | null;
  cost: number;
  odometer_km: number | null;
  responsible_id: string | null;
  notes: string | null;
  occurred_at: string;
  vehicle_label?: string | null;
  responsible_name?: string | null;
};

export type DamageLog = {
  id: string;
  vtc_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  job_id: string | null;
  damage_type: string;
  damage_pct: number | null;
  repair_cost: number;
  cause: string | null;
  screenshot_url: string | null;
  insurance_status: "none" | "pending" | "approved" | "denied";
  work_status: "open" | "in_progress" | "done";
  notes: string | null;
  occurred_at: string;
  vehicle_label?: string | null;
  driver_name?: string | null;
};

export type CostSettings = {
  vtc_id: string;
  default_fuel_price: number;
  oil_interval_km: number;
  tire_interval_km: number;
  inspection_interval_km: number;
  brake_interval_km: number;
  tuv_interval_days: number;
  damage_rate_per_pct: number;
  tax_rate: number;
  notifications_enabled: boolean;
  notify_oil: boolean;
  notify_tires: boolean;
  notify_inspection: boolean;
  notify_brakes: boolean;
  notify_tuv: boolean;
  notify_high_consumption: boolean;
  notify_high_repair: boolean;
};

/* =============================================================
 * Helpers
 * ============================================================= */
async function assertMember(supabase: any, userId: string, vtcId: string) {
  const { data } = await supabase
    .from("vtc_members")
    .select("role")
    .eq("vtc_id", vtcId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Kein Zugriff auf diese VTC");
  return data.role as string;
}

async function decorateNames(supabase: any, rows: any[]) {
  const driverIds = new Set<string>();
  const vehicleIds = new Set<string>();
  const respIds = new Set<string>();
  for (const r of rows) {
    if (r.driver_id) driverIds.add(r.driver_id);
    if (r.vehicle_id) vehicleIds.add(r.vehicle_id);
    if (r.responsible_id) respIds.add(r.responsible_id);
  }
  const allUserIds = [...new Set([...driverIds, ...respIds])];
  const names: Record<string, string> = {};
  if (allUserIds.length) {
    const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", allUserIds);
    for (const p of data ?? []) names[p.user_id] = p.display_name ?? "Fahrer";
  }
  const vehicles: Record<string, string> = {};
  if (vehicleIds.size) {
    const { data } = await supabase.from("vehicles").select("id, brand, model, plate").in("id", [...vehicleIds]);
    for (const v of data ?? []) {
      const label = [v.brand, v.model].filter(Boolean).join(" ") || v.plate || "Fahrzeug";
      vehicles[v.id] = v.plate ? `${label} (${v.plate})` : label;
    }
  }
  return rows.map((r: any) => ({
    ...r,
    driver_name: r.driver_id ? names[r.driver_id] ?? null : null,
    responsible_name: r.responsible_id ? names[r.responsible_id] ?? null : null,
    vehicle_label: r.vehicle_id ? vehicles[r.vehicle_id] ?? null : null,
  }));
}

/* =============================================================
 * DASHBOARD & OVERVIEW
 * ============================================================= */
export const getCostDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        rangeDays: z.number().int().min(1).max(3650).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const now = new Date();
    const since = new Date(now.getTime() - data.rangeDays * 86400000).toISOString();
    const sinceDay = new Date(now); sinceDay.setHours(0, 0, 0, 0);
    const sinceMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sinceYear = new Date(now.getFullYear(), 0, 1);

    const [fuelRes, serviceRes, damageRes, jobsRes] = await Promise.all([
      (supabase as any).from("vtc_fuel_logs").select("total_cost, liters, occurred_at").eq("vtc_id", data.vtcId).gte("occurred_at", since),
      (supabase as any).from("vtc_service_logs").select("cost, service_type, occurred_at").eq("vtc_id", data.vtcId).gte("occurred_at", since),
      (supabase as any).from("vtc_damage_logs").select("repair_cost, occurred_at").eq("vtc_id", data.vtcId).gte("occurred_at", since),
      supabase.from("jobs").select("revenue, distance_km, delivered_at, status").eq("vtc_id", data.vtcId).eq("status", "approved").gte("delivered_at", since),
    ]);

    const fuelRows = (fuelRes.data ?? []) as any[];
    const serviceRows = (serviceRes.data ?? []) as any[];
    const damageRows = (damageRes.data ?? []) as any[];
    const jobRows = (jobsRes.data ?? []) as any[];

    const sum = (arr: any[], k: string) => arr.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const sumWhere = (arr: any[], k: string, filter: (r: any) => boolean) =>
      arr.filter(filter).reduce((s, r) => s + Number(r[k] ?? 0), 0);

    const fuelCost = sum(fuelRows, "total_cost");
    const repairCost = sum(damageRows, "repair_cost");
    const tiresCost = sumWhere(serviceRows, "cost", (r) => r.service_type === "tires");
    const maintenanceCost = sumWhere(serviceRows, "cost", (r) => r.service_type !== "tires");
    const otherCost = 0; // reserve
    const totalCost = fuelCost + repairCost + tiresCost + maintenanceCost + otherCost;
    const revenue = sum(jobRows, "revenue");
    const km = sum(jobRows, "distance_km");
    const profit = revenue - totalCost;

    // Day/Month/Year revenue & profit windows
    const inWindow = (row: any, from: Date) => new Date(row.delivered_at ?? row.occurred_at ?? 0) >= from;
    const revenueDay = sumWhere(jobRows, "revenue", (r) => inWindow(r, sinceDay));
    const revenueMonth = sumWhere(jobRows, "revenue", (r) => inWindow(r, sinceMonth));
    const revenueYear = sumWhere(jobRows, "revenue", (r) => inWindow(r, sinceYear));

    const costsIn = (from: Date) =>
      sumWhere(fuelRows, "total_cost", (r) => inWindow(r, from)) +
      sumWhere(serviceRows, "cost", (r) => inWindow(r, from)) +
      sumWhere(damageRows, "repair_cost", (r) => inWindow(r, from));
    const profitDay = revenueDay - costsIn(sinceDay);
    const profitMonth = revenueMonth - costsIn(sinceMonth);
    const profitYear = revenueYear - costsIn(sinceYear);

    // Daily series
    const days = Array.from({ length: data.rangeDays }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (data.rangeDays - 1 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });
    const series = days.map((d) => {
      const nxt = new Date(d.getTime() + 86400000);
      const inRange = (row: any, k: string) => {
        const t = new Date(row[k] ?? 0);
        return t >= d && t < nxt;
      };
      const dayRevenue = jobRows.filter((r) => inRange(r, "delivered_at")).reduce((s, r) => s + Number(r.revenue ?? 0), 0);
      const dayFuel = fuelRows.filter((r) => inRange(r, "occurred_at")).reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
      const dayService = serviceRows.filter((r) => inRange(r, "occurred_at")).reduce((s, r) => s + Number(r.cost ?? 0), 0);
      const dayDamage = damageRows.filter((r) => inRange(r, "occurred_at")).reduce((s, r) => s + Number(r.repair_cost ?? 0), 0);
      const dayCosts = dayFuel + dayService + dayDamage;
      return {
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
        revenue: Math.round(dayRevenue * 100) / 100,
        costs: Math.round(dayCosts * 100) / 100,
        profit: Math.round((dayRevenue - dayCosts) * 100) / 100,
      };
    });

    const costPerKm = km > 0 ? totalCost / km : 0;
    const profitPerKm = km > 0 ? profit / km : 0;
    const economyIndex = revenue > 0 ? Math.max(0, Math.min(100, Math.round((profit / revenue) * 100))) : 0;

    return {
      fuelCost, repairCost, tiresCost, maintenanceCost, otherCost, totalCost,
      revenue, profit, km,
      revenueDay, revenueMonth, revenueYear,
      profitDay, profitMonth, profitYear,
      costPerKm, profitPerKm, economyIndex,
      series,
      breakdown: [
        { key: "fuel", label: "Kraftstoff", value: Math.round(fuelCost * 100) / 100 },
        { key: "repair", label: "Reparaturen", value: Math.round(repairCost * 100) / 100 },
        { key: "maintenance", label: "Wartung", value: Math.round(maintenanceCost * 100) / 100 },
        { key: "tires", label: "Reifen", value: Math.round(tiresCost * 100) / 100 },
      ],
    };
  });

/* =============================================================
 * FUEL LOGS
 * ============================================================= */
const fuelListSchema = z.object({
  vtcId: z.string().uuid(),
  search: z.string().trim().max(120).optional(),
  driverId: z.string().uuid().optional().nullable(),
  vehicleId: z.string().uuid().optional().nullable(),
  game: z.string().max(20).optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const listFuelLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fuelListSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    let q = (supabase as any).from("vtc_fuel_logs").select("*", { count: "exact" }).eq("vtc_id", data.vtcId);
    if (data.driverId) q = q.eq("driver_id", data.driverId);
    if (data.vehicleId) q = q.eq("vehicle_id", data.vehicleId);
    if (data.game) q = q.eq("game", data.game);
    if (data.search) q = q.ilike("station", `%${data.search}%`);
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await q.order("occurred_at", { ascending: false }).range(from, to);
    if (error) throw dbError(error, "costs");
    const decorated = await decorateNames(supabase, rows ?? []);
    return { rows: decorated as FuelLog[], total: count ?? 0 };
  });

export const upsertFuelLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        vtcId: z.string().uuid(),
        driverId: z.string().uuid().optional().nullable(),
        vehicleId: z.string().uuid().optional().nullable(),
        game: z.string().max(20).optional().nullable(),
        liters: z.number().nonnegative(),
        pricePerLiter: z.number().nonnegative(),
        totalCost: z.number().nonnegative().optional(),
        fuelLevelPct: z.number().min(0).max(100).optional().nullable(),
        odometerKm: z.number().nonnegative().optional().nullable(),
        station: z.string().max(120).optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
        occurredAt: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const payload: any = {
      vtc_id: data.vtcId,
      driver_id: data.driverId ?? userId,
      vehicle_id: data.vehicleId ?? null,
      game: data.game ?? null,
      liters: data.liters,
      price_per_liter: data.pricePerLiter,
      total_cost: data.totalCost ?? Number((data.liters * data.pricePerLiter).toFixed(2)),
      fuel_level_pct: data.fuelLevelPct ?? null,
      odometer_km: data.odometerKm ?? null,
      station: data.station ?? null,
      notes: data.notes ?? null,
      occurred_at: data.occurredAt ? new Date(data.occurredAt).toISOString() : new Date().toISOString(),
      created_by: userId,
    };
    if (data.id) {
      const { error } = await (supabase as any).from("vtc_fuel_logs").update(payload).eq("id", data.id);
      if (error) throw dbError(error, "costs");
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await (supabase as any).from("vtc_fuel_logs").insert(payload).select("id").single();
    if (error) throw dbError(error, "costs");
    return { ok: true, id: row.id };
  });

export const deleteFuelLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("vtc_fuel_logs").delete().eq("id", data.id);
    if (error) throw dbError(error, "costs");
    return { ok: true };
  });

/* =============================================================
 * SERVICE LOGS
 * ============================================================= */
export const listServiceLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        search: z.string().trim().max(120).optional(),
        serviceType: z.string().max(20).optional(),
        vehicleId: z.string().uuid().optional().nullable(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    let q = (supabase as any).from("vtc_service_logs").select("*", { count: "exact" }).eq("vtc_id", data.vtcId);
    if (data.serviceType) q = q.eq("service_type", data.serviceType);
    if (data.vehicleId) q = q.eq("vehicle_id", data.vehicleId);
    if (data.search) q = q.ilike("workshop", `%${data.search}%`);
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await q.order("occurred_at", { ascending: false }).range(from, to);
    if (error) throw dbError(error, "costs");
    const decorated = await decorateNames(supabase, rows ?? []);
    return { rows: decorated as ServiceLog[], total: count ?? 0 };
  });

export const upsertServiceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        vtcId: z.string().uuid(),
        vehicleId: z.string().uuid().optional().nullable(),
        driverId: z.string().uuid().optional().nullable(),
        serviceType: z.enum(["oil", "tires", "tuv", "brakes", "inspection", "engine", "gearbox", "other"]),
        workshop: z.string().max(120).optional().nullable(),
        cost: z.number().nonnegative().default(0),
        odometerKm: z.number().nonnegative().optional().nullable(),
        responsibleId: z.string().uuid().optional().nullable(),
        notes: z.string().max(2000).optional().nullable(),
        occurredAt: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const payload: any = {
      vtc_id: data.vtcId,
      vehicle_id: data.vehicleId ?? null,
      driver_id: data.driverId ?? null,
      service_type: data.serviceType,
      workshop: data.workshop ?? null,
      cost: data.cost,
      odometer_km: data.odometerKm ?? null,
      responsible_id: data.responsibleId ?? userId,
      notes: data.notes ?? null,
      occurred_at: data.occurredAt ? new Date(data.occurredAt).toISOString() : new Date().toISOString(),
      created_by: userId,
    };
    if (data.id) {
      const { error } = await (supabase as any).from("vtc_service_logs").update(payload).eq("id", data.id);
      if (error) throw dbError(error, "costs");
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await (supabase as any).from("vtc_service_logs").insert(payload).select("id").single();
    if (error) throw dbError(error, "costs");
    return { ok: true, id: row.id };
  });

export const deleteServiceLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("vtc_service_logs").delete().eq("id", data.id);
    if (error) throw dbError(error, "costs");
    return { ok: true };
  });

/* =============================================================
 * DAMAGE LOGS
 * ============================================================= */
export const listDamageLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        search: z.string().trim().max(120).optional(),
        workStatus: z.string().max(20).optional(),
        insuranceStatus: z.string().max(20).optional(),
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(200).default(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    let q = (supabase as any).from("vtc_damage_logs").select("*", { count: "exact" }).eq("vtc_id", data.vtcId);
    if (data.workStatus) q = q.eq("work_status", data.workStatus);
    if (data.insuranceStatus) q = q.eq("insurance_status", data.insuranceStatus);
    if (data.search) q = q.ilike("damage_type", `%${data.search}%`);
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    const { data: rows, error, count } = await q.order("occurred_at", { ascending: false }).range(from, to);
    if (error) throw dbError(error, "costs");
    const decorated = await decorateNames(supabase, rows ?? []);
    return { rows: decorated as DamageLog[], total: count ?? 0 };
  });

export const upsertDamageLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        vtcId: z.string().uuid(),
        vehicleId: z.string().uuid().optional().nullable(),
        driverId: z.string().uuid().optional().nullable(),
        jobId: z.string().uuid().optional().nullable(),
        damageType: z.string().min(1).max(120),
        damagePct: z.number().min(0).max(100).optional().nullable(),
        repairCost: z.number().nonnegative().default(0),
        cause: z.string().max(500).optional().nullable(),
        screenshotUrl: z.string().url().max(500).optional().nullable(),
        insuranceStatus: z.enum(["none", "pending", "approved", "denied"]).default("none"),
        workStatus: z.enum(["open", "in_progress", "done"]).default("open"),
        notes: z.string().max(2000).optional().nullable(),
        occurredAt: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const payload: any = {
      vtc_id: data.vtcId,
      vehicle_id: data.vehicleId ?? null,
      driver_id: data.driverId ?? userId,
      job_id: data.jobId ?? null,
      damage_type: data.damageType,
      damage_pct: data.damagePct ?? null,
      repair_cost: data.repairCost,
      cause: data.cause ?? null,
      screenshot_url: data.screenshotUrl ?? null,
      insurance_status: data.insuranceStatus,
      work_status: data.workStatus,
      notes: data.notes ?? null,
      occurred_at: data.occurredAt ? new Date(data.occurredAt).toISOString() : new Date().toISOString(),
      created_by: userId,
    };
    if (data.id) {
      const { error } = await (supabase as any).from("vtc_damage_logs").update(payload).eq("id", data.id);
      if (error) throw dbError(error, "costs");
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await (supabase as any).from("vtc_damage_logs").insert(payload).select("id").single();
    if (error) throw dbError(error, "costs");
    return { ok: true, id: row.id };
  });

export const deleteDamageLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("vtc_damage_logs").delete().eq("id", data.id);
    if (error) throw dbError(error, "costs");
    return { ok: true };
  });

/* =============================================================
 * DRIVER BREAKDOWN & RANKINGS
 * ============================================================= */
export const getDriverCostBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ vtcId: z.string().uuid(), rangeDays: z.number().int().min(1).max(3650).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const since = new Date(Date.now() - data.rangeDays * 86400000).toISOString();

    const [fuelRes, serviceRes, damageRes, jobsRes, membersRes] = await Promise.all([
      (supabase as any).from("vtc_fuel_logs").select("driver_id, total_cost, liters, odometer_km").eq("vtc_id", data.vtcId).gte("occurred_at", since),
      (supabase as any).from("vtc_service_logs").select("driver_id, service_type, cost").eq("vtc_id", data.vtcId).gte("occurred_at", since),
      (supabase as any).from("vtc_damage_logs").select("driver_id, repair_cost").eq("vtc_id", data.vtcId).gte("occurred_at", since),
      supabase.from("jobs").select("driver_id, revenue, distance_km").eq("vtc_id", data.vtcId).eq("status", "approved").gte("delivered_at", since),
      supabase.from("vtc_members").select("user_id").eq("vtc_id", data.vtcId),
    ]);

    const rows = new Map<string, any>();
    const ensure = (uid: string | null) => {
      const k = uid ?? "unknown";
      if (!rows.has(k)) {
        rows.set(k, {
          user_id: k,
          display_name: null as string | null,
          avatar_url: null as string | null,
          fuel: 0, tires: 0, maintenance: 0, damage: 0, other: 0,
          liters: 0, km: 0, revenue: 0, jobs: 0,
        });
      }
      return rows.get(k);
    };

    for (const uid of (membersRes.data ?? []).map((m: any) => m.user_id)) ensure(uid);
    for (const r of fuelRes.data ?? []) {
      const b = ensure(r.driver_id);
      b.fuel += Number(r.total_cost ?? 0);
      b.liters += Number(r.liters ?? 0);
    }
    for (const r of serviceRes.data ?? []) {
      const b = ensure(r.driver_id);
      if (r.service_type === "tires") b.tires += Number(r.cost ?? 0);
      else b.maintenance += Number(r.cost ?? 0);
    }
    for (const r of damageRes.data ?? []) {
      const b = ensure(r.driver_id);
      b.damage += Number(r.repair_cost ?? 0);
    }
    for (const r of jobsRes.data ?? []) {
      const b = ensure(r.driver_id);
      b.revenue += Number(r.revenue ?? 0);
      b.km += Number(r.distance_km ?? 0);
      b.jobs += 1;
    }

    const userIds = [...rows.keys()].filter((k) => k !== "unknown");
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
      for (const p of profs ?? []) {
        const b = rows.get(p.user_id);
        if (b) {
          b.display_name = p.display_name;
          b.avatar_url = p.avatar_url;
        }
      }
    }

    const result = [...rows.values()].map((b: any) => {
      const totalCost = b.fuel + b.tires + b.maintenance + b.damage + b.other;
      const profit = b.revenue - totalCost;
      const consumption = b.km > 0 ? (b.liters / b.km) * 100 : 0; // L/100km (only from logged fuel)
      const economy = b.revenue > 0 ? Math.max(0, Math.min(100, Math.round((profit / b.revenue) * 100))) : 0;
      const rating = Math.max(0, Math.min(5, Math.round((economy / 20) * 10) / 10));
      return {
        ...b,
        total_cost: Math.round(totalCost * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        consumption: Math.round(consumption * 10) / 10,
        profit_per_km: b.km > 0 ? Math.round((profit / b.km) * 100) / 100 : 0,
        cost_per_km: b.km > 0 ? Math.round((totalCost / b.km) * 100) / 100 : 0,
        economy,
        rating,
      };
    });

    result.sort((a, b) => b.profit - a.profit);
    return result;
  });

/* =============================================================
 * SETTINGS
 * ============================================================= */
export const getCostSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const { data: row } = await (supabase as any).from("vtc_cost_settings").select("*").eq("vtc_id", data.vtcId).maybeSingle();
    if (row) return row as CostSettings;
    return {
      vtc_id: data.vtcId,
      default_fuel_price: 1.82,
      oil_interval_km: 50000,
      tire_interval_km: 120000,
      inspection_interval_km: 100000,
      brake_interval_km: 80000,
      tuv_interval_days: 365,
      damage_rate_per_pct: 100,
      tax_rate: 0,
      notifications_enabled: true,
      notify_oil: true, notify_tires: true, notify_inspection: true,
      notify_brakes: true, notify_tuv: true,
      notify_high_consumption: true, notify_high_repair: true,
    } as CostSettings;
  });

export const saveCostSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        defaultFuelPrice: z.number().nonnegative(),
        oilIntervalKm: z.number().int().nonnegative(),
        tireIntervalKm: z.number().int().nonnegative(),
        inspectionIntervalKm: z.number().int().nonnegative(),
        brakeIntervalKm: z.number().int().nonnegative(),
        tuvIntervalDays: z.number().int().nonnegative(),
        damageRatePerPct: z.number().nonnegative(),
        taxRate: z.number().min(0).max(100),
        notificationsEnabled: z.boolean(),
        notifyOil: z.boolean(),
        notifyTires: z.boolean(),
        notifyInspection: z.boolean(),
        notifyBrakes: z.boolean(),
        notifyTuv: z.boolean(),
        notifyHighConsumption: z.boolean(),
        notifyHighRepair: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload: any = {
      vtc_id: data.vtcId,
      default_fuel_price: data.defaultFuelPrice,
      oil_interval_km: data.oilIntervalKm,
      tire_interval_km: data.tireIntervalKm,
      inspection_interval_km: data.inspectionIntervalKm,
      brake_interval_km: data.brakeIntervalKm,
      tuv_interval_days: data.tuvIntervalDays,
      damage_rate_per_pct: data.damageRatePerPct,
      tax_rate: data.taxRate,
      notifications_enabled: data.notificationsEnabled,
      notify_oil: data.notifyOil,
      notify_tires: data.notifyTires,
      notify_inspection: data.notifyInspection,
      notify_brakes: data.notifyBrakes,
      notify_tuv: data.notifyTuv,
      notify_high_consumption: data.notifyHighConsumption,
      notify_high_repair: data.notifyHighRepair,
    };
    const { error } = await (context.supabase as any).from("vtc_cost_settings").upsert(payload, { onConflict: "vtc_id" });
    if (error) throw dbError(error, "costs");
    return { ok: true };
  });

/* =============================================================
 * LIST HELPERS (drivers, vehicles) for form selectors
 * ============================================================= */
export const listVtcDriversAndVehicles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertMember(supabase, userId, data.vtcId);
    const { data: members } = await supabase.from("vtc_members").select("user_id, role").eq("vtc_id", data.vtcId);
    const ids = (members ?? []).map((m: any) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", ids)
      : { data: [] as any[] };
    const { data: vehicles } = await supabase.from("vehicles").select("id, brand, model, plate").eq("vtc_id", data.vtcId).order("created_at", { ascending: false });
    const drivers = (members ?? []).map((m: any) => {
      const p = (profs ?? []).find((x: any) => x.user_id === m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        display_name: p?.display_name ?? "Fahrer",
        avatar_url: p?.avatar_url ?? null,
      };
    });
    return {
      drivers,
      vehicles: (vehicles ?? []).map((v: any) => ({
        id: v.id,
        label: [v.brand, v.model].filter(Boolean).join(" ") + (v.plate ? ` (${v.plate})` : ""),
      })),
    };
  });
