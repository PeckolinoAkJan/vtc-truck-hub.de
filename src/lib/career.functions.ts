import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

/* ============================================================================
 * Career, Level & Rank System
 *
 * Rein additive Implementierung. Alle Berechnungen basieren ausschließlich
 * auf echten Daten (jobs, vtc_members, vtc_event_participants). Der Desktop-
 * Client, Telemetrie und bestehende Endpunkte werden NICHT verändert.
 * ==========================================================================*/

/* ------------------------------- Defaults --------------------------------- */

export type XpRule = { rule_key: string; label: string; xp_amount: number; active: boolean };

const DEFAULT_XP_RULES: XpRule[] = [
  { rule_key: "job_completed", label: "Auftrag abgeschlossen", xp_amount: 100, active: true },
  { rule_key: "per_km", label: "Pro gefahrenem Kilometer", xp_amount: 1, active: true },
  { rule_key: "damage_free", label: "Schadensfreie Lieferung", xp_amount: 250, active: true },
  { rule_key: "convoy_join", label: "Konvoi-Teilnahme", xp_amount: 200, active: true },
  { rule_key: "long_haul", label: "Langstrecke (>1000 km)", xp_amount: 500, active: true },
  { rule_key: "economic_drive", label: "Wirtschaftliche Fahrt (unter 30 l/100km)", xp_amount: 150, active: true },
];

export type Rank = {
  id?: string;
  name: string;
  sort: number;
  min_xp: number;
  max_xp: number | null;
  icon: string | null;
  color: string | null;
};

const DEFAULT_RANKS: Rank[] = [
  { name: "Anwärter", sort: 0, min_xp: 0, max_xp: 5000, icon: "shield", color: "#94a3b8" },
  { name: "Junior Fahrer", sort: 1, min_xp: 5001, max_xp: 15000, icon: "truck", color: "#38bdf8" },
  { name: "Berufskraftfahrer", sort: 2, min_xp: 15001, max_xp: 30000, icon: "hard-hat", color: "#22d3ee" },
  { name: "Fernfahrer", sort: 3, min_xp: 30001, max_xp: 60000, icon: "route", color: "#a78bfa" },
  { name: "Langstreckenfahrer", sort: 4, min_xp: 60001, max_xp: 100000, icon: "map", color: "#f472b6" },
  { name: "Profi-Trucker", sort: 5, min_xp: 100001, max_xp: 200000, icon: "star", color: "#f59e0b" },
  { name: "Elite-Trucker", sort: 6, min_xp: 200001, max_xp: 350000, icon: "award", color: "#ef4444" },
  { name: "VTC-Legende", sort: 7, min_xp: 350001, max_xp: 500000, icon: "crown", color: "#22c55e" },
  { name: "Hall of Fame", sort: 8, min_xp: 500001, max_xp: null, icon: "trophy", color: "#eab308" },
];

export type BadgeDef = {
  id?: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary" | "mythic";
  category: string;
  metric: string;
  threshold: number;
};

