import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

/**
 * List unpaid approved jobs grouped by driver for a VTC.
 * Only accessible by owner/admin/dispatcher (RLS enforces select).
 */
export const listUnpaidByDriver = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Only owner/admin/dispatcher of the VTC may see driver balances.
    const { data: membership } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    const role = membership?.role;
    if (role !== "owner" && role !== "admin" && role !== "dispatcher") {
      throw new Error("Forbidden");
    }
    const { data: jobs, error } = await supabase
      .from("jobs")
      .select(
        "id, driver_id, source_city, dest_city, cargo, distance_km, revenue, fuel_cost, submitted_at",
      )
      .eq("vtc_id", data.vtcId)
      .eq("status", "approved")
      .is("paid_at", null)
      .order("submitted_at", { ascending: false });
    if (error) throw dbError(error, "billing");

    const driverIds = Array.from(new Set((jobs ?? []).map((j) => j.driver_id)));
    let profiles: Record<string, { display_name: string; avatar_url: string | null; balance: number }> = {};
    if (driverIds.length > 0) {
      // Names/avatars are readable via shared-VTC RLS. Balances are column-
      // restricted; load them via the admin client after the caller was
      // confirmed to be owner/admin/dispatcher of this VTC below is not yet
      // done — but listUnpaidByDriver is only reachable for that VTC's rows
      // via RLS on jobs, so we scope balance reads to those driver ids only.
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", driverIds);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: balances } = await supabaseAdmin
        .from("profiles")
        .select("user_id, balance")
        .in("user_id", driverIds);
      const balMap = new Map<string, number>(
        (balances ?? []).map((b) => [b.user_id, Number(b.balance ?? 0)]),
      );
      profiles = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.user_id,
          {
            display_name: p.display_name ?? "Fahrer",
            avatar_url: p.avatar_url ?? null,
            balance: balMap.get(p.user_id) ?? 0,
          },
        ]),
      );
    }

    const groups = new Map<
      string,
      {
        driver_id: string;
        display_name: string;
        avatar_url: string | null;
        balance: number;
        jobs: Array<{
          id: string;
          source_city: string;
          dest_city: string;
          cargo: string;
          distance_km: number;
          revenue: number;
          fuel_cost: number;
          submitted_at: string;
        }>;
        totalRevenue: number;
        totalKm: number;
      }
    >();

    for (const j of jobs ?? []) {
      const key = j.driver_id;
      const g =
        groups.get(key) ??
        {
          driver_id: key,
          display_name: profiles[key]?.display_name ?? "Fahrer",
          avatar_url: profiles[key]?.avatar_url ?? null,
          balance: profiles[key]?.balance ?? 0,
          jobs: [],
          totalRevenue: 0,
          totalKm: 0,
        };
      g.jobs.push({
        id: j.id,
        source_city: j.source_city,
        dest_city: j.dest_city,
        cargo: j.cargo,
        distance_km: Number(j.distance_km),
        revenue: Number(j.revenue),
        fuel_cost: Number(j.fuel_cost),
        submitted_at: j.submitted_at,
      });
      g.totalRevenue += Number(j.revenue);
      g.totalKm += Number(j.distance_km);
      groups.set(key, g);
    }

    return { groups: Array.from(groups.values()) };
  });

export const payDriverJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        driverId: z.string().uuid(),
        amount: z.number().nonnegative().max(1_000_000),
        jobIds: z.array(z.string().uuid()).min(1).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is owner/admin/dispatcher via RLS-scoped read
    const { data: membership, error: memErr } = await supabase
      .from("vtc_members")
      .select("role")
      .eq("vtc_id", data.vtcId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memErr) throw dbError(memErr, "billing");
    const role = membership?.role;
    if (role !== "owner" && role !== "admin" && role !== "dispatcher") {
      throw new Error("Forbidden");
    }

    // The caller is authenticated and role-checked above with RLS. The actual
    // payout runs through the privileged backend client, while the database
    // function independently re-checks the caller by user id.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("pay_driver_jobs", {
      _actor_id: userId,
      _vtc_id: data.vtcId,
      _driver_id: data.driverId,
      _amount: data.amount,
      _job_ids: data.jobIds,
    });
    if (error) throw dbError(error, "billing");
    return { ok: true };
  });
