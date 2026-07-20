import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import { listMessages, sendMessage, getProfileName } from "@/lib/messages.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/vtc/$slug/messages")({
  component: MessagesPage,
});

type Msg = {
  id: string;
  vtc_id: string;
  user_id: string;
  body: string;
  created_at: string;
  display_name: string;
  avatar_url: string | null;
};

function MessagesPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getVtcContext);
  const fetchList = useServerFn(listMessages);
  const sendFn = useServerFn(sendMessage);
  const fetchName = useServerFn(getProfileName);

  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;

  const { data: initial } = useQuery({
    queryKey: ["vtc-messages", vtcId],
    queryFn: () => fetchList({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMyId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (initial) setMessages(initial);
  }, [initial]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!vtcId) return;
    const channel = supabase
      .channel(`vtc-messages-${vtcId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vtc_messages", filter: `vtc_id=eq.${vtcId}` },
        async (payload) => {
          const row = payload.new as { id: string; vtc_id: string; user_id: string; body: string; created_at: string };
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, { ...row, display_name: "…", avatar_url: null }];
          });
          try {
            const p = await fetchName({ data: { userId: row.user_id } });
            setMessages((prev) =>
              prev.map((m) => (m.id === row.id ? { ...m, display_name: p.display_name, avatar_url: p.avatar_url } : m)),
            );
          } catch {
            /* ignore */
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "vtc_messages", filter: `vtc_id=eq.${vtcId}` },
        (payload) => {
          const row = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== row.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vtcId, fetchName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !vtcId || sending) return;
    setSending(true);
    try {
      await sendFn({ data: { vtcId, body } });
      setText("");
      qc.invalidateQueries({ queryKey: ["vtc-messages", vtcId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Konnte nicht gesendet werden");
    } finally {
      setSending(false);
    }
  }

  

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-4">
      <PageHeader
        title="Nachrichten"
        subtitle="Interner Team-Chat deiner Spedition."
        icon={MessageSquare}
      />

      <div className="panel flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Noch keine Nachrichten. Schreibe die erste!
            </div>
          )}
          {messages.map((m) => {
            const mine = m.user_id === myId;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/20 text-xs font-bold text-primary">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt={m.display_name} className="size-full object-cover" />
                  ) : (
                    (m.display_name || "?").slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className={`max-w-[75%] ${mine ? "text-right" : ""}`}>
                  <div className="mb-0.5 text-xs text-muted-foreground">
                    {m.display_name} · {new Date(m.created_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div
                    className={`inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-surface-2 text-foreground"
                    }`}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nachricht schreiben…"
            maxLength={4000}
            className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-4" />
            Senden
          </button>
        </form>
      </div>
    </div>
  );
}
