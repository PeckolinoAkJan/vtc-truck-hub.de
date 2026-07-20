import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VtcMessage = {
  id: string;
  created_at: string;
  vtc_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
};

/**
 * Subscribes to realtime INSERTs on public.messages filtered by vtc_id and
 * also loads the recent history once on mount. Completely isolated from the
 * telemetry sync loop — only reads/streams chat rows into local state.
 */
export function useVtcMessages(vtcId: string | null | undefined, limit = 100) {
  const [messages, setMessages] = useState<VtcMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(!!vtcId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vtcId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, created_at, vtc_id, sender_id, sender_name, message")
        .eq("vtc_id", vtcId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setMessages([]);
      } else {
        setMessages((data ?? []).slice().reverse() as VtcMessage[]);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`messages-${vtcId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `vtc_id=eq.${vtcId}`,
        },
        (payload) => {
          const row = payload.new as VtcMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === row.id) ? prev : [...prev, row],
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [vtcId, limit]);

  return { messages, loading, error };
}
