import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Globe,
  Instagram,
  MessageCircle,
  UserPlus,
  Clock,
  Check,
  LogIn,
} from "lucide-react";
import { getPublicVtc } from "@/lib/public.functions";
import { getVtcPublicProfile, createJoinRequest, cancelJoinRequest } from "@/lib/vtcs.functions";
import { listPublicVtcEvents, joinPublicVtcEvent } from "@/lib/events.functions";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, MapPin, Flag, Users } from "lucide-react";

const publicVtcQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-vtc", slug],
    queryFn: () => getPublicVtc({ data: { slug } }),
  });

export const Route = createFileRoute("/s/$slug")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(publicVtcQuery(params.slug)),
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Spedition"} — VTC Hub` },
      {
        name: "description",
        content:
          loaderData?.description ??
          `Erfahre mehr über die Spedition ${loaderData?.name ?? ""} und bewirb dich als Fahrer.`,
      },
      { property: "og:title", content: `${loaderData?.name ?? "Spedition"} — VTC Hub` },
      { property: "og:description", content: loaderData?.description ?? "" },
      ...(loaderData?.logo_url
        ? [{ property: "og:image", content: loaderData.logo_url }]
        : []),
    ],
  }),
  component: PublicVtcPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-muted-foreground">
      {error instanceof Error ? error.message : "Fehler beim Laden."}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-8 text-sm text-muted-foreground">Spedition nicht gefunden.</div>
  ),
});

function PublicVtcPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: vtc } = useSuspenseQuery(publicVtcQuery(slug));

  const [sessionReady, setSessionReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setSessionReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchAuthProfile = useServerFn(getVtcPublicProfile);
  const authProfile = useQuery({
    queryKey: ["public-vtc-auth", slug, userId],
    queryFn: () => fetchAuthProfile({ data: { slug } }),
    enabled: !!userId,
  });

  const doApply = useServerFn(createJoinRequest);
  const doCancel = useServerFn(cancelJoinRequest);
  const [message, setMessage] = useState("");

  const apply = useMutation({
    mutationFn: (msg: string) =>
      doApply({ data: { vtcId: vtc.id, message: msg || undefined } }),
    onSuccess: () => {
      toast.success("Bewerbung gesendet");
      setMessage("");
      qc.invalidateQueries({ queryKey: ["public-vtc-auth", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => doCancel({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Bewerbung zurückgezogen");
      qc.invalidateQueries({ queryKey: ["public-vtc-auth", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  const loggedOut = sessionReady && !userId;
  const info = authProfile.data;
  const isMember = !!info?.isMember;
  const pending = info?.pendingRequest ?? null;

  return (
    <div className="hero-bg min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-6">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-md border border-border bg-surface/60 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Zurück zur Startseite
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-16">
        <div className="panel p-8">
          <div className="flex items-start gap-6">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-2">
              {vtc.logo_url ? (
                <img src={vtc.logo_url} alt={vtc.name} className="size-full object-cover" />
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
            {loggedOut ? (
              <button
                onClick={() =>
                  navigate({
                    to: "/auth",
                    search: { mode: "signup", redirect: `/s/${slug}` },
                  })
                }
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90"
              >
                <LogIn className="size-4" />
                Registrieren, um dich zu bewerben
              </button>
            ) : !sessionReady || authProfile.isLoading ? (
              <div className="text-sm text-muted-foreground">Lade…</div>
            ) : isMember ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
                <Check className="size-4" />
                Du bist bereits Mitglied dieser Spedition.
              </div>
            ) : info && (info as { hasOwnVtc?: boolean }) && false ? null : pending ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                  <Clock className="size-4" />
                  Deine Bewerbung wurde eingereicht und wartet auf Antwort.
                </div>
                <button
                  onClick={() => cancel.mutate(pending.id)}
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
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90 disabled:opacity-60"
                >
                  <UserPlus className="size-4" />
                  {apply.isPending ? "Wird gesendet…" : "Spedition beitreten / Bewerben"}
                </button>
              </div>
            )}
          </div>
        </div>

        <PublicEventsSection slug={slug} userId={userId} />
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

function PublicEventsSection({ slug, userId }: { slug: string; userId: string | null }) {
  const fetchEvents = useServerFn(listPublicVtcEvents);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: events } = useQuery({
    queryKey: ["public-vtc-events", slug],
    queryFn: () => fetchEvents({ data: { slug } }),
  });
  const doJoin = useServerFn(joinPublicVtcEvent);
  const joinMut = useMutation({
    mutationFn: (eventId: string) => doJoin({ data: { eventId } }),
    onSuccess: () => {
      toast.success("Anmeldung gesendet");
      qc.invalidateQueries({ queryKey: ["public-vtc-events", slug] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  if (!events || events.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="size-5 text-primary" /> Kommende Konvois
      </h2>
      <div className="grid gap-3">
        {events.map((e) => (
          <div key={e.id} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold">{e.title}</h3>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>🕒 {new Date(e.starts_at).toLocaleString("de-DE")}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {e.meeting_point}</span>
                  <span className="inline-flex items-center gap-1"><Flag className="size-3.5" /> {e.destination}</span>
                  <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> {e.participant_count}{e.max_participants ? ` / ${e.max_participants}` : ""}</span>
                </div>
                {e.description && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{e.description}</p>}
              </div>
              <button
                onClick={() => {
                  if (!userId) {
                    navigate({ to: "/auth", search: { mode: "signup", redirect: `/s/${slug}` } });
                    return;
                  }
                  joinMut.mutate(e.id);
                }}
                disabled={!!e.max_participants && e.participant_count >= e.max_participants}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-60"
              >
                Teilnehmen
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