const DEFAULT_BADGES: BadgeDef[] = [
  { key: "first_delivery", name: "Erste Lieferung", description: "Erledige deinen ersten Auftrag.", icon: "package", rarity: "common", category: "Lieferungen", metric: "jobs", threshold: 1 },
  { key: "century_deliveries", name: "100 Lieferungen", description: "Schließe 100 Aufträge ab.", icon: "boxes", rarity: "rare", category: "Lieferungen", metric: "jobs", threshold: 100 },
  { key: "ten_thousand_km", name: "10.000 km", description: "Fahre insgesamt 10.000 km.", icon: "milestone", rarity: "rare", category: "Kilometer", metric: "km", threshold: 10000 },
  { key: "damage_free_hero", name: "Schadensfrei", description: "Fahre 1.000 km ohne Schaden.", icon: "shield", rarity: "epic", category: "Schäden", metric: "km_damage_free", threshold: 1000 },
  { key: "fuel_pro", name: "Tank-Profi", description: "Verbrauche unter 25 l/100 km.", icon: "fuel", rarity: "rare", category: "Wirtschaftlichkeit", metric: "avg_fuel_below", threshold: 25 },
  { key: "long_hauler", name: "Langstreckenfahrer", description: "Fahre eine Strecke über 1.000 km.", icon: "route", rarity: "epic", category: "Kilometer", metric: "single_trip_km", threshold: 1000 },
  { key: "convoy_starter", name: "Konvoi-Starter", description: "Nimm am ersten Konvoi teil.", icon: "users", rarity: "common", category: "Konvois", metric: "convoys", threshold: 1 },
  { key: "night_driver", name: "Nachtfahrer", description: "Fahre 10.000 km bei Nacht.", icon: "moon", rarity: "epic", category: "Langzeitaktivität", metric: "km", threshold: 10000 },
  { key: "vtc_legend", name: "VTC-Legende", description: "Erreiche den Rang VTC-Legende.", icon: "crown", rarity: "legendary", category: "Legendär", metric: "xp", threshold: 350001 },
  { key: "profi_trucker", name: "Profi-Trucker", description: "Erreiche den Rang Profi-Trucker.", icon: "star", rarity: "legendary", category: "Legendär", metric: "xp", threshold: 100001 },
  { key: "teamplayer", name: "Teamplayer", description: "Nimm an 25 Konvois teil.", icon: "handshake", rarity: "epic", category: "Teamwork", metric: "convoys", threshold: 25 },
  { key: "economic_master", name: "Wirtschaftsmeister", description: "Halte 50 Aufträge unter 28 l/100 km.", icon: "leaf", rarity: "mythic", category: "Selten", metric: "economic_jobs", threshold: 50 },
];

export type GoalDef = {
  id?: string;
  period: "daily" | "weekly" | "monthly" | "season";
  name: string;
  description: string;
  metric: string;
  target: number;
  xp_reward: number;
  active: boolean;
};

const DEFAULT_GOALS: GoalDef[] = [
  { period: "daily", name: "500 km fahren", description: "Fahre heute insgesamt 500 km.", metric: "km", target: 500, xp_reward: 250, active: true },
  { period: "daily", name: "3 Aufträge abschließen", description: "Schließe heute 3 Aufträge erfolgreich ab.", metric: "jobs", target: 3, xp_reward: 300, active: true },
  { period: "daily", name: "Ohne Schaden fahren", description: "Fahre heute ohne Schaden.", metric: "damage_free_day", target: 1, xp_reward: 200, active: true },
  { period: "daily", name: "Unter 28 l/100 km bleiben", description: "Halte deinen Durchschnittsverbrauch unter 28 l/100 km.", metric: "avg_fuel", target: 28, xp_reward: 150, active: true },
  { period: "daily", name: "Am Konvoi teilnehmen", description: "Nimm heute an einem Konvoi teil.", metric: "convoys_day", target: 1, xp_reward: 200, active: true },
  { period: "weekly", name: "2.500 km pro Woche", description: "Fahre in dieser Woche 2.500 km.", metric: "km", target: 2500, xp_reward: 1000, active: true },
  { period: "monthly", name: "20 Aufträge pro Monat", description: "Schließe in diesem Monat 20 Aufträge ab.", metric: "jobs", target: 20, xp_reward: 2000, active: true },
];

/* ------------------------------- Helpers ---------------------------------- */

type Job = {
  id: string;
  driver_id: string | null;
  distance_km: number | null;
  revenue: number | null;
  fuel_cost: number | null;
  damage_pct: number | null;
  submitted_at: string | null;
  status: string | null;
  cargo: string | null;
  source_city: string | null;
  dest_city: string | null;
};

