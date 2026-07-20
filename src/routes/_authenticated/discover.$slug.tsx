import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ClientDownloadButton } from "@/components/ClientDownloadButton";
import {
  ArrowLeft,
  Building2,
  Globe,
  Instagram,
  MessageCircle,
  UserPlus,
  Clock,
  Check,
} from "lucide-react";
import {
  getVtcPublicProfile,
  createJoinRequest,
  cancelJoinRequest,
} from "@/lib/vtcs.functions";

export const Route = createFileRoute("/_authenticated/discover/$slug")({
  component: DiscoverVtc,
});

function DiscoverVtc() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getVtcPublicProfile);
  const doApply = useServerFn(createJoinRequest);
  const doCancel = useServerFn(cancelJoinRequest);
  const [message, setMessage] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["vtc-discover", slug],
    queryFn: () => fetchProfile({ data: { slug } }),
  });

  const apply = useMutation({
    mutationFn: (msg: string) => doApply({ data: { vtcId: data!.vtc.id!, message: msg || undefined } }),
    onSuccess: () => {
      toast.success("Bewerbung gesendet");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["vtc-discover", slug] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Fehler"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => doCancel({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Bewerbung zurückgezogen");
      qc.invalidateQueries({ queryKey: ["vtc-discover", slug] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Fehler"),
  });

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Lade…</div>;
  if (error || !data)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Spedition nicht gefunden."}
      </div>
    );

  const vtc = data.vtc;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
        <Link
          to="/profile"
          className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Zurück
        </Link>
        <div className="ml-auto">
          <ClientDownloadButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <div className="panel p-8">
          <div className="flex items-start gap-6">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-2">
              {vtc.logo_url ? (
                <img src={vtc.logo_url} alt={vtc.name ?? ""} className="size-full object-cover" />
              ) : (
                <Building2 className="size-10 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                [{vtc.tag}] Spedition
              </div>
              <h1 className="mt-1 truncate text-3xl font-bold">{vtc.name}</h1>
              {vtc.description && (
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                  {vtc.description}
                </p>
              )}
            </div>
          </div>

          {(vtc.discord_url || vtc.website_url || vtc.instagram_url) && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-6">
              {vtc.website_url && (
                <SocialLink href={vtc.website_url} icon={Globe} label="Website" />
              )}
              {vtc.discord_url && (
                <SocialLink href={vtc.discord_url} icon={MessageCircle} label="Discord" />
              )}
              {vtc.instagram_url && (
                <SocialLink href={vtc.instagram_url} icon={Instagram} label="Instagram" />
              )}
            </div>
          )}

          <div className="mt-8 border-t border-border pt-6">
            {data.isMember ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
                <Check className="size-4" />
                Du bist bereits Mitglied dieser Spedition.
              </div>
            ) : data.pendingRequest ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                  <Clock className="size-4" />
                  Deine Bewerbung wurde eingereicht und wartet auf Antwort des Inhabers.
                </div>
                <button
                  onClick={() => cancel.mutate(data.pendingRequest!.id)}
                  disabled={cancel.isPending}
                  className="text-xs text-destructive hover:underline"
                >
                  Bewerbung zurückziehen
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Kurze Nachricht (optional)
                  </span>
                  <textarea
                    className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
                    rows={3}
                    maxLength={500}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Warum möchtest du dieser Spedition beitreten?"
                  />
                </label>
                <button
                  onClick={() => apply.mutate(message)}
                  disabled={apply.isPending}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  <UserPlus className="size-4" />
                  {apply.isPending ? "Wird gesendet…" : "Spedition beitreten / Bewerben"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SocialLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
    >
      <Icon className="size-4" />
      {label}
    </a>
  );
}
