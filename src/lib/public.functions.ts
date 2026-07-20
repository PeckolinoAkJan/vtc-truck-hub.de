import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbError, safeError } from "./server-errors";

export type PublicVtc = {
  id: string;
  name: string;
  slug: string;
  tag: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
};

export type PublicVtcFull = PublicVtc & {
  discord_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
};

export const listPublicVtcs = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("list_public_vtcs");
  if (error) throw dbError(error, "public");
  return (data ?? []) as PublicVtc[];
});

export const getPublicVtc = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_public_vtc", { _slug: data.slug });
    if (error) throw dbError(error, "public");
    const row = (rows ?? [])[0];
    if (!row) throw new Error("Spedition nicht gefunden");
    return row as PublicVtcFull;
  });

export const getTopDrivers = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_top_drivers", { _limit: 10 });
  if (error) throw dbError(error, "public");
  return (data ?? []) as Array<{
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    total_revenue: number;
    total_km: number;
    total_jobs: number;
  }>;
});

export const getTopVtcs = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_top_vtcs", { _limit: 10 });
  if (error) throw dbError(error, "public");
  return (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    tag: string;
    logo_url: string | null;
    total_revenue: number;
    total_km: number;
    total_jobs: number;
  }>;
});