function xpFromJobs(jobs: Job[], convoys: number, rules: XpRule[]) {
  const map = new Map(rules.filter((r) => r.active).map((r) => [r.rule_key, r.xp_amount]));
  const xpJob = map.get("job_completed") ?? 0;
  const xpKm = map.get("per_km") ?? 0;
  const xpDamageFree = map.get("damage_free") ?? 0;
  const xpConvoy = map.get("convoy_join") ?? 0;
  const xpLongHaul = map.get("long_haul") ?? 0;
  const xpEconomic = map.get("economic_drive") ?? 0;

  const breakdown = { jobs: 0, km: 0, economic: 0, convoys: 0, activity: 0 };

  for (const j of jobs) {
    breakdown.jobs += xpJob;
    breakdown.km += Math.round((j.distance_km ?? 0) * xpKm);
    if ((j.damage_pct ?? 0) === 0) breakdown.economic += xpDamageFree;
    if ((j.distance_km ?? 0) >= 1000) breakdown.economic += xpLongHaul;
    const km = j.distance_km ?? 0;
    const fuelLper100 = km > 0 && j.fuel_cost ? (j.fuel_cost / km) * 100 : Infinity;
    if (fuelLper100 < 30) breakdown.economic += xpEconomic;
  }
  breakdown.convoys = convoys * xpConvoy;
  const totalXp = breakdown.jobs + breakdown.km + breakdown.economic + breakdown.convoys + breakdown.activity;
  return { totalXp, breakdown };
}

function findLevelAndRank(xp: number, ranks: Rank[]) {
  const sorted = [...ranks].sort((a, b) => a.sort - b.sort);
  let current = sorted[0];
  let next: Rank | null = sorted[1] ?? null;
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (xp >= r.min_xp && (r.max_xp === null || xp <= r.max_xp)) {
      current = r;
      next = sorted[i + 1] ?? null;
      break;
    }
  }
  // Level: 1000 XP pro Level
  const level = Math.max(1, Math.floor(xp / 2500) + 1);
  return { rank: current, nextRank: next, level };
}

/* ------------------------------- Access ----------------------------------- */

async function requireMember(supabase: import("@supabase/supabase-js").SupabaseClient, vtcId: string, userId: string) {
  const { data } = await supabase.from("vtc_members").select("role").eq("vtc_id", vtcId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Kein Zugriff auf diese VTC");
  return data.role as "owner" | "admin" | "dispatcher" | "driver";
}

/* ------------------------------- Config ----------------------------------- */

export const getCareerConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireMember(supabase, data.vtcId, userId);

    const [ranksR, rulesR, badgesR, achR, goalsR, seasonsR] = await Promise.all([
      supabase.from("vtc_career_ranks").select("*").eq("vtc_id", data.vtcId).order("sort"),
      supabase.from("vtc_career_xp_rules").select("*").eq("vtc_id", data.vtcId).order("rule_key"),
      supabase.from("vtc_career_badges").select("*").eq("vtc_id", data.vtcId).order("threshold"),
      supabase.from("vtc_career_achievements").select("*").eq("vtc_id", data.vtcId).order("threshold"),
      supabase.from("vtc_career_goals").select("*").eq("vtc_id", data.vtcId).order("period"),
      supabase.from("vtc_career_seasons").select("*").eq("vtc_id", data.vtcId).order("starts_at", { ascending: false }),
    ]);

    const ranks: Rank[] = (ranksR.data ?? []).length ? (ranksR.data as unknown as Rank[]) : DEFAULT_RANKS;
    const rules: XpRule[] = (rulesR.data ?? []).length ? (rulesR.data as unknown as XpRule[]) : DEFAULT_XP_RULES;
    const badges: BadgeDef[] = (badgesR.data ?? []).length ? (badgesR.data as unknown as BadgeDef[]) : DEFAULT_BADGES;
    const achievements: BadgeDef[] = (achR.data ?? []).length ? (achR.data as unknown as BadgeDef[]) : DEFAULT_BADGES;
    const goals: GoalDef[] = (goalsR.data ?? []).length ? (goalsR.data as unknown as GoalDef[]) : DEFAULT_GOALS;
    const seasons = seasonsR.data ?? [];

    return { ranks, rules, badges, achievements, goals, seasons };
  });

/* ------------------------------- Overview --------------------------------- */

