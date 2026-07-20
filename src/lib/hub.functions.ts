import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbError, safeError } from "./server-errors";

// intentionally no shared helpers — RLS enforces access


// ---------- Folders ----------
export const listFolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: folders, error } = await supabase
      .from("vtc_document_folders")
      .select("id, name, sort, created_at")
      .eq("vtc_id", data.vtcId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw dbError(error, "hub");
    // count documents per folder
    const ids = (folders ?? []).map((f) => f.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: mapRows } = await supabase
        .from("vtc_document_folder_map")
        .select("folder_id")
        .in("folder_id", ids);
      counts = (mapRows ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.folder_id] = (acc[r.folder_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return (folders ?? []).map((f) => ({ ...f, doc_count: counts[f.id] ?? 0 }));
  });

export const createFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ vtcId: z.string().uuid(), name: z.string().trim().min(1).max(80) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("vtc_document_folders")
      .insert({ vtc_id: data.vtcId, name: data.name });
    if (error) throw dbError(error, "hub");
    return { ok: true };
  });

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ folderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_document_folders").delete().eq("id", data.folderId);
    if (error) throw dbError(error, "hub");
    return { ok: true };
  });

export const assignDocumentFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        documentId: z.string().uuid(),
        folderId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.folderId === null) {
      const { error } = await supabase.from("vtc_document_folder_map").delete().eq("document_id", data.documentId);
      if (error) throw dbError(error, "hub");
      return { ok: true };
    }
    const { error } = await supabase
      .from("vtc_document_folder_map")
      .upsert({ document_id: data.documentId, folder_id: data.folderId });
    if (error) throw dbError(error, "hub");
    return { ok: true };
  });

// ---------- Documents (extended list with folder + uploader) ----------
export const listDocumentsRich = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        folderId: z.string().uuid().nullable().optional(),
        search: z.string().max(80).optional(),
        page: z.number().int().min(1).max(200).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 10;

    // folder filter → set of document ids
    let restrictIds: string[] | null = null;
    if (data.folderId !== undefined) {
      if (data.folderId === null) {
        // unassigned: fetch mapped ids and exclude
        const { data: mapRows } = await supabase.from("vtc_document_folder_map").select("document_id");
        const mapped = new Set((mapRows ?? []).map((r) => r.document_id));
        const { data: allDocs } = await supabase
          .from("vtc_documents")
          .select("id")
          .eq("vtc_id", data.vtcId);
        restrictIds = (allDocs ?? []).map((d) => d.id).filter((id) => !mapped.has(id));
      } else {
        const { data: mapRows } = await supabase
          .from("vtc_document_folder_map")
          .select("document_id")
          .eq("folder_id", data.folderId);
        restrictIds = (mapRows ?? []).map((r) => r.document_id);
      }
      if (restrictIds.length === 0) {
        return { rows: [], total: 0, storageUsed: 0 };
      }
    }

    let q = supabase
      .from("vtc_documents")
      .select("id, name, mime_type, size_bytes, storage_path, uploaded_by, created_at", { count: "exact" })
      .eq("vtc_id", data.vtcId);
    if (restrictIds) q = q.in("id", restrictIds);
    if (data.search) q = q.ilike("name", `%${data.search}%`);
    q = q.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);

    const { data: rows, error, count } = await q;
    if (error) throw dbError(error, "hub");

    // storage total for footer widget
    const { data: allSizes } = await supabase
      .from("vtc_documents")
      .select("size_bytes")
      .eq("vtc_id", data.vtcId);
    const storageUsed = (allSizes ?? []).reduce((s, r) => s + Number(r.size_bytes ?? 0), 0);

    // uploader names + folder map
    const uploaderIds = Array.from(new Set((rows ?? []).map((r) => r.uploaded_by)));
    let profiles: Record<string, string> = {};
    if (uploaderIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", uploaderIds);
      profiles = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p.display_name ?? "User"]));
    }
    const docIds = (rows ?? []).map((r) => r.id);
    let folderMap: Record<string, { id: string; name: string }> = {};
    if (docIds.length) {
      const { data: mapRows } = await supabase
        .from("vtc_document_folder_map")
        .select("document_id, folder_id, vtc_document_folders(name)")
        .in("document_id", docIds);
      folderMap = Object.fromEntries(
        (mapRows ?? []).map((r) => [
          r.document_id,
          {
            id: r.folder_id,
            name:
              (r as { vtc_document_folders: { name: string } | null }).vtc_document_folders?.name ?? "",
          },
        ]),
      );
    }

    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        uploader_name: profiles[r.uploaded_by] ?? "User",
        folder: folderMap[r.id] ?? null,
      })),
      total: count ?? 0,
      storageUsed,
    };
  });

