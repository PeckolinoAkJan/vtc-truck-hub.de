import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Upload,
  Download,
  Trash2,
  Folder,
  FolderPlus,
  Filter,
  Search,
  Hash,
  Lock,
  MessageSquare,
  Send,
  ThumbsUp,
  Smile,
  Paperclip,
  Plus,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import {
  createDocumentUploadUrl,
  registerDocument,
  getDocumentDownloadUrl,
  deleteDocument,
} from "@/lib/documents.functions";
import {
  listFolders,
  createFolder,
  deleteFolder,
  assignDocumentFolder,
  listDocumentsRich,
  listChannels,
  createChannel,
  listChannelMessages,
  sendChannelMessage,
  toggleReaction,
  listChannelFiles,
  listMembersRich,
} from "@/lib/hub.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vtc/$slug/documents")({
  component: HubPage,
});

function humanSize(n: number | null | undefined) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Admin",
  admin: "Admin",
  dispatcher: "Dispatcher",
  driver: "Fahrer",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-primary/15 text-primary",
  admin: "bg-primary/15 text-primary",
  dispatcher: "bg-blue-500/15 text-blue-400",
  driver: "bg-surface-2 text-muted-foreground",
};

function HubPage() {
  const { slug } = Route.useParams();
  const [tab, setTab] = useState<"documents" | "messages">("documents");

  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const canManage = ctx?.role === "owner" || ctx?.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente & Nachrichten"
        subtitle="Zentrale für Dokumentenverwaltung und Kommunikation deiner VTC."
        icon={FileText}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <TabBtn active={tab === "documents"} onClick={() => setTab("documents")} icon={FileText} label="Dokumente" />
          <TabBtn
            active={tab === "messages"}
            onClick={() => setTab("messages")}
            icon={MessageSquare}
            label="Nachrichten"
          />
        </div>
      </div>

      {vtcId && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            {tab === "documents" ? (
              <DocumentsPanel vtcId={vtcId} canManage={!!canManage} />
            ) : (
              <MessagesPanel vtcId={vtcId} />
            )}
          </div>
          <div className="space-y-4">
            {tab === "documents" ? (
              <QuickChatSidebar vtcId={vtcId} />
            ) : (
              <MessagesSidebar vtcId={vtcId} canManage={!!canManage} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      {label}
      {typeof badge === "number" && badge > 0 && (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

/* -------------------- Documents Panel -------------------- */

function DocumentsPanel({ vtcId, canManage }: { vtcId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const [activeFolder, setActiveFolder] = useState<string | "all" | "unassigned">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const fetchFolders = useServerFn(listFolders);
  const fetchDocs = useServerFn(listDocumentsRich);
  const createUrl = useServerFn(createDocumentUploadUrl);
  const register = useServerFn(registerDocument);
  const createFolderFn = useServerFn(createFolder);
  const deleteFolderFn = useServerFn(deleteFolder);
  const assignFolder = useServerFn(assignDocumentFolder);
  const getDl = useServerFn(getDocumentDownloadUrl);
  const del = useServerFn(deleteDocument);

  const { data: folders = [] } = useQuery({
    queryKey: ["hub-folders", vtcId],
    queryFn: () => fetchFolders({ data: { vtcId } }),
  });

  const folderIdArg =
    activeFolder === "all"
      ? undefined
      : activeFolder === "unassigned"
        ? null
        : activeFolder;

  const { data: docsResp } = useQuery({
    queryKey: ["hub-docs", vtcId, folderIdArg, search, page, pageSize],
    queryFn: () =>
      fetchDocs({
        data: {
          vtcId,
          folderId: folderIdArg,
          search: search || undefined,
          page,
          pageSize,
        },
      }),
  });

  const docs = docsResp?.rows ?? [];
  const total = docsResp?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const storageUsed = docsResp?.storageUsed ?? 0;
  const storageLimit = 10 * 1024 * 1024 * 1024; // 10 GB

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const up = await createUrl({ data: { vtcId, fileName: file.name } });
        const { error: upErr } = await supabase.storage
          .from("vtc-documents")
          .uploadToSignedUrl(up.path, up.token, file, { contentType: file.type || undefined });
        if (upErr) throw new Error(upErr.message);
        await register({
          data: {
            vtcId,
            storagePath: up.path,
            name: file.name,
            mimeType: file.type || undefined,
            sizeBytes: file.size,
          },
        });
      }
      toast.success("Dokumente hochgeladen");
      qc.invalidateQueries({ queryKey: ["hub-docs", vtcId] });
      qc.invalidateQueries({ queryKey: ["hub-folders", vtcId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { documentId: id } }),
    onSuccess: () => {
      toast.success("Dokument gelöscht");
      qc.invalidateQueries({ queryKey: ["hub-docs", vtcId] });
      qc.invalidateQueries({ queryKey: ["hub-folders", vtcId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  const newFolderMut = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { vtcId, name } }),
    onSuccess: () => {
      toast.success("Ordner angelegt");
      qc.invalidateQueries({ queryKey: ["hub-folders", vtcId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  const delFolderMut = useMutation({
    mutationFn: (id: string) => deleteFolderFn({ data: { folderId: id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hub-folders", vtcId] });
      qc.invalidateQueries({ queryKey: ["hub-docs", vtcId] });
    },
  });

  const assignMut = useMutation({
    mutationFn: (v: { documentId: string; folderId: string | null }) =>
      assignFolder({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hub-docs", vtcId] });
      qc.invalidateQueries({ queryKey: ["hub-folders", vtcId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  async function handleDownload(id: string) {
    try {
      const { url } = await getDl({ data: { documentId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
    }
  }

  return (
    <div className="panel overflow-hidden">
      {/* Header inside card */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-lg font-semibold">Dokumente</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <button
              onClick={() => {
                const name = prompt("Ordnername");
                if (name?.trim()) newFolderMut.mutate(name.trim());
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface"
            >
              <FolderPlus className="size-4" /> Neuer Ordner
            </button>
          )}
          {canManage && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Upload className="size-4" />
                {uploading ? "Lade hoch…" : "Upload"}
              </button>
            </>
          )}
          <button
            className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface-2 hover:bg-surface"
            title="Filter"
          >
            <Filter className="size-4" />
          </button>
        </div>
      </div>

      {/* Search / filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Dokumente suchen…"
            className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <option>Alle Kategorien</option>
        </select>
        <select className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
          <option>Sortieren: Neueste</option>
          <option>Sortieren: Älteste</option>
        </select>
      </div>

      <div className="grid gap-0 md:grid-cols-[240px_minmax(0,1fr)]">
        {/* Folder sidebar */}
        <aside className="border-b border-border p-4 md:border-b-0 md:border-r">
          <h3 className="mb-3 text-sm font-semibold">Ordner</h3>
          <ul className="space-y-1">
            <FolderRow
              icon={Folder}
              label="Alle Dokumente"
              count={total}
              active={activeFolder === "all"}
              onClick={() => {
                setActiveFolder("all");
                setPage(1);
              }}
            />
            <FolderRow
              icon={Folder}
              label="Ohne Ordner"
              count={undefined}
              active={activeFolder === "unassigned"}
              onClick={() => {
                setActiveFolder("unassigned");
                setPage(1);
              }}
            />
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                icon={Folder}
                label={f.name}
                count={f.doc_count}
                active={activeFolder === f.id}
                onClick={() => {
                  setActiveFolder(f.id);
                  setPage(1);
                }}
                onDelete={
                  canManage
                    ? () => {
                        if (confirm(`Ordner "${f.name}" löschen?`)) delFolderMut.mutate(f.id);
                      }
                    : undefined
                }
              />
            ))}
          </ul>

          <div className="mt-6 rounded-lg border border-border bg-surface-2/60 p-3">
            <div className="mb-1 text-xs text-muted-foreground">Speicherplatz</div>
            <div className="text-sm font-medium">
              {humanSize(storageUsed)} / {humanSize(storageLimit)} verwendet
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${Math.min(100, (storageUsed / storageLimit) * 100).toFixed(1)}%`,
                }}
              />
            </div>
            <div className="mt-1 text-right text-xs num text-muted-foreground">
              {((storageUsed / storageLimit) * 100).toFixed(0)}%
            </div>
            {canManage && (
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-2"
              >
                Speicher verwalten
              </button>
            )}
          </div>
        </aside>

        {/* Document list */}
        <div className="min-w-0">
          {docs.length === 0 ? (
            <div className="grid min-h-60 place-items-center text-sm text-muted-foreground">
              Keine Dokumente in diesem Ordner.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left font-medium">Name</th>
                    <th className="p-3 text-left font-medium">Ordner</th>
                    <th className="p-3 text-right font-medium">Größe</th>
                    <th className="p-3 text-left font-medium">Geändert</th>
                    <th className="p-3 text-right font-medium">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-t border-border/60 hover:bg-surface-2/40">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <FileIcon name={d.name} />
                          <div>
                            <div className="font-medium">{d.name}</div>
                            <div className="text-xs text-muted-foreground">{d.mime_type ?? "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        {canManage ? (
                          <select
                            value={d.folder?.id ?? ""}
                            onChange={(e) =>
                              assignMut.mutate({
                                documentId: d.id,
                                folderId: e.target.value || null,
                              })
                            }
                            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                          >
                            <option value="">— kein Ordner —</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        ) : d.folder ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            {d.folder.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right num">{humanSize(d.size_bytes)}</td>
                      <td className="p-3 text-muted-foreground">
                        <div className="text-xs">
                          {new Date(d.created_at).toLocaleDateString("de-DE")}
                        </div>
                        <div className="text-xs">von {d.uploader_name}</div>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => handleDownload(d.id)}
                            className="grid size-8 place-items-center rounded-md border border-border bg-surface-2 hover:bg-surface"
                            title="Download"
                          >
                            <Download className="size-3.5" />
                          </button>
                          {canManage && (
                            <button
                              onClick={() => {
                                if (confirm(`"${d.name}" wirklich löschen?`)) delMut.mutate(d.id);
                              }}
                              className="grid size-8 place-items-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                              title="Löschen"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm">
            <div className="text-muted-foreground">
              Zeige {(page - 1) * pageSize + 1} bis {Math.min(page * pageSize, total)} von {total} Dokumenten
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
              >
                <option value={10}>10 pro Seite</option>
                <option value={25}>25 pro Seite</option>
                <option value={50}>50 pro Seite</option>
              </select>
              <PageNav page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  icon: Icon,
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  icon: typeof Folder;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <li>
      <div
        className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
          active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <button onClick={onClick} className="flex flex-1 items-center gap-2 text-left">
          <Icon className="size-4" />
          <span className="truncate">{label}</span>
        </button>
        {typeof count === "number" && (
          <span className="num text-xs text-muted-foreground">{count}</span>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="hidden text-muted-foreground hover:text-rose-400 group-hover:inline-flex"
            title="Ordner löschen"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "bg-rose-500/15 text-rose-400",
    doc: "bg-blue-500/15 text-blue-400",
    docx: "bg-blue-500/15 text-blue-400",
    xls: "bg-emerald-500/15 text-emerald-400",
    xlsx: "bg-emerald-500/15 text-emerald-400",
    zip: "bg-amber-500/15 text-amber-400",
    rar: "bg-amber-500/15 text-amber-400",
    jpg: "bg-fuchsia-500/15 text-fuchsia-400",
    jpeg: "bg-fuchsia-500/15 text-fuchsia-400",
    png: "bg-fuchsia-500/15 text-fuchsia-400",
  };
  const tone = map[ext] ?? "bg-primary/15 text-primary";
  return (
    <div className={`grid size-9 place-items-center rounded-md text-[10px] font-bold uppercase ${tone}`}>
      {ext.slice(0, 4) || "DOC"}
    </div>
  );
}

function PageNav({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const pages = useMemo(() => {
    const arr: (number | "…")[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) arr.push(i);
      else if (arr[arr.length - 1] !== "…") arr.push("…");
    }
    return arr;
  }, [page, totalPages]);
  return (
    <div className="flex items-center gap-1">
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e-${i}`} className="px-2 text-xs text-muted-foreground">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`grid size-8 place-items-center rounded-md text-xs ${
              p === page ? "bg-primary text-primary-foreground" : "border border-border bg-surface-2 hover:bg-surface"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="grid size-8 place-items-center rounded-md border border-border bg-surface-2 disabled:opacity-40"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/* -------------------- Messages Panel (channel-based) -------------------- */

function MessagesPanel({ vtcId }: { vtcId: string }) {
  const fetchChannels = useServerFn(listChannels);
  const { data: channels = [] } = useQuery({
    queryKey: ["hub-channels", vtcId],
    queryFn: () => fetchChannels({ data: { vtcId } }),
  });
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  useEffect(() => {
    if (!activeChannel && channels.length) {
      setActiveChannel(channels.find((c) => c.is_default)?.id ?? channels[0].id);
    }
  }, [channels, activeChannel]);
  const channel = channels.find((c) => c.id === activeChannel) ?? null;

  return (
    <div className="panel overflow-hidden">
      {channel ? (
        <ChannelView vtcId={vtcId} channel={channel} />
      ) : (
        <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
          Kein Kanal ausgewählt.
        </div>
      )}
    </div>
  );
}

function ChannelView({
  vtcId,
  channel,
}: {
  vtcId: string;
  channel: { id: string; name: string; description: string | null; is_private: boolean };
}) {
  const qc = useQueryClient();
  const fetchMsgs = useServerFn(listChannelMessages);
  const sendFn = useServerFn(sendChannelMessage);
  const toggleFn = useServerFn(toggleReaction);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  const { data: messages = [] } = useQuery({
    queryKey: ["hub-messages", channel.id],
    queryFn: () => fetchMsgs({ data: { channelId: channel.id, limit: 200 } }),
    refetchInterval: 6_000,
  });

  useEffect(() => {
    const t = setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    return () => clearTimeout(t);
  }, [messages.length, channel.id]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [channel.id]);

  useEffect(() => {
    const ch = supabase
      .channel(`hub-channel-${channel.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vtc_channel_messages", filter: `channel_id=eq.${channel.id}` },
        () => qc.invalidateQueries({ queryKey: ["hub-messages", channel.id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vtc_message_reactions" },
        () => qc.invalidateQueries({ queryKey: ["hub-messages", channel.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channel.id, qc]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendFn({ data: { vtcId, channelId: channel.id, body } });
      setText("");
      qc.invalidateQueries({ queryKey: ["hub-messages", channel.id] });
      qc.invalidateQueries({ queryKey: ["hub-channels", vtcId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konnte nicht gesendet werden");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  async function react(messageId: string, emoji: string) {
    try {
      await toggleFn({ data: { messageId, emoji } });
      qc.invalidateQueries({ queryKey: ["hub-messages", channel.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reaktion fehlgeschlagen");
    }
  }

  return (
    <div className="flex h-[calc(100vh-16rem)] min-h-[520px] flex-col">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold">
            {channel.is_private ? <Lock className="size-4" /> : <Hash className="size-4" />}
            {channel.name}
          </div>
          {channel.description && (
            <div className="text-xs text-muted-foreground">{channel.description}</div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Noch keine Nachrichten. Schreibe die erste!
          </div>
        )}
        {messages.map((m) => {
          const mine = m.user_id === myId;
          return (
            <div key={m.id} className={`flex gap-3 ${mine ? "flex-row-reverse" : ""}`}>
              <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/20 text-xs font-bold text-primary">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt={m.display_name} className="size-full object-cover" />
                ) : (
                  m.display_name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                <div
                  className={`mb-1 flex items-center gap-2 text-xs ${mine ? "justify-end" : ""}`}
                >
                  <span className="font-semibold text-foreground">{m.display_name}</span>
                  {m.role && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${ROLE_COLORS[m.role] ?? "bg-surface-2"}`}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {new Date(m.created_at).toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <div
                  className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                    mine ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground"
                  }`}
                >
                  {m.body}
                </div>
                <div className={`mt-1 flex flex-wrap items-center gap-1 ${mine ? "justify-end" : ""}`}>
                  {Object.entries(m.reactions).map(([emoji, count]) => (
                    <button
                      key={emoji}
                      onClick={() => react(m.id, emoji)}
                      className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs hover:bg-surface"
                    >
                      {emoji} {count}
                    </button>
                  ))}
                  <button
                    onClick={() => react(m.id, "👍")}
                    className="rounded-full border border-transparent px-1.5 py-0.5 text-xs text-muted-foreground hover:border-border hover:bg-surface-2"
                    title="Reagieren"
                  >
                    <ThumbsUp className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-border p-3">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nachricht eingeben…"
          maxLength={4000}
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-muted-foreground hover:bg-surface"
          title="Anhang"
        >
          <Paperclip className="size-4" />
        </button>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-lg border border-border bg-surface-2 text-muted-foreground hover:bg-surface"
          title="Emoji"
        >
          <Smile className="size-4" />
        </button>
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          title="Senden"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

/* -------------------- Sidebars -------------------- */

function QuickChatSidebar({ vtcId }: { vtcId: string }) {
  const fetchChannels = useServerFn(listChannels);
  const { data: channels = [] } = useQuery({
    queryKey: ["hub-channels", vtcId],
    queryFn: () => fetchChannels({ data: { vtcId } }),
  });
  const defaultChannel = channels.find((c) => c.is_default) ?? channels[0];

  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Hash className="size-4" /> {defaultChannel?.name ?? "Allgemeiner Chat"}
          </div>
          <div className="text-xs text-muted-foreground">
            {defaultChannel?.description ?? "Allgemeine Kommunikation"}
          </div>
        </div>
      </div>
      {defaultChannel ? (
        <MiniChatPreview vtcId={vtcId} channelId={defaultChannel.id} />
      ) : (
        <div className="text-sm text-muted-foreground">Kein Kanal verfügbar.</div>
      )}
    </div>
  );
}

function MiniChatPreview({ vtcId, channelId }: { vtcId: string; channelId: string }) {
  const fetchMsgs = useServerFn(listChannelMessages);
  const sendFn = useServerFn(sendChannelMessage);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const { data: messages = [] } = useQuery({
    queryKey: ["hub-messages", channelId],
    queryFn: () => fetchMsgs({ data: { channelId, limit: 20 } }),
    refetchInterval: 8_000,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await sendFn({ data: { vtcId, channelId, body: text.trim() } });
      setText("");
      qc.invalidateQueries({ queryKey: ["hub-messages", channelId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  const recent = messages.slice(-6);
  return (
    <div>
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {recent.length === 0 && (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Noch keine Nachrichten
          </div>
        )}
        {recent.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/20 text-[10px] font-bold text-primary">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt={m.display_name} className="size-full object-cover" />
              ) : (
                m.display_name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold">{m.display_name}</span>
                <span className="text-muted-foreground">
                  {new Date(m.created_at).toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="truncate text-xs text-muted-foreground">{m.body}</div>
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nachricht eingeben…"
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}

function MessagesSidebar({ vtcId, canManage }: { vtcId: string; canManage: boolean }) {
  const qc = useQueryClient();
  const fetchChannels = useServerFn(listChannels);
  const fetchMembers = useServerFn(listMembersRich);
  const fetchFiles = useServerFn(listChannelFiles);
  const createCh = useServerFn(createChannel);

  const { data: channels = [] } = useQuery({
    queryKey: ["hub-channels", vtcId],
    queryFn: () => fetchChannels({ data: { vtcId } }),
  });
  const { data: members = [] } = useQuery({
    queryKey: ["hub-members", vtcId],
    queryFn: () => fetchMembers({ data: { vtcId } }),
  });
  const { data: files = [] } = useQuery({
    queryKey: ["hub-files", vtcId],
    queryFn: () => fetchFiles({ data: { vtcId } }),
  });

  const newChannelMut = useMutation({
    mutationFn: (name: string) => createCh({ data: { vtcId, name } }),
    onSuccess: () => {
      toast.success("Kanal erstellt");
      qc.invalidateQueries({ queryKey: ["hub-channels", vtcId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  return (
    <>
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Kanäle</h3>
          {canManage && (
            <button
              onClick={() => {
                const name = prompt("Kanalname");
                if (name?.trim()) newChannelMut.mutate(name.trim());
              }}
              className="grid size-6 place-items-center rounded-md bg-primary/15 text-primary hover:bg-primary/25"
            >
              <Plus className="size-3.5" />
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {channels.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <span className="flex items-center gap-2 truncate">
                {c.is_private ? <Lock className="size-3.5" /> : <Hash className="size-3.5" />}
                <span className="truncate">{c.name}</span>
              </span>
              {c.message_count > 0 && (
                <span className="num rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {c.message_count}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold">Mitglieder ({members.length})</h3>
        <ul className="space-y-2">
          {members.slice(0, 8).map((m) => (
            <li key={m.user_id} className="flex items-center gap-2">
              <div className="relative">
                <div className="grid size-8 place-items-center overflow-hidden rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.display_name} className="size-full object-cover" />
                  ) : (
                    m.display_name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-surface bg-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{m.display_name}</div>
                <div className="text-xs text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role}</div>
              </div>
            </li>
          ))}
        </ul>
        {members.length > 8 && (
          <button className="mt-3 w-full rounded-lg border border-border bg-surface-2 py-1.5 text-xs hover:bg-surface">
            Alle Mitglieder anzeigen
          </button>
        )}
      </div>

      <div className="panel p-4">
        <h3 className="mb-3 text-sm font-semibold">Dateien in diesem Kanal</h3>
        {files.length === 0 ? (
          <div className="text-xs text-muted-foreground">Keine Dateien</div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-xs">
                <FileIcon name={f.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.name}</div>
                  <div className="text-muted-foreground">{humanSize(f.size_bytes)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
