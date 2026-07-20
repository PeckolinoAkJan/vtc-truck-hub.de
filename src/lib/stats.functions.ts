import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dbError } from "./server-errors";

function makeStatsClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export const getGlobalStats = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = makeStatsClient();
  const liveCutoff = new Date(Date.now() - 5 * 60_000).toISOString();

  const [approvedResult, liveResult, activeJobsResult] = await Promise.all([
    supabase
      .from("jobs")
      .select("distance_km, revenue, fuel_cost")
      .eq("status", "approved"),
    supabase
      .from("telemetry_data")
      .select("driver_id")
      .gt("updated_at", liveCutoff)
      .neq("status", "offline"),
    supabase
      .from("jobs")
      .select("driver_id")
      .eq("status", "in_progress"),
  ]);

  if (approvedResult.error) throw dbError(approvedResult.error, "stats");
  if (liveResult.error) throw dbError(liveResult.error, "stats");
  if (activeJobsResult.error) throw dbError(activeJobsResult.error, "stats");

  const liveDriverIds = new Set((liveResult.data ?? []).map((row) => row.driver_id));
  const approved = approvedResult.data ?? [];
  const totalKm = approved.reduce((sum, job) => sum + Number(job.distance_km ?? 0), 0);
  const totalRevenue = approved.reduce((sum, job) => sum + Number(job.revenue ?? 0), 0);
  const totalFuel = approved.reduce((sum, job) => sum + Number(job.fuel_cost ?? 0), 0);
  const activeJobs = (activeJobsResult.data ?? []).filter((job) =>
    liveDriverIds.has(job.driver_id),
  ).length;

  return {
    activeDrivers: liveDriverIds.size,
    activeJobs,
    totalKm,
    totalRevenue,
    totalProfit: totalRevenue - totalFuel,
  };
});
