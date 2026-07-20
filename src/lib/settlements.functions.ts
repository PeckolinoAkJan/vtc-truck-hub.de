import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

const settlementStatuses = [
  "draft",
  "pending",
  "ready",
  "approved",
  "paid",
  "disputed",
  "archived",
] as const;
const payModels = ["per_km", "per_job", "fixed", "manual"] as const;
const adjKinds = ["bonus", "deduction"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function assertAdmin(
  supabase: SB,
  vtcId: string,
  userId: string,
): Promise<"owner" | "admin" | "dispatcher"> {
  const { data } = await supabase
    .from("vtc_members")
    .select("role")
    .eq("vtc_id", vtcId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = data?.role;
  if (role !== "owner" && role !== "admin" && role !== "dispatcher") {
    throw new Error("Forbidden");
  }
  return role;
}

async function logActivity(
  supabase: SB,
  settlementId: string,
  actorId: string,
  action: string,
  meta: Record<string, unknown> = {},
) {
  await supabase.from("settlement_activity").insert({
    settlement_id: settlementId,
    actor_id: actorId,
    action,
    meta,
  });
}


// -------- KPIs --------
export const getSettlementsKpis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("settlements")
      .select("status, final_amount, base_pay, jobs_count, paid_at")
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "settlements");

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let total = 0;
    let pending = 0;
    let readyAmount = 0;
    let paidMonth = 0;
    let avgDriverPay = 0;
    let paidCount = 0;
    let totalJobs = 0;

    for (const r of rows ?? []) {
      total += 1;
      if (r.status === "pending" || r.status === "ready") pending += 1;
      if (r.status === "ready" || r.status === "approved")
        readyAmount += Number(r.final_amount ?? 0);
      if (
        r.status === "paid" &&
        r.paid_at &&
        new Date(r.paid_at) >= monthStart
      ) {
        paidMonth += Number(r.final_amount ?? 0);
      }
      if (r.status === "paid") {
        paidCount += 1;
        avgDriverPay += Number(r.final_amount ?? 0);
      }
      totalJobs += Number(r.jobs_count ?? 0);
    }

    const { count: disputesOpen } = await supabase
      .from("settlement_disputes")
      .select("id", { head: true, count: "exact" })
      .neq("status", "resolved")
      .in(
        "settlement_id",
        (rows ?? []).length === 0 ? ["00000000-0000-0000-0000-000000000000"] : [],
      );
    // Fallback: count disputes joined via settlements of this vtc
    const { data: openDisputes } = await supabase
      .from("settlement_disputes")
      .select("id, settlements!inner(vtc_id, status)")
      .neq("status", "resolved")
      .eq("settlements.vtc_id", data.vtcId);

    return {
      total,
      pending,
      readyAmount,
      paidMonth,
      disputesOpen: openDisputes?.length ?? disputesOpen ?? 0,
      avgDriverPay: paidCount ? avgDriverPay / paidCount : 0,
      totalJobs,
    };
  });

// -------- List --------
export const listSettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        status: z.enum(["all", ...settlementStatuses]).default("all"),
        driverId: z.string().uuid().optional(),
        payModel: z.enum(["all", ...payModels]).default("all"),
        search: z.string().default(""),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("settlements")
      .select(
        "id, number, driver_id, period_start, period_end, jobs_count, total_km, base_pay, bonus_total, deduction_total, final_amount, status, pay_model, created_at",
        { count: "exact" },
      )
      .eq("vtc_id", data.vtcId);

    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.driverId) q = q.eq("driver_id", data.driverId);
    if (data.payModel !== "all") q = q.eq("pay_model", data.payModel);
    if (data.from) q = q.gte("period_start", data.from);
    if (data.to) q = q.lte("period_end", data.to);
    if (data.search.trim()) {
      const s = data.search.trim();
      q = q.or(`number.ilike.%${s}%`);
    }

    const from = (data.page - 1) * data.pageSize;
    q = q.range(from, from + data.pageSize - 1).order("created_at", { ascending: false });

    const { data: rows, error, count } = await q;
    if (error) throw dbError(error, "settlements");

    // Status counts (per tab)
    const { data: statusRows } = await supabase
      .from("settlements")
      .select("status")
      .eq("vtc_id", data.vtcId);
    const counts: Record<string, number> = { all: statusRows?.length ?? 0 };
    for (const s of settlementStatuses) counts[s] = 0;
    for (const r of statusRows ?? []) counts[r.status] = (counts[r.status] ?? 0) + 1;

    // Fetch driver names
    const driverIds = Array.from(new Set((rows ?? []).map((r) => r.driver_id)));
    let profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", driverIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.user_id,
          { display_name: p.display_name ?? "Fahrer", avatar_url: p.avatar_url ?? null },
        ]),
      );
    }

    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        driver_name: profiles[r.driver_id]?.display_name ?? "Fahrer",
        driver_avatar: profiles[r.driver_id]?.avatar_url ?? null,
        base_pay: Number(r.base_pay ?? 0),
        bonus_total: Number(r.bonus_total ?? 0),
        deduction_total: Number(r.deduction_total ?? 0),
        final_amount: Number(r.final_amount ?? 0),
        total_km: Number(r.total_km ?? 0),
      })),
      counts,
      total: count ?? 0,
    };
  });

