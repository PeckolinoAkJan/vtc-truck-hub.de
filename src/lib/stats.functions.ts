import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { dbError } from "./server-errors";

function makePublicClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getGlobalStats = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = makePublicClient();
  const { data, error } = await supabase
    .from("global_stats")
    .select("active_drivers, active_jobs, total_km, total_revenue, total_profit")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw dbError(error, "stats");
  return {
    activeDrivers: Number(data?.active_drivers ?? 0),
    activeJobs: Number(data?.active_jobs ?? 0),
    totalKm: Number(data?.total_km ?? 0),
    totalRevenue: Number(data?.total_revenue ?? 0),
    totalProfit: Number(data?.total_profit ?? 0),
  };
});