// ---------- Channels ----------
export const listChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: channels, error } = await supabase
      .from("vtc_channels")
      .select("id, name, description, sort, is_private, is_default, created_at")
      .eq("vtc_id", data.vtcId)
      .order("sort", { ascending: true });
    if (error) throw dbError(error, "hub");
    // unread counter is a lightweight message count (no per-user read state yet)
    const ids = (channels ?? []).map((c) => c.id);
    let counts: Record<string, number> = {};
    if (ids.length) {
      const { data: msgCounts } = await supabase
        .from("vtc_channel_messages")
        .select("channel_id")
        .in("channel_id", ids);
      counts = (msgCounts ?? []).reduce<Record<string, number>>((acc, r) => {
        acc[r.channel_id] = (acc[r.channel_id] ?? 0) + 1;
        return acc;
      }, {});
    }
    return (channels ?? []).map((c) => ({ ...c, message_count: counts[c.id] ?? 0 }));
  });

export const createChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        description: z.string().trim().max(200).optional(),
        isPrivate: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("vtc_channels").insert({
      vtc_id: data.vtcId,
      name: data.name,
      description: data.description ?? null,
      is_private: data.isPrivate ?? false,
    });
    if (error) throw dbError(error, "hub");
    return { ok: true };
  });

// ---------- Channel messages ----------
export const listChannelMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        channelId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("vtc_channel_messages")
      .select("id, vtc_id, channel_id, user_id, body, parent_id, is_system, created_at")
      .eq("channel_id", data.channelId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (error) throw dbError(error, "hub");

    const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    let profiles: Record<string, { display_name: string; avatar_url: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);
      profiles = Object.fromEntries(
        (profs ?? []).map((p) => [
          p.user_id,
          { display_name: p.display_name ?? "User", avatar_url: p.avatar_url ?? null },
        ]),
      );
    }

    // roles for badges
    const vtcIds = Array.from(new Set((rows ?? []).map((r) => r.vtc_id)));
    let roleMap: Record<string, string> = {};
    if (vtcIds.length && userIds.length) {
      const { data: memberRows } = await supabase
        .from("vtc_members")
        .select("user_id, role, vtc_id")
        .in("vtc_id", vtcIds)
        .in("user_id", userIds);
      roleMap = Object.fromEntries((memberRows ?? []).map((m) => [`${m.vtc_id}:${m.user_id}`, m.role]));
    }

    // reactions
    const msgIds = (rows ?? []).map((r) => r.id);
    const reactMap = new Map<string, Record<string, number>>();
    if (msgIds.length) {
      const { data: reacts } = await supabase
        .from("vtc_message_reactions")
        .select("message_id, emoji")
        .in("message_id", msgIds);
      for (const r of reacts ?? []) {
        const bucket = reactMap.get(r.message_id) ?? {};
        bucket[r.emoji] = (bucket[r.emoji] ?? 0) + 1;
        reactMap.set(r.message_id, bucket);
      }
    }

    return (rows ?? [])
      .reverse()
      .map((r) => ({
        id: r.id,
        vtc_id: r.vtc_id,
        channel_id: r.channel_id,
        user_id: r.user_id,
        body: r.body,
        parent_id: r.parent_id,
        is_system: r.is_system,
        created_at: r.created_at,
        display_name: profiles[r.user_id]?.display_name ?? "User",
        avatar_url: profiles[r.user_id]?.avatar_url ?? null,
        role: roleMap[`${r.vtc_id}:${r.user_id}`] ?? null,
        reactions: reactMap.get(r.id) ?? {},
      }));
  });

export const sendChannelMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        vtcId: z.string().uuid(),
        channelId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("vtc_channel_messages").insert({
      vtc_id: data.vtcId,
      channel_id: data.channelId,
      user_id: userId,
      body: data.body,
    });
    if (error) throw dbError(error, "hub");
    return { ok: true };
  });

export const toggleReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ messageId: z.string().uuid(), emoji: z.string().min(1).max(8) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("vtc_message_reactions")
      .select("id")
      .eq("message_id", data.messageId)
      .eq("user_id", userId)
      .eq("emoji", data.emoji)
      .maybeSingle();
    if (existing) {
      await supabase.from("vtc_message_reactions").delete().eq("id", existing.id);
      return { added: false };
    }
    const { error } = await supabase.from("vtc_message_reactions").insert({
      message_id: data.messageId,
      user_id: userId,
      emoji: data.emoji,
    });
    if (error) throw dbError(error, "hub");
    return { added: true };
  });

export const listChannelFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Files "in this channel" — we don't yet attach files to messages,
    // so we surface the most recent uploaded documents of the VTC.
    const { data: rows } = await context.supabase
      .from("vtc_documents")
      .select("id, name, size_bytes")
      .eq("vtc_id", data.vtcId)
      .order("created_at", { ascending: false })
      .limit(6);
    return rows ?? [];
  });

export const listMembersRich = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vtcId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members } = await supabase
      .from("vtc_members")
      .select("user_id, role")
      .eq("vtc_id", data.vtcId);
    const ids = (members ?? []).map((m) => m.user_id);
    if (!ids.length) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ids);
    const map = new Map((profs ?? []).map((p) => [p.user_id, p]));
    return (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      display_name: map.get(m.user_id)?.display_name ?? "User",
      avatar_url: map.get(m.user_id)?.avatar_url ?? null,
    }));
  });