// -------- Get one --------
export const getSettlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: s, error } = await supabase
      .from("settlements")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw dbError(error, "settlements");
    if (!s) throw new Error("Nicht gefunden");

    const [{ data: profile }, { data: adjustments }, { data: disputes }, { data: activity }, { data: sjobs }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", s.driver_id)
          .maybeSingle(),
        supabase
          .from("settlement_adjustments")
          .select("*")
          .eq("settlement_id", data.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("settlement_disputes")
          .select("*")
          .eq("settlement_id", data.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("settlement_activity")
          .select("*")
          .eq("settlement_id", data.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("settlement_jobs")
          .select("job_id, jobs(id, source_city, dest_city, cargo, distance_km, revenue, submitted_at)")
          .eq("settlement_id", data.id),
      ]);

    return {
      settlement: {
        ...s,
        base_pay: Number(s.base_pay ?? 0),
        bonus_total: Number(s.bonus_total ?? 0),
        deduction_total: Number(s.deduction_total ?? 0),
        final_amount: Number(s.final_amount ?? 0),
        total_km: Number(s.total_km ?? 0),
      },
      driver: {
        display_name: profile?.display_name ?? "Fahrer",
        avatar_url: profile?.avatar_url ?? null,
      },
      adjustments: (adjustments ?? []).map((a) => ({ ...a, amount: Number(a.amount) })),
      disputes: disputes ?? [],
      activity: activity ?? [],
      jobs: (sjobs ?? []).map((sj) => sj.jobs).filter(Boolean),
    };
  });

// -------- Create --------
export const createSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        driverId: z.string().uuid(),
        from: z.string(),
        to: z.string(),
        payModel: z.enum(payModels).default("manual"),
        basePay: z.number().nonnegative().default(0),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, data.vtcId, userId);

    // Gather approved unpaid jobs in period
    const { data: jobs, error: jerr } = await supabase
      .from("jobs")
      .select("id, distance_km, revenue, submitted_at")
      .eq("vtc_id", data.vtcId)
      .eq("driver_id", data.driverId)
      .eq("status", "approved")
      .is("paid_at", null)
      .gte("submitted_at", data.from)
      .lte("submitted_at", `${data.to}T23:59:59.999Z`);
    if (jerr) throw dbError(jerr, "settlements");

    const totalKm = (jobs ?? []).reduce((s, j) => s + Number(j.distance_km ?? 0), 0);
    const totalRev = (jobs ?? []).reduce((s, j) => s + Number(j.revenue ?? 0), 0);

    let base = data.basePay;
    if (data.payModel === "per_km") base = Math.round(totalKm * 0.5);
    else if (data.payModel === "per_job") base = Math.round((jobs?.length ?? 0) * 250);
    else if (data.payModel === "fixed") base = data.basePay;

    const { data: created, error } = await supabase
      .from("settlements")
      .insert({
        vtc_id: data.vtcId,
        driver_id: data.driverId,
        period_start: data.from,
        period_end: data.to,
        pay_model: data.payModel,
        base_pay: base,
        jobs_count: jobs?.length ?? 0,
        total_km: totalKm,
        note: data.note ?? null,
        created_by: userId,
        status: "draft",
      })
      .select()
      .single();
    if (error) throw dbError(error, "settlements");

    if (jobs && jobs.length) {
      await supabase.from("settlement_jobs").insert(
        jobs.map((j) => ({ settlement_id: created.id, job_id: j.id })),
      );
    }

    await logActivity(supabase, created.id, userId, "created", {
      jobs: jobs?.length ?? 0,
      totalRevenue: totalRev,
      payModel: data.payModel,
    });

    return { id: created.id, number: created.number };
  });

// -------- Update base pay / note --------
export const updateSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        basePay: z.number().nonnegative().optional(),
        note: z.string().max(2000).nullable().optional(),
        payModel: z.enum(payModels).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s } = await supabase
      .from("settlements")
      .select("vtc_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!s) throw new Error("Nicht gefunden");
    await assertAdmin(supabase, s.vtc_id, userId);
    if (s.status === "paid") throw new Error("Bereits ausgezahlt");

    const patch: Record<string, unknown> = {};
    if (data.basePay !== undefined) patch.base_pay = data.basePay;
    if (data.note !== undefined) patch.note = data.note;
    if (data.payModel !== undefined) patch.pay_model = data.payModel;

    const { error } = await (supabase.from("settlements") as SB)
      .update(patch)
      .eq("id", data.id);

    if (error) throw dbError(error, "settlements");
    await logActivity(supabase, data.id, userId, "updated", patch);
    return { ok: true };
  });

