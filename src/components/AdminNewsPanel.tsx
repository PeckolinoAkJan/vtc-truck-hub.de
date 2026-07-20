import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Megaphone, Trash2, Plus } from "lucide-react";
import { useIsSuperAdmin } from "@/hooks/use-app-settings";
import { listNews, createNews, deleteNews } from "@/lib/news.functions";

export function AdminNewsPanel() {
  const isAdmin = useIsSuperAdmin();
  const qc = useQueryClient();
  const fetchList = useServerFn(listNews);
  const doCreate = useServerFn(createNews);
  const doDelete = useServerFn(deleteNews);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-news"],
    queryFn: () => fetchList(),
    enabled: isAdmin,
  });

  const createMut = useMutation({
    mutationFn: (v: { title: string; content: string }) => doCreate({ data: v }),
    onSuccess: () => {
      toast.success("News veröffentlicht.");
      setTitle("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      qc.invalidateQueries({ queryKey: ["public-news"] });
    },
    onError: (e: Error) => toast.error("Fehler: " + e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("News gelöscht.");
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      qc.invalidateQueries({ queryKey: ["public-news"] });
    },
    onError: (e: Error) => toast.error("Fehler: " + e.message),
  });

  if (!isAdmin) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      toast.error("Titel und Text erforderlich.");
      return;
    }
    createMut.mutate({ title: title.trim(), content: content.trim() });
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">News verwalten</h2>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          maxLength={200}
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="News-Text"
          rows={4}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          maxLength={5000}
        />
        <button
          type="submit"
          disabled={createMut.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
        >
          <Plus className="size-4" />
          {createMut.isPending ? "Veröffentliche…" : "News veröffentlichen"}
        </button>
      </form>

      <div className="mt-6 space-y-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">
          Vorhandene News
        </div>
        {isLoading && <div className="text-sm text-muted-foreground">Lade…</div>}
        {!isLoading && !(data ?? []).length && (
          <div className="text-sm text-muted-foreground">Noch keine News.</div>
        )}
        {(data ?? []).map((n) => (
          <div
            key={n.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{n.title}</div>
              <div className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
                {n.content}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">
                {new Date(n.created_at).toLocaleString("de-DE")}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm("Diese News wirklich löschen?")) deleteMut.mutate(n.id);
              }}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-rose-300 hover:bg-rose-500/20"
              title="Löschen"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
