import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: jobs, error } = await supabase
      .from("jobs")
      .select("status, distance_km, revenue, fuel_cost, submitted_at, driver_id")
      .eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "dashboard");

    const approved = (jobs ?? []).filter((j) => j.status === "approved");
    const pending = (jobs ?? []).filter((j) => j.status === "submitted").length;
    const rejected = (jobs ?? []).filter((j) => j.status === "rejected").length;

    const totalRevenue = approved.reduce((s, j) => s + (Number(j.revenue) || 0), 0);
    const totalFuel = approved.reduce((s, j) => s + (Number(j.fuel_cost) || 0), 0);
    const totalKm = approved.reduce((s, j) => s + (Number(j.distance_km) || 0), 0);

    const { count: memberCount } = await supabase
      .from("vtc_members")
      .select("*", { count: "exact", head: true })
      .eq("vtc_id", data.vtcId);

    const cutoff14 = new Date(Date.now() - 14 * 86400_000);
    const activeDrivers = new Set(
      approved
        .filter((j) => new Date(j.submitted_at) >= cutoff14)
        .map((j) => j.driver_id),
    ).size;

    // Jobs submitted today + yesterday for delta
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    const jobsToday = (jobs ?? []).filter(
      (j) => new Date(j.submitted_at) >= startToday,
    ).length;
    const jobsYesterday = (jobs ?? []).filter((j) => {
      const t = new Date(j.submitted_at);
      return t >= startYesterday && t < startToday;
    }).length;

    // Vehicles + live drivers
    const { count: vehiclesTotal } = await supabase
      .from("vehicles")
      .select("*", { count: "exact", head: true })
      .eq("vtc_id", data.vtcId);

    const { data: liveRows } = await supabase
      .from("telemetry_data")
      .select("driver_id, status, updated_at")
      .eq("vtc_id", data.vtcId);
    const liveCutoff = Date.now() - 5 * 60_000;
    const liveDrivers = (liveRows ?? []).filter(
      (r) => new Date(r.updated_at).getTime() > liveCutoff && r.status !== "offline",
    );
    const vehiclesInUse = liveDrivers.filter((r) => r.status === "driving").length;

    // Profit series — last 6 months
    const months: { month: string; revenue: number; profit: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const inMonth = approved.filter((j) => {
        const t = new Date(j.submitted_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      const rev = inMonth.reduce((s, j) => s + (Number(j.revenue) || 0), 0);
      const fuel = inMonth.reduce((s, j) => s + (Number(j.fuel_cost) || 0), 0);
      months.push({
        month: d.toLocaleDateString("de-DE", { month: "short" }),
        revenue: rev,
        profit: rev - fuel,
      });
    }

    // Top driver
    const perDriver = new Map<string, { revenue: number; profit: number }>();
    for (const j of approved) {
      const cur = perDriver.get(j.driver_id) ?? { revenue: 0, profit: 0 };
      const rev = Number(j.revenue) || 0;
      const fuel = Number(j.fuel_cost) || 0;
      cur.revenue += rev;
      cur.profit += rev - fuel;
      perDriver.set(j.driver_id, cur);
    }
    const topEntry = [...perDriver.entries()].sort(
      (a, b) => b[1].profit - a[1].profit,
    )[0];
    let topDriver: {
      user_id: string;
      display_name: string;
      avatar_url: string | null;
      revenue: number;
      profit: number;
    } | null = null;
    if (topEntry) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("user_id", topEntry[0])
        .maybeSingle();
      topDriver = {
        user_id: topEntry[0],
        display_name: prof?.display_name ?? "Fahrer",
        avatar_url: prof?.avatar_url ?? null,
        revenue: topEntry[1].revenue,
        profit: topEntry[1].profit,
      };
    }

    // Recent activities from telemetry_events
    const { data: events } = await supabase
      .from("telemetry_events")
      .select("event_type, received_at, driver_id, payload")
      .eq("vtc_id", data.vtcId)
      .order("received_at", { ascending: false })
      .limit(6);
    const eventDriverIds = Array.from(
      new Set((events ?? []).map((e) => e.driver_id).filter(Boolean)),
    ) as string[];
    let profilesMap: Record<string, string> = {};
    if (eventDriverIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", eventDriverIds);
      profilesMap = Object.fromEntries(
        (profs ?? []).map((p) => [p.user_id, p.display_name ?? "Fahrer"]),
      );
    }
    const activities = (events ?? []).map((e) => ({
      type: e.event_type,
      created_at: e.received_at,
      driver_name: e.driver_id ? profilesMap[e.driver_id] ?? "Fahrer" : "System",
    }));

    // Compare to previous month
    const thisMonth = months[months.length - 1];
    const prevMonth = months[months.length - 2];
    const pctChange = (a: number, b: number) =>
      b === 0 ? (a === 0 ? 0 : 100) : ((a - b) / b) * 100;

    return {
      totals: {
        revenue: totalRevenue,
        cost: totalFuel,
        profit: totalRevenue - totalFuel,
        km: totalKm,
        jobs: approved.length,
        pending,
        rejected,
        members: memberCount ?? 0,
        activeDrivers,
        liveDriversNow: liveDrivers.length,
        vehiclesTotal: vehiclesTotal ?? 0,
        vehiclesInUse,
        jobsToday,
        jobsTodayDelta: jobsToday - jobsYesterday,
      },
      changePct: {
        revenue: pctChange(thisMonth?.revenue ?? 0, prevMonth?.revenue ?? 0),
        cost: pctChange(0, 0),
        profit: pctChange(thisMonth?.profit ?? 0, prevMonth?.profit ?? 0),
        km: 0,
      },
      series: months,
      topDriver,
      activities,
    };
  });