// -------- Add / remove adjustment --------
export const addAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        settlementId: z.string().uuid(),
        kind: z.enum(adjKinds),
        category: z.string().min(1).max(60),
        amount: z.number().nonnegative().max(1_000_000),
        note: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s } = await supabase
      .from("settlements")
      .select("vtc_id, status")
      .eq("id", data.settlementId)
      .maybeSingle();
    if (!s) throw new Error("Nicht gefunden");
    await assertAdmin(supabase, s.vtc_id, userId);
    if (s.status === "paid") throw new Error("Bereits ausgezahlt");

    const { error } = await supabase.from("settlement_adjustments").insert({
      settlement_id: data.settlementId,
      kind: data.kind,
      category: data.category,
      amount: data.amount,
      note: data.note ?? null,
      created_by: userId,
    });
    if (error) throw dbError(error, "settlements");
    await logActivity(supabase, data.settlementId, userId, "adjustment_added", {
      kind: data.kind,
      category: data.category,
      amount: data.amount,
    });
    return { ok: true };
  });

export const removeAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: adj } = await supabase
      .from("settlement_adjustments")
      .select("id, settlement_id, settlements!inner(vtc_id, status)")
      .eq("id", data.id)
      .maybeSingle();
    if (!adj) throw new Error("Nicht gefunden");
    const settlement = (adj as unknown as { settlements: { vtc_id: string; status: string } }).settlements;
    await assertAdmin(supabase, settlement.vtc_id, userId);
    if (settlement.status === "paid") throw new Error("Bereits ausgezahlt");
    await supabase.from("settlement_adjustments").delete().eq("id", data.id);
    await logActivity(supabase, adj.settlement_id, userId, "adjustment_removed", { id: data.id });
    return { ok: true };
  });

// -------- Status transitions --------
export const setSettlementStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "ready", "approved", "archived"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: s } = await supabase
      .from("settlements")
      .select("vtc_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!s) throw new Error("Nicht gefunden");
    await assertAdmin(supabase, s.vtc_id, userId);
    if (s.status === "paid") throw new Error("Bereits ausgezahlt");

    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = userId;
    }
    const { error } = await (supabase.from("settlements") as SB).update(patch).eq("id", data.id);
    if (error) throw dbError(error, "settlements");
    await logActivity(supabase, data.id, userId, `status_${data.status}`);
    return { ok: true };
  });

// -------- Mark paid (RPC) --------
export const paySettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("pay_settlement", { _settlement_id: data.id });
    if (error) throw dbError(error, "settlements");
    return { ok: true };
  });

// -------- Disputes --------
export const openDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        settlementId: z.string().uuid(),
        message: z.string().trim().min(3).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("settlement_disputes").insert({
      settlement_id: data.settlementId,
      opened_by: userId,
      message: data.message,
      status: "open",
    });
    if (error) throw dbError(error, "settlements");
    await logActivity(supabase, data.settlementId, userId, "dispute_opened");
    return { ok: true };
  });

export const respondDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        response: z.string().trim().min(1).max(2000),
        resolve: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: dsp } = await supabase
      .from("settlement_disputes")
      .select("id, settlement_id, settlements!inner(vtc_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (!dsp) throw new Error("Nicht gefunden");
    const vtcId = (dsp as unknown as { settlements: { vtc_id: string } }).settlements.vtc_id;
    await assertAdmin(supabase, vtcId, userId);
    const { error } = await supabase
      .from("settlement_disputes")
      .update({
        response: data.response,
        responded_by: userId,
        responded_at: new Date().toISOString(),
        status: data.resolve ? "resolved" : "answered",
      })
      .eq("id", data.id);
    if (error) throw dbError(error, "settlements");
    await logActivity(supabase, dsp.settlement_id, userId, "dispute_response", {
      resolved: data.resolve,
    });
    return { ok: true };
  });

// -------- List drivers of vtc (for selects) --------
export const listVtcDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members } = await supabase
      .from("vtc_members")
      .select("user_id, role")
      .eq("vtc_id", data.vtcId);
    const ids = (members ?? []).map((m) => m.user_id);
    if (!ids.length) return { drivers: [] };
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ids);
    return {
      drivers: (profs ?? []).map((p) => ({
        id: p.user_id,
        display_name: p.display_name ?? "Fahrer",
        avatar_url: p.avatar_url ?? null,
      })),
    };
  });

// -------- Driver: my settlements --------
export const listMySettlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("settlements")
      .select(
        "id, number, vtc_id, period_start, period_end, jobs_count, total_km, base_pay, bonus_total, deduction_total, final_amount, status, created_at",
      )
      .eq("driver_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "settlements");
    return {
      rows: (data ?? []).map((r) => ({
        ...r,
        base_pay: Number(r.base_pay ?? 0),
        bonus_total: Number(r.bonus_total ?? 0),
        deduction_total: Number(r.deduction_total ?? 0),
        final_amount: Number(r.final_amount ?? 0),
        total_km: Number(r.total_km ?? 0),
      })),
    };
  });
