import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

const BUCKET = "vtc-documents";

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("vtc_documents")
      .select("id, name, mime_type, size_bytes, storage_path, uploaded_by, created_at")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false });
    if (error) throw dbError(error, "documents");
    return rows ?? [];
  });

export const createDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      vtcId: z.string().uuid(),
      fileName: z.string().min(1).max(200),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Owner check via RLS-scoped read
    const { data: m } = await supabase.from("vtc_members").select("role").eq("vtc_id", data.vtcId).eq("user_id", userId).maybeSingle();
    if (m?.role !== "owner") throw new Error("Nur der Inhaber darf Dokumente hochladen");
    const safe = data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const path = `${data.vtcId}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !signed) throw safeError(error, "Upload-URL fehlgeschlagen", "documents");
    return { path, token: signed.token, signedUrl: signed.signedUrl };
  });

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      vtcId: z.string().uuid(),
      storagePath: z.string().min(1),
      name: z.string().min(1).max(200),
      mimeType: z.string().max(120).optional(),
      sizeBytes: z.number().int().nonnegative().max(500_000_000).optional(),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("vtc_documents").insert({
      vtc_id: data.vtcId,
      uploaded_by: userId,
      storage_path: data.storagePath,
      name: data.name,
      mime_type: data.mimeType ?? null,
      size_bytes: data.sizeBytes ?? null,
    });
    if (error) throw dbError(error, "documents");
    return { ok: true };
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("vtc_documents")
      .select("storage_path, name")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Dokument nicht gefunden");
    const { data: signed, error: sErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 5, { download: doc.name });
    if (sErr || !signed) throw safeError(sErr, "Download-URL fehlgeschlagen", "documents");
    return { url: signed.signedUrl };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ documentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc, error } = await supabase
      .from("vtc_documents")
      .select("storage_path")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Dokument nicht gefunden");
    await supabase.storage.from(BUCKET).remove([doc.storage_path]);
    const { error: dErr } = await supabase.from("vtc_documents").delete().eq("id", data.documentId);
    if (dErr) throw dbError(dErr, "documents");
    return { ok: true };
  });
