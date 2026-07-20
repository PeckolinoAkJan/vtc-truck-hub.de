import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { dbError, safeError } from "./server-errors";

export const listNews = createServerFn({ method: "GET" }).handler(async () => {
  const sb = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
  const { data, error } = await sb
    .from("vtc_news")
    .select("id,title,content,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw dbError(error, "news");
  return data ?? [];
});

export const createNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ title: z.string().min(1).max(200), content: z.string().min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("vtc_news")
      .insert({ title: data.title, content: data.content })
      .select("id")
      .single();
    if (error) throw dbError(error, "news");
    return row;
  });

export const deleteNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_news").delete().eq("id", data.id);
    if (error) throw dbError(error, "news");
    return { ok: true };
  });
