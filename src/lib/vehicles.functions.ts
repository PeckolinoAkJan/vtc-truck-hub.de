import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

export const listVehicles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "vehicles");

    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.current_driver_id).filter(Boolean)),
    ) as string[];
    let names: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", ids);
      names = Object.fromEntries(
        (profs ?? []).map((p) => [p.user_id, p.display_name ?? "Fahrer"]),
      );
    }
    return (rows ?? []).map((r) => ({
      ...r,
      driver_name: r.current_driver_id ? names[r.current_driver_id] ?? "Fahrer" : null,
    }));
  });