export const getCareerOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ vtcId: z.string().uuid(), driverId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireMember(supabase, data.vtcId, userId);
    const targetId = data.driverId ?? userId;

    const [profileR, memberR, jobsR, convoysR, ranksR, rulesR, badgesR, achR, goalsR, historyR] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name, avatar_url, created_at").eq("user_id", targetId).maybeSingle(),
      supabase.from("vtc_members").select("role, joined_at").eq("vtc_id", data.vtcId).eq("user_id", targetId).maybeSingle(),
      supabase
        .from("jobs")
        .select("id, driver_id, distance_km, revenue, fuel_cost, damage_pct, submitted_at, status, cargo, source_city, dest_city")
        .eq("vtc_id", data.vtcId)
        .eq("driver_id", targetId)
        .eq("status", "approved"),
      supabase.from("vtc_event_participants").select("id, rsvp, joined_at").eq("user_id", targetId),
      supabase.from("vtc_career_ranks").select("*").eq("vtc_id", data.vtcId).order("sort"),
      supabase.from("vtc_career_xp_rules").select("*").eq("vtc_id", data.vtcId),
      supabase.from("vtc_career_badges").select("*").eq("vtc_id", data.vtcId),
      supabase.from("vtc_career_achievements").select("*").eq("vtc_id", data.vtcId),
      supabase.from("vtc_career_goals").select("*").eq("vtc_id", data.vtcId).eq("active", true),
      supabase.from("vtc_career_history").select("*").eq("vtc_id", data.vtcId).eq("user_id", targetId).order("created_at", { ascending: false }).limit(50),
    ]);

    const jobs = (jobsR.data ?? []) as Job[];
    const convoys = (convoysR.data ?? []).filter((c) => c.rsvp === "going" || c.rsvp === "attended").length;
    const ranks = (ranksR.data ?? []).length ? (ranksR.data as unknown as Rank[]) : DEFAULT_RANKS;
    const rules = (rulesR.data ?? []).length ? (rulesR.data as unknown as XpRule[]) : DEFAULT_XP_RULES;
    const badges = (badgesR.data ?? []).length ? (badgesR.data as unknown as BadgeDef[]) : DEFAULT_BADGES;
    const achievements = (achR.data ?? []).length ? (achR.data as unknown as BadgeDef[]) : DEFAULT_BADGES;
    const goals = (goalsR.data ?? []).length ? (goalsR.data as unknown as GoalDef[]) : DEFAULT_GOALS;

    const { totalXp, breakdown } = xpFromJobs(jobs, convoys, rules);
    const { rank, nextRank, level } = findLevelAndRank(totalXp, ranks);

    // Kennzahlen
    const totalKm = jobs.reduce((s, j) => s + (j.distance_km ?? 0), 0);
    const totalRevenue = jobs.reduce((s, j) => s + (j.revenue ?? 0), 0);
    const totalFuel = jobs.reduce((s, j) => s + (j.fuel_cost ?? 0), 0);
    const damagedJobs = jobs.filter((j) => (j.damage_pct ?? 0) > 0).length;
    const damageRate = jobs.length ? damagedJobs / jobs.length : 0;
    const avgFuelPer100 = totalKm > 0 ? (totalFuel / totalKm) * 100 : 0;
    const singleTripMax = jobs.reduce((m, j) => Math.max(m, j.distance_km ?? 0), 0);
    const damageFreeKm = jobs.filter((j) => (j.damage_pct ?? 0) === 0).reduce((s, j) => s + (j.distance_km ?? 0), 0);

    // Badge/Achievement Fortschritt
    const metricValue = (metric: string): number => {
      switch (metric) {
        case "jobs": return jobs.length;
        case "km": return totalKm;
        case "km_damage_free": return damageFreeKm;
        case "single_trip_km": return singleTripMax;
        case "convoys": return convoys;
        case "xp": return totalXp;
        case "avg_fuel_below": return avgFuelPer100 > 0 && avgFuelPer100 <= 100 ? Math.max(0, 100 - avgFuelPer100) : 0;
        case "economic_jobs": return jobs.filter((j) => {
          const km = j.distance_km ?? 0;
          return km > 0 && j.fuel_cost && (j.fuel_cost / km) * 100 < 28;
        }).length;
        default: return 0;
      }
    };

    const computeUnlock = (def: BadgeDef) => {
      const value = metricValue(def.metric);
      let progress: number;
      if (def.metric === "avg_fuel_below") {
        progress = avgFuelPer100 > 0 && avgFuelPer100 < def.threshold ? 1 : Math.min(1, def.threshold / (avgFuelPer100 || 1e9));
      } else {
        progress = def.threshold > 0 ? Math.min(1, value / def.threshold) : 0;
      }
      return { unlocked: progress >= 1, progress, current: value };
    };

    const badgesWithProgress = badges.map((b) => ({ ...b, ...computeUnlock(b) }));
    const achievementsWithProgress = achievements.map((a) => ({ ...a, ...computeUnlock(a) }));

    // Ziele (Tages/Wochen/Monat)
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const jobsIn = (from: Date) => jobs.filter((j) => j.submitted_at && new Date(j.submitted_at) >= from);
    const kmIn = (from: Date) => jobsIn(from).reduce((s, j) => s + (j.distance_km ?? 0), 0);

    const goalsWithProgress = goals.map((g) => {
      const from = g.period === "daily" ? startOfDay : g.period === "weekly" ? startOfWeek : g.period === "monthly" ? startOfMonth : new Date(0);
      let current = 0;
      switch (g.metric) {
        case "km": current = kmIn(from); break;
        case "jobs": current = jobsIn(from).length; break;
        case "damage_free_day": current = jobsIn(from).every((j) => (j.damage_pct ?? 0) === 0) && jobsIn(from).length > 0 ? 1 : 0; break;
        case "avg_fuel": {
          const jf = jobsIn(from);
          const km = jf.reduce((s, j) => s + (j.distance_km ?? 0), 0);
          const fuel = jf.reduce((s, j) => s + (j.fuel_cost ?? 0), 0);
          const avg = km > 0 ? (fuel / km) * 100 : 0;
          current = avg > 0 && avg < g.target ? g.target : Math.max(0, g.target - Math.min(g.target, avg));
          break;
        }
        case "convoys_day": current = (convoysR.data ?? []).filter((c) => new Date(c.joined_at ?? 0) >= from).length; break;
        default: current = 0;
      }
      return { ...g, current, progress: g.target > 0 ? Math.min(1, current / g.target) : 0 };
    });

    // Nächster Rang
    const nextXp = nextRank?.min_xp ?? rank.min_xp;
    const rankProgress = nextRank
      ? Math.max(0, Math.min(1, (totalXp - rank.min_xp) / Math.max(1, nextXp - rank.min_xp)))
      : 1;

    // Aktive Tage
    const activeDays = new Set(jobs.map((j) => (j.submitted_at ?? "").slice(0, 10))).size;
    const memberSince = memberR.data?.joined_at ?? profileR.data?.created_at ?? null;
    const playtimeH = Math.round(totalKm / 60); // Näherung: 60 km/h Ø

    // XP-Serie (12 Wochen) für Chart
    const weekBuckets = new Map<string, number>();
    for (const j of jobs) {
      if (!j.submitted_at) continue;
      const d = new Date(j.submitted_at);
      const wk = new Date(d); wk.setDate(d.getDate() - d.getDay()); wk.setHours(0, 0, 0, 0);
      const key = wk.toISOString().slice(0, 10);
      const jobXp = xpFromJobs([j], 0, rules).totalXp;
      weekBuckets.set(key, (weekBuckets.get(key) ?? 0) + jobXp);
    }
    const xpSeries: Array<{ date: string; xp: number }> = [];
    let cum = 0;
    Array.from(weekBuckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .forEach(([date, xp]) => {
        cum += xp;
        xpSeries.push({ date, xp: cum });
      });

    // Monats-Aktivität
    const monthMap = new Map<string, { jobs: number; km: number; playtime: number }>();
    for (const j of jobs) {
      if (!j.submitted_at) continue;
      const d = new Date(j.submitted_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const entry = monthMap.get(key) ?? { jobs: 0, km: 0, playtime: 0 };
      entry.jobs += 1;
      entry.km += j.distance_km ?? 0;
      entry.playtime += (j.distance_km ?? 0) / 60;
      monthMap.set(key, entry);
    }
    const activity = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([month, v]) => ({ month, jobs: v.jobs, km: Math.round(v.km / 1000), playtime: Math.round(v.playtime) }));

    return {
      profile: {
        userId: targetId,
        displayName: profileR.data?.display_name ?? "Fahrer",
        avatarUrl: profileR.data?.avatar_url ?? null,
        driverId: `#PT-${targetId.slice(0, 4).toUpperCase()}`,
        role: memberR.data?.role ?? "driver",
        memberSince,
      },
      xp: {
        total: totalXp,
        level,
        rank,
        nextRank,
        rankProgress,
        remaining: nextRank ? Math.max(0, nextXp - totalXp) : 0,
        breakdown,
      },
      kpis: {
        totalKm: Math.round(totalKm),
        totalJobs: jobs.length,
        totalRevenue,
        avgFuelPer100: Math.round(avgFuelPer100 * 10) / 10,
        damageRate,
        singleTripMax: Math.round(singleTripMax),
        activeDays,
        playtimeH,
        convoys,
      },
      badges: badgesWithProgress,
      achievements: achievementsWithProgress,
      goals: goalsWithProgress,
      history: historyR.data ?? [],
      charts: { xpSeries, activity },
      rating: Math.max(1, Math.min(5, 5 - damageRate * 5 + (jobs.length > 20 ? 0.2 : 0))),
    };
  });

