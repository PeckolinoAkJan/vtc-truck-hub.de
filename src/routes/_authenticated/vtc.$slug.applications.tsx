import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Check, X, UserPlus, Clock } from "lucide-react";
import {
  getVtcContext,
  listAllVtcJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
} from "@/lib/vtcs.functions";
import { supabase } from "@/integrations/supabase/client";
import { dt } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vtc/$slug/applications")({
  component: Applications,
});

function Applications() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const canManage = ctx && (ctx.role === "owner" || ctx.role === "admin");

  const fetchAll = useServerFn(listAllVtcJoinRequests);
  const doAccept = useServerFn(acceptJoinRequest);
  const doReject = useServerFn(rejectJoinRequest);

  const { data: requests } = useQuery({
    queryKey: ["applications", vtcId],
    queryFn: () => fetchAll({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId && !!canManage,
  });

  // Realtime: refetch when applications change for this VTC
  useEffect(() => {
    if (!vtcId) return;
    const channel = supabase
      .channel(`applications:${vtcId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vtc_join_requests", filter: `vtc_id=eq.${vtcId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["applications", vtcId] });
          qc.invalidateQueries({ queryKey: ["pending-applications", vtcId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vtcId, qc]);

  const accept = useMutation({
    mutationFn: (id: string) => doAccept({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Bewerbung angenommen");
      qc.invalidateQueries({ queryKey: ["applications", vtcId] });
      qc.invalidateQueries({ queryKey: ["pending-applications", vtcId] });
      qc.invalidateQueries({ queryKey: ["members", vtcId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Fehler"),
  });
  const reject = useMutation({
    mutationFn: (id: string) => doReject({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Bewerbung abgelehnt");
      qc.invalidateQueries({ queryKey: ["applications", vtcId] });
      qc.invalidateQueries({ queryKey: ["pending-applications", vtcId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Fehler"),
  });

  if (!canManage) {
    return (
      <div className="panel p-8 text-sm text-muted-foreground">
        Du hast keine Berechtigung, Bewerbungen zu verwalten.
      </div>
    );
  }

  const pending = (requests ?? []).filter((r) => r.status === "pending");
  const decided = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Team</div>
          <h1 className="mt-1 text-2xl font-semibold">Bewerbungen</h1>
        </div>
        {pending.length > 0 && (
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            {pending.length} offen
          </span>
        )}
      </div>

      <section className="panel p-5">
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Offene Bewerbungen ({pending.length})</h2>
        </div>

        {pending.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border bg-surface-2/40 px-4 py-10 text-center text-xs text-muted-foreground">
            Aktuell liegen keine offenen Bewerbungen vor.
          </div>
        ) : (
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
            {pending.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 bg-surface-2/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.profile?.display_name ?? "Unbekannt"}</div>
                  {r.message && (
                    <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground line-clamp-3">
                      „{r.message}"
                    </div>
                  )}
                  <div className="mt-1 text-[11px] text-muted-foreground">{dt(r.created_at)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => accept.mutate(r.id)}
                    disabled={accept.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <Check className="size-3.5" /> Annehmen
                  </button>
                  <button
                    onClick={() => reject.mutate(r.id)}
                    disabled={reject.isPending}
                    className="inline-flex items-center gap-1 rounded-md bg-destructive/15 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/25 disabled:opacity-50"
                  >
                    <X className="size-3.5" /> Ablehnen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {decided.length > 0 && (
        <section className="panel mt-6 p-5">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Historie</h2>
          </div>
          <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
            {decided.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 bg-surface-2/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.profile?.display_name ?? "Unbekannt"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Eingereicht {dt(r.created_at)}
                    {r.decided_at ? ` · Entschieden ${dt(r.decided_at)}` : ""}
                  </div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "pending" | "accepted" | "rejected" | "cancelled" }) {
  if (status === "accepted") {
    return (
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
        Angenommen
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
        Abgelehnt
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Zurückgezogen
      </span>
    );
  }
  return (
    <span className="rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
      Offen
    </span>
  );
}
