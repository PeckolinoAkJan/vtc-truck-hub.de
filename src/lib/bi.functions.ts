import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

const rangeSchema = z.object({
  vtcId: z.string().uuid(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  game: z.enum(["ets2", "ats", "all"]).optional().default("all"),
  driverId: z.string().uuid().optional(),
  truck: z.string().optional(),
});

type Job = {
  id: string;
  driver_id: string;
  cargo: string;
  source_city: string;
  dest_city: string;
  distance_km: number;
  revenue: number;
  fuel_cost: number;
  damage_pct: number;
  payout_amount: number | null;
  paid_at: string | null;
  submitted_at: string;
  started_at: string | null;
  finished_at: string | null;
  status: string;
  truck: string | null;
  game: "ets2" | "ats";
};

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const getBusinessIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = data.from ? new Date(data.from) : null;
    const to = data.to ? new Date(data.to) : null;

    let q = supabase
      .from("jobs")
      .select(
        "id, driver_id, cargo, source_city, dest_city, distance_km, revenue, fuel_cost, damage_pct, payout_amount, paid_at, submitted_at, started_at, finished_at, status, truck, game",
      )
      .eq("vtc_id", data.vtcId);
    if (data.game && data.game !== "all") q = q.eq("game", data.game);
    if (data.driverId) q = q.eq("driver_id", data.driverId);
    if (data.truck) q = q.eq("truck", data.truck);
    if (from) q = q.gte("submitted_at", from.toISOString());
    if (to) q = q.lte("submitted_at", to.toISOString());

    const { data: rawJobs, error } = await q;
    if (error) throw dbError(error, "bi");
    const jobs = (rawJobs ?? []) as Job[];

    // Vormonat vergleich (nur wenn kein custom range gesetzt)
    let previousJobs: Job[] = [];
    if (!from && !to) {
      const now = new Date();
      const startCurrent = new Date(now.getFullYear(), now.getMonth(), 1);
      const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const { data: prevData } = await supabase
        .from("jobs")
        .select(
          "id, driver_id, cargo, source_city, dest_city, distance_km, revenue, fuel_cost, damage_pct, payout_amount, paid_at, submitted_at, started_at, finished_at, status, truck, game",
        )
        .eq("vtc_id", data.vtcId)
        .gte("submitted_at", startPrev.toISOString())
        .lt("submitted_at", startCurrent.toISOString());
      previousJobs = (prevData ?? []) as Job[];
    }

    const approved = jobs.filter((j) => j.status === "approved");
    const inProgress = jobs.filter((j) => j.status === "in_progress");

    const totalRevenue = approved.reduce((s, j) => s + Number(j.revenue ?? 0), 0);
    const totalWages = jobs.reduce((s, j) => s + Number(j.payout_amount ?? 0), 0);
    const totalFuel = approved.reduce((s, j) => s + Number(j.fuel_cost ?? 0), 0);
    const totalKm = approved.reduce((s, j) => s + Number(j.distance_km ?? 0), 0);
    const totalProfit = totalRevenue - totalWages - totalFuel;
    const completedCount = approved.length;
    const avgProfitPerJob = completedCount ? totalProfit / completedCount : 0;
    const avgKmPerJob = completedCount ? totalKm / completedCount : 0;
    const avgProfitPerKm = totalKm ? totalProfit / totalKm : 0;
    const avgFuelPer100 = totalKm ? (totalFuel / totalKm) * 100 : 0;
    const damageRate = completedCount
      ? approved.reduce((s, j) => s + Number(j.damage_pct ?? 0), 0) / completedCount
      : 0;

    // aktive Fahrer (haben in den letzten 30 Tagen Auftrag abgeliefert)
    const activeCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const activeDrivers = new Set(
      jobs
        .filter((j) => new Date(j.submitted_at).getTime() >= activeCutoff)
        .map((j) => j.driver_id),
    );

    // Vormonatsvergleiche
    const prevApproved = previousJobs.filter((j) => j.status === "approved");
    const prevRevenue = prevApproved.reduce((s, j) => s + Number(j.revenue ?? 0), 0);
    const prevWages = previousJobs.reduce((s, j) => s + Number(j.payout_amount ?? 0), 0);
    const prevFuel = prevApproved.reduce((s, j) => s + Number(j.fuel_cost ?? 0), 0);
    const prevKm = prevApproved.reduce((s, j) => s + Number(j.distance_km ?? 0), 0);
    const prevProfit = prevRevenue - prevWages - prevFuel;
    const prevActive = new Set(previousJobs.map((j) => j.driver_id)).size;
    const prevAvg = prevApproved.length ? prevProfit / prevApproved.length : 0;

    const pct = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : null;

    const comparison = {
      revenue: pct(totalRevenue, prevRevenue),
      profit: pct(totalProfit, prevProfit),
      km: pct(totalKm, prevKm),
      jobs: pct(completedCount, prevApproved.length),
      activeDrivers: pct(activeDrivers.size, prevActive),
      avgProfit: pct(avgProfitPerJob, prevAvg),
    };

    // Monatsreihe (letzte 12 Monate)
    const now = new Date();
    const months: { key: string; label: string; revenue: number; profit: number; km: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: monthKey(d),
        label: d.toLocaleDateString("de-DE", { month: "short" }),
        revenue: 0,
        profit: 0,
        km: 0,
      });
    }
    const midx = new Map(months.map((m, i) => [m.key, i]));
    for (const j of approved) {
      const k = monthKey(new Date(j.submitted_at));
      const i = midx.get(k);
      if (i === undefined) continue;
      const rev = Number(j.revenue ?? 0);
      const fuel = Number(j.fuel_cost ?? 0);
      months[i].revenue += rev;
      months[i].km += Number(j.distance_km ?? 0);
      months[i].profit += rev - fuel - Number(j.payout_amount ?? 0);
    }

    // Auftragsstatus (Donut)
    const statusMap = new Map<string, number>();
    for (const j of jobs) statusMap.set(j.status, (statusMap.get(j.status) ?? 0) + 1);
    const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // Umsatz nach Spiel
    const gameMap = new Map<string, number>();
    for (const j of approved) {
      gameMap.set(j.game, (gameMap.get(j.game) ?? 0) + Number(j.revenue ?? 0));
    }
    const revenueByGame = Array.from(gameMap.entries()).map(([game, revenue]) => ({
      game,
      revenue,
    }));

    // Distanzverteilung
    const distanceBuckets = [
      { key: "0-250", min: 0, max: 250, count: 0 },
      { key: "251-500", min: 251, max: 500, count: 0 },
      { key: "501-1000", min: 501, max: 1000, count: 0 },
      { key: "1001-1500", min: 1001, max: 1500, count: 0 },
      { key: "1500+", min: 1501, max: Infinity, count: 0 },
    ];
    for (const j of approved) {
      const d = Number(j.distance_km ?? 0);
      const b = distanceBuckets.find((b) => d >= b.min && d <= b.max);
      if (b) b.count += 1;
    }

    // Ranglisten (Fahrer)
    const driverAgg = new Map<
      string,
      { revenue: number; profit: number; km: number; jobs: number }
    >();
    for (const j of approved) {
      const g = driverAgg.get(j.driver_id) ?? { revenue: 0, profit: 0, km: 0, jobs: 0 };
      const rev = Number(j.revenue ?? 0);
      g.revenue += rev;
      g.profit += rev - Number(j.fuel_cost ?? 0) - Number(j.payout_amount ?? 0);
      g.km += Number(j.distance_km ?? 0);
      g.jobs += 1;
      driverAgg.set(j.driver_id, g);
    }
    const driverIds = Array.from(driverAgg.keys());
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
    const driverRows = driverIds.map((id) => ({
      driver_id: id,
      display_name: profiles[id]?.display_name ?? "Fahrer",
      avatar_url: profiles[id]?.avatar_url ?? null,
      ...driverAgg.get(id)!,
    }));
    const topDriversByProfit = [...driverRows].sort((a, b) => b.profit - a.profit).slice(0, 5);
    const topDriversByKm = [...driverRows].sort((a, b) => b.km - a.km).slice(0, 5);

    // Fahrzeuge
    const truckAgg = new Map<
      string,
      { km: number; jobs: number; profit: number; fuel: number; damage: number }
    >();
    for (const j of approved) {
      const t = j.truck || "Unbekannt";
      const g = truckAgg.get(t) ?? { km: 0, jobs: 0, profit: 0, fuel: 0, damage: 0 };
      const rev = Number(j.revenue ?? 0);
      g.km += Number(j.distance_km ?? 0);
      g.jobs += 1;
      g.profit += rev - Number(j.fuel_cost ?? 0) - Number(j.payout_amount ?? 0);
      g.fuel += Number(j.fuel_cost ?? 0);
      g.damage += Number(j.damage_pct ?? 0);
      truckAgg.set(t, g);
    }
    const totalTruckKm = Array.from(truckAgg.values()).reduce((s, v) => s + v.km, 0) || 1;
    const trucks = Array.from(truckAgg.entries())
      .map(([truck, v]) => ({
        truck,
        km: v.km,
        jobs: v.jobs,
        profit: v.profit,
        fuel: v.fuel,
        damage: v.jobs ? v.damage / v.jobs : 0,
        utilization: (v.km / totalTruckKm) * 100,
      }))
      .sort((a, b) => b.km - a.km);

    // Routen
    const routeAgg = new Map<string, { jobs: number; km: number; revenue: number; profit: number }>();
    for (const j of approved) {
      const key = `${j.source_city} → ${j.dest_city}`;
      const g = routeAgg.get(key) ?? { jobs: 0, km: 0, revenue: 0, profit: 0 };
      g.jobs += 1;
      g.km += Number(j.distance_km ?? 0);
      g.revenue += Number(j.revenue ?? 0);
      g.profit +=
        Number(j.revenue ?? 0) - Number(j.fuel_cost ?? 0) - Number(j.payout_amount ?? 0);
      routeAgg.set(key, g);
    }
    const routes = Array.from(routeAgg.entries()).map(([route, v]) => ({ route, ...v }));
    const topRoutesByKm = [...routes].sort((a, b) => b.km - a.km).slice(0, 5);
    const mostFrequentRoute = [...routes].sort((a, b) => b.jobs - a.jobs)[0] ?? null;
    const longestRoute = [...routes].sort((a, b) => b.km / b.jobs - a.km / a.jobs)[0] ?? null;
    const mostProfitableRoute = [...routes].sort((a, b) => b.profit - a.profit)[0] ?? null;

    // Kraftstoffverbrauch pro Tag (letzte 31 Tage)
    const days: { key: string; label: string; consumption: number; km: number; fuel: number }[] = [];
    for (let i = 30; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        key,
        label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        consumption: 0,
        km: 0,
        fuel: 0,
      });
    }
    const didx = new Map(days.map((d, i) => [d.key, i]));
    for (const j of approved) {
      const key = new Date(j.submitted_at).toISOString().slice(0, 10);
      const i = didx.get(key);
      if (i === undefined) continue;
      days[i].km += Number(j.distance_km ?? 0);
      days[i].fuel += Number(j.fuel_cost ?? 0);
    }
    for (const d of days) d.consumption = d.km ? (d.fuel / d.km) * 100 : 0;

    // Fracht
    const cargoAgg = new Map<string, { jobs: number; km: number; revenue: number }>();
    for (const j of approved) {
      const c = j.cargo || "Unbekannt";
      const g = cargoAgg.get(c) ?? { jobs: 0, km: 0, revenue: 0 };
      g.jobs += 1;
      g.km += Number(j.distance_km ?? 0);
      g.revenue += Number(j.revenue ?? 0);
      cargoAgg.set(c, g);
    }
    const topCargo = Array.from(cargoAgg.entries())
      .map(([cargo, v]) => ({ cargo, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totals: {
        revenue: totalRevenue,
        profit: totalProfit,
        wages: totalWages,
        fuel: totalFuel,
        km: totalKm,
        jobs: completedCount,
        inProgress: inProgress.length,
        activeDrivers: activeDrivers.size,
        avgProfitPerJob,
        avgKmPerJob,
        avgProfitPerKm,
        avgFuelPer100,
        damageRate,
        margin: totalRevenue ? (totalProfit / totalRevenue) * 100 : 0,
      },
      comparison,
      months,
      days,
      statusBreakdown,
      revenueByGame,
      distanceBuckets: distanceBuckets.map(({ key, count }) => ({ key, count })),
      topDriversByProfit,
      topDriversByKm,
      trucks,
      topRoutesByKm,
      mostFrequentRoute,
      longestRoute,
      mostProfitableRoute,
      topCargo,
    };
  });

export const listVtcDriversForFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: mems } = await supabase
      .from("vtc_members")
      .select("user_id")
      .eq("vtc_id", data.vtcId);
    const ids = (mems ?? []).map((m) => m.user_id);
    if (!ids.length) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", ids);
    return (profs ?? []).map((p) => ({
      id: p.user_id,
      name: p.display_name ?? "Fahrer",
    }));
  });