/* ---------------------------- Leaderboard --------------------------------- */

export const getCareerLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        metric: z.enum(["xp", "level", "km", "jobs", "economy", "achievements", "convoys"]).default("xp"),
        period: z.enum(["week", "month", "year", "all"]).default("all"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireMember(supabase, data.vtcId, userId);

    const now = new Date();
    let from: Date | null = null;
    if (data.period === "week") { from = new Date(now); from.setDate(now.getDate() - 7); }
    if (data.period === "month") { from = new Date(now); from.setMonth(now.getMonth() - 1); }
    if (data.period === "year") { from = new Date(now); from.setFullYear(now.getFullYear() - 1); }

    const [membersR, jobsR, convoyR, rulesR, ranksR] = await Promise.all([
      supabase.from("vtc_members").select("user_id, role").eq("vtc_id", data.vtcId),
      supabase
        .from("jobs")
        .select("driver_id, distance_km, fuel_cost, damage_pct, submitted_at, status")
        .eq("vtc_id", data.vtcId)
        .eq("status", "approved")
        .gte("submitted_at", from ? from.toISOString() : "1970-01-01"),
      supabase.from("vtc_event_participants").select("user_id, rsvp, joined_at"),
      supabase.from("vtc_career_xp_rules").select("*").eq("vtc_id", data.vtcId),
      supabase.from("vtc_career_ranks").select("*").eq("vtc_id", data.vtcId).order("sort"),
    ]);

    const members = membersR.data ?? [];
    const jobs = (jobsR.data ?? []) as Job[];
    const rules = (rulesR.data ?? []).length ? (rulesR.data as unknown as XpRule[]) : DEFAULT_XP_RULES;
    const ranks = (ranksR.data ?? []).length ? (ranksR.data as unknown as Rank[]) : DEFAULT_RANKS;
    const memberIds = new Set(members.map((m) => m.user_id));
    const convoys = (convoyR.data ?? []).filter((c) => memberIds.has(c.user_id ?? "") && (c.rsvp === "going" || c.rsvp === "attended"));

    const byUser = new Map<string, { jobs: Job[]; convoys: number }>();
    for (const m of members) byUser.set(m.user_id, { jobs: [], convoys: 0 });
    for (const j of jobs) if (j.driver_id && byUser.has(j.driver_id)) byUser.get(j.driver_id)!.jobs.push(j);
    for (const c of convoys) if (c.user_id && byUser.has(c.user_id)) byUser.get(c.user_id)!.convoys += 1;

    const ids = Array.from(byUser.keys());
    const profilesR = ids.length
      ? await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", ids)
      : { data: [] as { user_id: string; display_name: string | null; avatar_url: string | null }[] };

    const profileMap = new Map((profilesR.data ?? []).map((p) => [p.user_id, p]));

    const rows = ids.map((uid) => {
      const entry = byUser.get(uid)!;
      const { totalXp } = xpFromJobs(entry.jobs, entry.convoys, rules);
      const km = entry.jobs.reduce((s, j) => s + (j.distance_km ?? 0), 0);
      const fuel = entry.jobs.reduce((s, j) => s + (j.fuel_cost ?? 0), 0);
      const { level, rank } = findLevelAndRank(totalXp, ranks);
      const p = profileMap.get(uid);
      return {
        userId: uid,
        displayName: p?.display_name ?? "Fahrer",
        avatarUrl: p?.avatar_url ?? null,
        xp: totalXp,
        level,
        rankName: rank.name,
        km: Math.round(km),
        jobs: entry.jobs.length,
        convoys: entry.convoys,
        economy: km > 0 ? Math.round(((fuel / km) * 100) * 10) / 10 : 0,
      };
    });

    const sortKey = data.metric === "level" ? "level" : data.metric === "km" ? "km" : data.metric === "jobs" ? "jobs" : data.metric === "convoys" ? "convoys" : data.metric === "economy" ? "economy" : "xp";
    rows.sort((a, b) => (data.metric === "economy"
      ? (a.economy || Infinity) - (b.economy || Infinity)
      : (b as unknown as Record<string, number>)[sortKey] - (a as unknown as Record<string, number>)[sortKey]));

    return rows.slice(0, 100);
  });

