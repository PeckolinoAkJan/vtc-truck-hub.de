import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

export const getFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        "id, driver_id, cargo, revenue, distance_km, payout_amount, paid_at, submitted_at, status",
      )
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "finance");

    const approved = (jobs ?? []).filter((j) => j.status === "approved");
    const totalRevenue = approved.reduce((s, j) => s + Number(j.revenue ?? 0), 0);
    const totalWages = (jobs ?? []).reduce(
      (s, j) => s + Number(j.payout_amount ?? 0),
      0,
    );
    const totalKm = approved.reduce((s, j) => s + Number(j.distance_km ?? 0), 0);

    // monthly series (last 12 months)
    const now = new Date();
    const months: { key: string; label: string; revenue: number; wages: number; profit: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: d.toLocaleDateString("de-DE", { month: "short" }),
        revenue: 0,
        wages: 0,
        profit: 0,
      });
    }
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const j of approved) {
      if (!j.submitted_at) continue;
      const d = new Date(j.submitted_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const i = idx.get(key);
      if (i !== undefined) months[i].revenue += Number(j.revenue ?? 0);
    }
    for (const j of jobs ?? []) {
      if (!j.paid_at) continue;
      const d = new Date(j.paid_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const i = idx.get(key);
      if (i !== undefined) months[i].wages += Number(j.payout_amount ?? 0);
    }
    for (const m of months) m.profit = m.revenue - m.wages;

    // per driver
    const driverAgg = new Map<string, { revenue: number; km: number; jobs: number }>();
    for (const j of approved) {
      const g = driverAgg.get(j.driver_id) ?? { revenue: 0, km: 0, jobs: 0 };
      g.revenue += Number(j.revenue ?? 0);
      g.km += Number(j.distance_km ?? 0);
      g.jobs += 1;
      driverAgg.set(j.driver_id, g);
    }
    const driverIds = Array.from(driverAgg.keys());
    let names: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", driverIds);
      names = Object.fromEntries(
        (profs ?? []).map((p) => [p.user_id, { display_name: p.display_name ?? "Fahrer", avatar_url: p.avatar_url ?? null }]),
      );
    }
    const perDriver = driverIds
      .map((id) => ({
        driver_id: id,
        display_name: names[id]?.display_name ?? "Fahrer",
        avatar_url: names[id]?.avatar_url ?? null,
        ...driverAgg.get(id)!,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // per cargo
    const cargoAgg = new Map<string, { revenue: number; jobs: number; km: number }>();
    for (const j of approved) {
      const c = j.cargo || "Unbekannt";
      const g = cargoAgg.get(c) ?? { revenue: 0, jobs: 0, km: 0 };
      g.revenue += Number(j.revenue ?? 0);
      g.jobs += 1;
      g.km += Number(j.distance_km ?? 0);
      cargoAgg.set(c, g);
    }
    const perCargo = Array.from(cargoAgg.entries())
      .map(([cargo, v]) => ({ cargo, ...v }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totals: { revenue: totalRevenue, wages: totalWages, profit: totalRevenue - totalWages, km: totalKm, jobs: approved.length },
      months,
      perDriver,
      perCargo,
    };
  });

export const getVtcStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("driver_id, cargo, distance_km, submitted_at, status")
      .eq("vtc_id", data.vtcId)
      .eq("status", "approved");
    if (error) throw dbError(error, "finance");

    // km per driver
    const perDriver = new Map<string, number>();
    const cargoCount = new Map<string, { jobs: number; km: number }>();
    for (const j of jobs ?? []) {
      perDriver.set(j.driver_id, (perDriver.get(j.driver_id) ?? 0) + Number(j.distance_km ?? 0));
      const c = j.cargo || "Unbekannt";
      const g = cargoCount.get(c) ?? { jobs: 0, km: 0 };
      g.jobs += 1;
      g.km += Number(j.distance_km ?? 0);
      cargoCount.set(c, g);
    }

    const driverIds = Array.from(perDriver.keys());
    let names: Record<string, string> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", driverIds);
      names = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p.display_name ?? "Fahrer"]));
    }
    const kmPerDriver = driverIds
      .map((id) => ({ driver_id: id, display_name: names[id] ?? "Fahrer", km: perDriver.get(id)! }))
      .sort((a, b) => b.km - a.km);

    const cargoStats = Array.from(cargoCount.entries())
      .map(([cargo, v]) => ({ cargo, ...v }))
      .sort((a, b) => b.jobs - a.jobs);

    // weekly (last 8 weeks) & monthly (last 12 months) km
    const now = new Date();
    const weeks: { key: string; label: string; km: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i * 7);
      // week key: YYYY-Wn using simple week-of-year (Mon-based)
      const monday = new Date(d);
      const day = (monday.getDay() + 6) % 7;
      monday.setDate(monday.getDate() - day);
      const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      weeks.push({ key, label: `${String(monday.getDate()).padStart(2, "0")}.${String(monday.getMonth() + 1).padStart(2, "0")}`, km: 0 });
    }
    const weekIdx = new Map(weeks.map((w, i) => [w.key, i]));
    const months: { key: string; label: string; km: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: d.toLocaleDateString("de-DE", { month: "short" }), km: 0 });
    }
    const monthIdx = new Map(months.map((m, i) => [m.key, i]));

    for (const j of jobs ?? []) {
      if (!j.submitted_at) continue;
      const d = new Date(j.submitted_at);
      const monday = new Date(d);
      const day = (monday.getDay() + 6) % 7;
      monday.setDate(monday.getDate() - day);
      const wkey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
      const wi = weekIdx.get(wkey);
      if (wi !== undefined) weeks[wi].km += Number(j.distance_km ?? 0);
      const mkey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const mi = monthIdx.get(mkey);
      if (mi !== undefined) months[mi].km += Number(j.distance_km ?? 0);
    }

    const totalKm = (jobs ?? []).reduce((s, j) => s + Number(j.distance_km ?? 0), 0);
    return { kmPerDriver, cargoStats, weeks, months, totals: { km: totalKm, jobs: (jobs ?? []).length } };
  });