/* --------------------------- Admin Mutations ------------------------------ */

async function requireAdmin(supabase: import("@supabase/supabase-js").SupabaseClient, vtcId: string, userId: string) {
  const { data } = await supabase.from("vtc_members").select("role").eq("vtc_id", vtcId).eq("user_id", userId).maybeSingle();
  if (!data || (data.role !== "owner" && data.role !== "admin")) throw new Error("Forbidden");
}

export const upsertXpRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      vtcId: z.string().uuid(),
      ruleKey: z.string().min(1),
      label: z.string().min(1),
      xpAmount: z.number().int(),
      active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, data.vtcId, userId);
    const { error } = await supabase
      .from("vtc_career_xp_rules")
      .upsert({ vtc_id: data.vtcId, rule_key: data.ruleKey, label: data.label, xp_amount: data.xpAmount, active: data.active }, { onConflict: "vtc_id,rule_key" });
    if (error) throw dbError(error, "career");
    return { ok: true };
  });

export const upsertRank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      vtcId: z.string().uuid(),
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      sort: z.number().int(),
      minXp: z.number().int(),
      maxXp: z.number().int().nullable(),
      icon: z.string().nullable(),
      color: z.string().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, data.vtcId, userId);
    const payload = { vtc_id: data.vtcId, name: data.name, sort: data.sort, min_xp: data.minXp, max_xp: data.maxXp, icon: data.icon, color: data.color };
    const q = data.id
      ? supabase.from("vtc_career_ranks").update(payload).eq("id", data.id).eq("vtc_id", data.vtcId)
      : supabase.from("vtc_career_ranks").insert(payload);
    const { error } = await q;
    if (error) throw dbError(error, "career");
    return { ok: true };
  });

export const deleteRank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.vtcId, context.userId);
    const { error } = await context.supabase.from("vtc_career_ranks").delete().eq("id", data.id).eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "career");
    return { ok: true };
  });

export const upsertGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      vtcId: z.string().uuid(),
      id: z.string().uuid().optional(),
      period: z.enum(["daily", "weekly", "monthly", "season"]),
      name: z.string().min(1),
      description: z.string(),
      metric: z.string().min(1),
      target: z.number(),
      xpReward: z.number().int(),
      active: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.vtcId, context.userId);
    const payload = { vtc_id: data.vtcId, period: data.period, name: data.name, description: data.description, metric: data.metric, target: data.target, xp_reward: data.xpReward, active: data.active };
    const q = data.id
      ? context.supabase.from("vtc_career_goals").update(payload).eq("id", data.id).eq("vtc_id", data.vtcId)
      : context.supabase.from("vtc_career_goals").insert(payload);
    const { error } = await q;
    if (error) throw dbError(error, "career");
    return { ok: true };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vtcId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.vtcId, context.userId);
    const { error } = await context.supabase.from("vtc_career_goals").delete().eq("id", data.id).eq("vtc_id", data.vtcId);
    if (error) throw dbError(error, "career");
    return { ok: true };
  });
