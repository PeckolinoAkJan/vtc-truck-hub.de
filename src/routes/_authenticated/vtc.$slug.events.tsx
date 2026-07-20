import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  MapPin,
  Users,
  Plus,
  Trash2,
  Flag,
  Clock,
  Search,
  Radio,
  Gamepad2,
  Star,
  Image as ImageIcon,
  X,
  Bell,
  ExternalLink,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import {
  listVtcEvents,
  getVtcEvent,
  createVtcEvent,
  updateVtcEvent,
  deleteVtcEvent,
  setEventStatus,
  rsvpVtcEvent,
  leaveVtcEvent,
  listEventParticipants,
  setParticipantRole,
  addEventMedia,
  deleteEventMedia,
  submitEventFeedback,
  setEventReminders,
  listEventReminders,
  getEventStats,
  type VtcEvent,
} from "@/lib/events.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/events")({
  component: EventsPage,
});

type Scope = "all" | "upcoming" | "running" | "past";
type GameFilter = "all" | "ets2" | "ats";
type ViewMode = "list" | "calendar" | "stats";

const ROLE_LABELS: Record<string, string> = {
  driver: "Fahrer",
  lead_driver: "Lead Driver",
  tail_driver: "Tail Driver",
  scout: "Scout",
  convoy_control: "Convoy Control",
  event_manager: "Event Manager",
  media_team: "Media Team",
  moderator: "Moderator",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  planned: { label: "Geplant", cls: "bg-muted text-muted-foreground" },
  open: { label: "Offen", cls: "bg-emerald-500/15 text-emerald-400" },
  closed: { label: "Geschlossen", cls: "bg-orange-500/15 text-orange-400" },
  cancelled: { label: "Abgesagt", cls: "bg-destructive/15 text-destructive" },
  completed: { label: "Abgeschlossen", cls: "bg-primary/15 text-primary" },
};

function EventsPage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const role = ctx?.role;
  const canManage = role === "owner" || role === "admin" || role === "dispatcher";

  const [view, setView] = useState<ViewMode>("list");
  const [scope, setScope] = useState<Scope>("upcoming");
  const [game, setGame] = useState<GameFilter>("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const fetchEvents = useServerFn(listVtcEvents);
  const { data: events } = useQuery({
    queryKey: ["vtc-events", vtcId, scope, game, search],
    queryFn: () => fetchEvents({ data: { vtcId: vtcId!, scope, game, search: search || undefined } }),
    enabled: !!vtcId,
  });

  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["vtc-events", vtcId] });

  return (
    <div>
      <PageHeader
        title="Events & Konvois"
        subtitle="Plane und koordiniere Konvois deiner Spedition."
        icon={CalendarDays}
      >
        {canManage && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90"
          >
            <Plus className="size-4" /> Neues Event
          </button>
        )}
      </PageHeader>

      {/* Toolbar */}
      <div className="panel mb-5 flex flex-wrap items-center gap-3 p-4">
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {(["list", "calendar", "stats"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 font-medium ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v === "list" ? "Liste" : v === "calendar" ? "Kalender" : "Statistiken"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {(["upcoming", "running", "past", "all"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-3 py-1.5 font-medium ${scope === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {s === "upcoming" ? "Kommend" : s === "running" ? "Laufend" : s === "past" ? "Vergangen" : "Alle"}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border bg-surface-2 p-0.5 text-xs">
          {(["all", "ets2", "ats"] as GameFilter[]).map((g) => (
            <button
              key={g}
              onClick={() => setGame(g)}
              className={`rounded-md px-3 py-1.5 font-medium uppercase ${game === g ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {g}
            </button>
          ))}
        </div>
        <div className="ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Event suchen…"
            className="rounded-md border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-xs"
          />
        </div>
      </div>

      {showForm && vtcId && (
        <CreateForm
          vtcId={vtcId}
          onDone={() => {
            setShowForm(false);
            invalidate();
          }}
        />
      )}

      {view === "list" && (
        <EventList
          events={events ?? []}
          canManage={canManage}
          onOpen={setOpenId}
          onChanged={invalidate}
        />
      )}
      {view === "calendar" && <CalendarView events={events ?? []} onOpen={setOpenId} />}
      {view === "stats" && vtcId && <StatsView vtcId={vtcId} />}

      {openId && (
        <EventDetailModal
          eventId={openId}
          canManage={canManage}
          onClose={() => setOpenId(null)}
          onChanged={invalidate}
        />
      )}
    </div>
  );
}

function EventList({
  events,
  canManage,
  onOpen,
  onChanged,
}: {
  events: VtcEvent[];
  canManage: boolean;
  onOpen: (id: string) => void;
  onChanged: () => void;
}) {
  const doRsvp = useServerFn(rsvpVtcEvent);
  const doLeave = useServerFn(leaveVtcEvent);
  const doDelete = useServerFn(deleteVtcEvent);

  const rsvpMut = useMutation({
    mutationFn: (vars: { eventId: string; rsvp: "going" | "maybe" | "declined" }) =>
      doRsvp({ data: vars }),
    onSuccess: (r) => {
      toast.success(r.rsvp === "waitlist" ? "Auf Warteliste gesetzt" : "Status aktualisiert");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  const leaveMut = useMutation({
    mutationFn: (eventId: string) => doLeave({ data: { eventId } }),
    onSuccess: () => {
      toast.success("Abgemeldet");
      onChanged();
    },
  });
  const delMut = useMutation({
    mutationFn: (eventId: string) => doDelete({ data: { eventId } }),
    onSuccess: () => {
      toast.success("Event gelöscht");
      onChanged();
    },
  });

  if (events.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Keine Events gefunden"
        body="Passe die Filter an oder erstelle einen neuen Konvoi."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {events.map((e) => (
        <EventCard
          key={e.id}
          event={e}
          canManage={canManage}
          onOpen={() => onOpen(e.id)}
          onRsvp={(rsvp) => rsvpMut.mutate({ eventId: e.id, rsvp })}
          onLeave={() => leaveMut.mutate(e.id)}
          onDelete={() => {
            if (confirm("Konvoi wirklich löschen?")) delMut.mutate(e.id);
          }}
        />
      ))}
    </div>
  );
}

function EventCard({
  event: e,
  canManage,
  onOpen,
  onRsvp,
  onLeave,
  onDelete,
}: {
  event: VtcEvent;
  canManage: boolean;
  onOpen: () => void;
  onRsvp: (r: "going" | "maybe" | "declined") => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const s = STATUS_BADGE[e.status] ?? STATUS_BADGE.planned;
  const full = !!e.max_participants && e.going_count >= e.max_participants;
  const pct = e.max_participants ? Math.min(100, Math.round((e.going_count / e.max_participants) * 100)) : 0;

  return (
    <div className="panel overflow-hidden">
      <div className="relative h-32 w-full bg-gradient-to-br from-primary/20 via-surface-2 to-surface">
        {e.banner_url ? (
          <img src={e.banner_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-muted-foreground">
            <CalendarDays className="size-10 opacity-30" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>
            {full ? "Ausgebucht" : s.label}
          </span>
          <span className="rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
            {e.game.toUpperCase()}
          </span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 text-base font-semibold">{e.title}</h3>
        <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {new Date(e.starts_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" /> {e.meeting_point}
          </span>
          <span className="inline-flex items-center gap-1">
            <Flag className="size-3.5" /> {e.destination}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Users className="size-3.5 text-muted-foreground" />
          <span className="font-medium">
            {e.going_count}
            {e.max_participants ? ` / ${e.max_participants}` : ""} Fahrer
          </span>
          {e.max_participants && (
            <div className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1">
          <RsvpBtn active={e.my_rsvp === "going"} onClick={() => onRsvp("going")} label="Zusagen" tone="emerald" />
          <RsvpBtn active={e.my_rsvp === "maybe"} onClick={() => onRsvp("maybe")} label="Vielleicht" tone="orange" />
          <RsvpBtn active={e.my_rsvp === "declined"} onClick={() => onRsvp("declined")} label="Absagen" tone="red" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={onOpen} className="text-xs font-medium text-primary hover:underline">
            Details ansehen
          </button>
          <div className="flex gap-2">
            {e.my_rsvp && (
              <button onClick={onLeave} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-[11px] hover:bg-muted">
                Zurückziehen
              </button>
            )}
            {canManage && (
              <button
                onClick={onDelete}
                className="inline-flex items-center gap-1 rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/20"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RsvpBtn({ active, onClick, label, tone }: { active: boolean; onClick: () => void; label: string; tone: "emerald" | "orange" | "red" }) {
  const cls = active
    ? tone === "emerald"
      ? "bg-emerald-500 text-white"
      : tone === "orange"
        ? "bg-orange-500 text-white"
        : "bg-destructive text-destructive-foreground"
    : "bg-surface-2 text-muted-foreground hover:text-foreground";
  return (
    <button onClick={onClick} className={`rounded-md px-2 py-1.5 text-[11px] font-medium ${cls}`}>
      {label}
    </button>
  );
}

/* ============ CALENDAR ============ */
function CalendarView({ events, onOpen }: { events: VtcEvent[]; onOpen: (id: string) => void }) {
  const [cursor, setCursor] = useState(() => new Date());
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Mo=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = useMemo(() => {
    const map = new Map<string, VtcEvent[]>();
    for (const e of events) {
      const d = new Date(e.starts_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = String(d.getDate());
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events, year, month]);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="panel p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-muted"
          >
            ‹
          </button>
          <span className="text-sm font-semibold">
            {cursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </span>
          <button
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm hover:bg-muted"
          >
            ›
          </button>
        </div>
        <button
          onClick={() => setCursor(new Date())}
          className="rounded-md border border-border bg-surface-2 px-3 py-1 text-xs hover:bg-muted"
        >
          Heute
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => (
          <div key={i} className="min-h-[92px] rounded-md border border-border bg-surface-2/50 p-1.5 text-left">
            {d && (
              <>
                <div className="text-[10px] font-semibold text-muted-foreground">{d}</div>
                <div className="mt-1 space-y-0.5">
                  {(byDay.get(String(d)) ?? []).map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onOpen(e.id)}
                      className="line-clamp-1 w-full rounded bg-primary/20 px-1.5 py-0.5 text-left text-[10px] font-medium text-primary hover:bg-primary/30"
                    >
                      {new Date(e.starts_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · {e.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============ STATS ============ */
function StatsView({ vtcId }: { vtcId: string }) {
  const fetchStats = useServerFn(getEventStats);
  const { data } = useQuery({
    queryKey: ["event-stats", vtcId],
    queryFn: () => fetchStats({ data: { vtcId } }),
  });
  if (!data) return <div className="panel p-6 text-sm text-muted-foreground">Lade Statistiken…</div>;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Gesamt Events" value={data.totalEvents} />
        <Kpi label="Gesamt Teilnahmen" value={data.totalParticipants} />
        <Kpi label="Ø Teilnehmer" value={data.avgParticipants} />
        <Kpi label="Teilnahmequote" value={`${data.attendanceRate}%`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Beliebteste Routen</h3>
          <ul className="space-y-2 text-sm">
            {data.topRoutes.length === 0 && <li className="text-muted-foreground">Noch keine Daten.</li>}
            {data.topRoutes.map((r) => (
              <li key={r.label} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
                <span className="truncate">{r.label}</span>
                <span className="font-semibold text-primary">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Beliebteste Uhrzeiten</h3>
          <ul className="space-y-2 text-sm">
            {data.topHours.length === 0 && <li className="text-muted-foreground">Noch keine Daten.</li>}
            {data.topHours.map((r) => (
              <li key={r.hour} className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
                <span>{String(r.hour).padStart(2, "0")}:00 Uhr</span>
                <span className="font-semibold text-primary">{r.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

/* ============ DETAIL MODAL ============ */
function EventDetailModal({
  eventId,
  canManage,
  onClose,
  onChanged,
}: {
  eventId: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const fetchEvent = useServerFn(getVtcEvent);
  const { data, refetch } = useQuery({
    queryKey: ["event-detail", eventId],
    queryFn: () => fetchEvent({ data: { eventId } }),
  });
  const [tab, setTab] = useState<"details" | "participants" | "media" | "feedback" | "reminders">("details");

  const refresh = () => {
    refetch();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur">
      <div className="panel my-8 w-full max-w-4xl overflow-hidden">
        <div className="relative h-40 w-full bg-gradient-to-br from-primary/20 via-surface-2 to-surface">
          {data?.event.banner_url ? (
            <img src={data.event.banner_url} alt="" className="h-full w-full object-cover" />
          ) : null}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"
          >
            <X className="size-4" />
          </button>
        </div>
        {!data ? (
          <div className="p-6 text-sm text-muted-foreground">Lade…</div>
        ) : (
          <div className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <StatusChip status={data.event.status} />
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                    {data.event.game.toUpperCase()}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {data.event.visibility === "public" ? "Öffentlich" : "Nur Mitglieder"}
                  </span>
                </div>
                <h2 className="mt-2 text-2xl font-bold">{data.event.title}</h2>
              </div>
              <Countdown iso={data.event.starts_at} />
            </div>

            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusMenu eventId={eventId} onChanged={refresh} />
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-1 border-b border-border text-xs">
              {(["details", "participants", "media", "feedback", "reminders"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`border-b-2 px-3 py-2 font-medium ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {t === "details"
                    ? "Details"
                    : t === "participants"
                      ? "Teilnehmer"
                      : t === "media"
                        ? "Galerie"
                        : t === "feedback"
                          ? "Feedback"
                          : "Erinnerungen"}
                </button>
              ))}
            </div>

            <div className="pt-5">
              {tab === "details" && <DetailsTab e={data.event} stops={data.stops} />}
              {tab === "participants" && (
                <ParticipantsTab eventId={eventId} canManage={canManage} />
              )}
              {tab === "media" && (
                <MediaTab eventId={eventId} media={data.media} onChanged={refresh} />
              )}
              {tab === "feedback" && (
                <FeedbackTab eventId={eventId} feedback={data.feedback} onChanged={refresh} />
              )}
              {tab === "reminders" && <RemindersTab eventId={eventId} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.planned;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}>{s.label}</span>;
}

function StatusMenu({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const doSet = useServerFn(setEventStatus);
  const mut = useMutation({
    mutationFn: (status: "planned" | "open" | "closed" | "cancelled" | "completed") =>
      doSet({ data: { eventId, status } }),
    onSuccess: () => {
      toast.success("Status aktualisiert");
      onChanged();
    },
  });
  return (
    <select
      onChange={(e) => e.target.value && mut.mutate(e.target.value as any)}
      defaultValue=""
      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
    >
      <option value="" disabled>
        Status ändern…
      </option>
      <option value="planned">Geplant</option>
      <option value="open">Offen</option>
      <option value="closed">Geschlossen</option>
      <option value="cancelled">Abgesagt</option>
      <option value="completed">Abgeschlossen</option>
    </select>
  );
}

function Countdown({ iso }: { iso: string }) {
  const target = new Date(iso).getTime();
  const [now, setNow] = useState(Date.now());
  useMemo(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return (
    <div className="flex gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
      {[
        { l: "Tage", v: days },
        { l: "Std", v: hrs },
        { l: "Min", v: mins },
        { l: "Sek", v: secs },
      ].map((x) => (
        <div key={x.l} className="min-w-[36px]">
          <div className="text-lg font-bold tabular-nums">{String(x.v).padStart(2, "0")}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{x.l}</div>
        </div>
      ))}
    </div>
  );
}

function DetailsTab({ e, stops }: { e: VtcEvent; stops: any[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beschreibung</h3>
        <p className="whitespace-pre-line text-sm">{e.description ?? "—"}</p>
      </div>
      <div className="grid gap-2 text-sm">
        <Info label="Treffpunkt" value={e.meeting_point} icon={MapPin} />
        <Info label="Ziel" value={e.destination} icon={Flag} />
        {e.route && <Info label="Route" value={e.route} />}
        <Info label="Start" value={new Date(e.starts_at).toLocaleString("de-DE")} icon={Clock} />
        {e.ends_at && <Info label="Ende" value={new Date(e.ends_at).toLocaleString("de-DE")} />}
        {e.registration_deadline && (
          <Info label="Anmeldefrist" value={new Date(e.registration_deadline).toLocaleString("de-DE")} />
        )}
        <Info label="Spiel" value={e.game.toUpperCase()} icon={Gamepad2} />
        {e.server && <Info label="Server" value={e.server} icon={Radio} />}
        {e.voice_server && <Info label="Voice" value={e.voice_server} />}
        <Info label="Schwierigkeit" value={e.difficulty} />
        {e.dlc_requirements && e.dlc_requirements.length > 0 && (
          <Info label="DLC" value={e.dlc_requirements.join(", ")} />
        )}
        {e.contact_person && <Info label="Kontakt" value={e.contact_person} />}
        {e.discord_link && (
          <a href={e.discord_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="size-3" /> Discord
          </a>
        )}
        {e.route_link && (
          <a href={e.route_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <ExternalLink className="size-3" /> Route ansehen
          </a>
        )}
      </div>
      {stops.length > 0 && (
        <div className="md:col-span-2">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Zwischenstopps</h3>
          <ol className="space-y-2">
            {stops.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
                <span className="grid size-6 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">{i + 1}</span>
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="text-[10px] uppercase text-muted-foreground">{s.kind}</span>
                {s.arrive_at && (
                  <span className="text-xs text-muted-foreground">{new Date(s.arrive_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
      {Icon && <Icon className="size-3.5 text-muted-foreground" />}
      <span className="min-w-[110px] text-xs text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

function ParticipantsTab({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const fetchParts = useServerFn(listEventParticipants);
  const { data, refetch } = useQuery({
    queryKey: ["event-parts", eventId],
    queryFn: () => fetchParts({ data: { eventId } }),
  });
  const doRole = useServerFn(setParticipantRole);
  if (!data) return <div className="text-xs text-muted-foreground">Lade…</div>;
  if (data.length === 0) return <div className="text-xs text-muted-foreground">Noch keine Teilnehmer.</div>;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Fahrer</th>
            <th className="px-3 py-2 text-left">RSVP</th>
            <th className="px-3 py-2 text-left">Rolle</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.user_id} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="size-6 rounded-full object-cover" />
                  ) : (
                    <div className="grid size-6 place-items-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                      {(p.display_name ?? "?").slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span>{p.display_name}</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-medium">{p.rsvp}</span>
              </td>
              <td className="px-3 py-2">
                {canManage ? (
                  <select
                    defaultValue={p.convoy_role}
                    onChange={(e) =>
                      doRole({ data: { eventId, userId: p.user_id, role: e.target.value as any } }).then(() => {
                        toast.success("Rolle aktualisiert");
                        refetch();
                      })
                    }
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-muted-foreground">{ROLE_LABELS[p.convoy_role] ?? p.convoy_role}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediaTab({ eventId, media, onChanged }: { eventId: string; media: any[]; onChanged: () => void }) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [kind, setKind] = useState<"screenshot" | "replay" | "video" | "other">("screenshot");
  const doAdd = useServerFn(addEventMedia);
  const doDel = useServerFn(deleteEventMedia);
  const addMut = useMutation({
    mutationFn: () => doAdd({ data: { eventId, url, caption: caption || null, kind } }),
    onSuccess: () => {
      toast.success("Hinzugefügt");
      setUrl("");
      setCaption("");
      onChanged();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addMut.mutate();
        }}
        className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
      >
        <input required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Bild-/Video-URL" className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm" />
        <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Beschreibung (optional)" className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm" />
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm">
          <option value="screenshot">Screenshot</option>
          <option value="video">Video</option>
          <option value="replay">Replay</option>
          <option value="other">Sonstiges</option>
        </select>
        <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90">
          Hinzufügen
        </button>
      </form>
      {media.length === 0 ? (
        <div className="grid place-items-center rounded-md border border-dashed border-border bg-surface-2/50 p-8 text-sm text-muted-foreground">
          <ImageIcon className="mb-2 size-6 opacity-40" />
          Noch keine Medien.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-md border border-border bg-surface-2">
              {m.kind === "screenshot" || m.kind === "other" ? (
                <img src={m.url} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <a href={m.url} target="_blank" rel="noreferrer" className="grid aspect-video w-full place-items-center bg-surface-2 text-primary hover:bg-muted">
                  <ExternalLink className="size-6" />
                </a>
              )}
              <div className="flex items-center justify-between p-2 text-xs">
                <span className="line-clamp-1">{m.caption ?? m.kind}</span>
                <button
                  onClick={() =>
                    doDel({ data: { mediaId: m.id } }).then(() => {
                      toast.success("Gelöscht");
                      onChanged();
                    })
                  }
                  className="opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackTab({ eventId, feedback, onChanged }: { eventId: string; feedback: any[]; onChanged: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const doSubmit = useServerFn(submitEventFeedback);
  const avg = feedback.length ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length : 0;
  return (
    <div className="grid gap-4">
      <div className="panel p-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="text-3xl font-bold">{avg.toFixed(1)}</div>
          <div>
            <div className="flex text-amber-400">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`size-4 ${i <= Math.round(avg) ? "fill-current" : "opacity-30"}`} />
              ))}
            </div>
            <div className="text-xs text-muted-foreground">{feedback.length} Bewertungen</div>
          </div>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSubmit({ data: { eventId, rating, comment: comment || null } }).then(() => {
            toast.success("Feedback gespeichert");
            setComment("");
            onChanged();
          });
        }}
        className="panel grid gap-2 p-4"
      >
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              className={`p-1 ${i <= rating ? "text-amber-400" : "text-muted-foreground"}`}
            >
              <Star className={`size-5 ${i <= rating ? "fill-current" : ""}`} />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Dein Kommentar (optional)"
          rows={3}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
        />
        <button type="submit" className="justify-self-start rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90">
          Bewertung abgeben
        </button>
      </form>
      <div className="space-y-2">
        {feedback.map((f) => (
          <div key={f.id} className="rounded-md border border-border bg-surface-2 p-3 text-sm">
            <div className="mb-1 flex items-center gap-1 text-amber-400">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star key={i} className={`size-3.5 ${i <= f.rating ? "fill-current" : "opacity-30"}`} />
              ))}
            </div>
            {f.comment && <p className="text-muted-foreground">{f.comment}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RemindersTab({ eventId }: { eventId: string }) {
  const fetchR = useServerFn(listEventReminders);
  const doSet = useServerFn(setEventReminders);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["event-reminders", eventId],
    queryFn: () => fetchR({ data: { eventId } }),
  });
  const options = [
    { label: "24 Stunden vorher", value: 24 * 60 },
    { label: "1 Stunde vorher", value: 60 },
    { label: "15 Minuten vorher", value: 15 },
    { label: "Beim Start", value: 0 },
  ];
  const active = new Set(data ?? []);
  return (
    <div className="grid gap-2">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Bell className="size-3.5" /> Erhalte eine Dashboard-Benachrichtigung.
      </div>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={active.has(o.value)}
            onChange={(e) => {
              const next = new Set(active);
              if (e.target.checked) next.add(o.value);
              else next.delete(o.value);
              doSet({ data: { eventId, offsets: [...next] } }).then(() => {
                toast.success("Erinnerungen aktualisiert");
                qc.invalidateQueries({ queryKey: ["event-reminders", eventId] });
              });
            }}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/* ============ CREATE FORM ============ */
function CreateForm({ vtcId, onDone }: { vtcId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [regDeadline, setRegDeadline] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [destination, setDestination] = useState("");
  const [route, setRoute] = useState("");
  const [maxParticipants, setMaxParticipants] = useState<string>("");
  const [visibility, setVisibility] = useState<"public" | "members">("public");
  const [game, setGame] = useState<"ets2" | "ats">("ets2");
  const [server, setServer] = useState("");
  const [voiceServer, setVoiceServer] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard" | "expert">("normal");
  const [bannerUrl, setBannerUrl] = useState("");
  const [discordLink, setDiscordLink] = useState("");
  const [routeLink, setRouteLink] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [dlc, setDlc] = useState("");

  const doCreate = useServerFn(createVtcEvent);
  const mut = useMutation({
    mutationFn: () =>
      doCreate({
        data: {
          vtcId,
          title,
          description: description || null,
          startsAt,
          endsAt: endsAt || null,
          registrationDeadline: regDeadline || null,
          meetingPoint,
          destination,
          route: route || null,
          maxParticipants: maxParticipants ? Number(maxParticipants) : null,
          visibility,
          game,
          server: server || null,
          voiceServer: voiceServer || null,
          difficulty,
          bannerUrl: bannerUrl || null,
          discordLink: discordLink || null,
          routeLink: routeLink || null,
          contactPerson: contactPerson || null,
          dlcRequirements: dlc ? dlc.split(",").map((s) => s.trim()).filter(Boolean) : [],
        },
      }),
    onSuccess: () => {
      toast.success("Konvoi erstellt");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="panel mb-6 grid gap-3 p-5 md:grid-cols-2"
    >
      <Field label="Titel" required>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} className="input" />
      </Field>
      <Field label="Banner-URL">
        <input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} className="input" placeholder="https://…" />
      </Field>
      <Field label="Start" required>
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required className="input" />
      </Field>
      <Field label="Ende">
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="input" />
      </Field>
      <Field label="Anmeldefrist">
        <input type="datetime-local" value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} className="input" />
      </Field>
      <Field label="Max. Teilnehmer">
        <input type="number" min={1} value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} className="input" />
      </Field>
      <Field label="Treffpunkt" required>
        <input value={meetingPoint} onChange={(e) => setMeetingPoint(e.target.value)} required className="input" />
      </Field>
      <Field label="Ziel" required>
        <input value={destination} onChange={(e) => setDestination(e.target.value)} required className="input" />
      </Field>
      <Field label="Route">
        <input value={route} onChange={(e) => setRoute(e.target.value)} className="input" placeholder="Hamburg → Bremen → Hannover" />
      </Field>
      <Field label="Spiel">
        <select value={game} onChange={(e) => setGame(e.target.value as any)} className="input">
          <option value="ets2">ETS2</option>
          <option value="ats">ATS</option>
        </select>
      </Field>
      <Field label="Server">
        <input value={server} onChange={(e) => setServer(e.target.value)} className="input" placeholder="Simulation 1" />
      </Field>
      <Field label="Voice-Server">
        <input value={voiceServer} onChange={(e) => setVoiceServer(e.target.value)} className="input" />
      </Field>
      <Field label="Schwierigkeit">
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)} className="input">
          <option value="easy">Einfach</option>
          <option value="normal">Normal</option>
          <option value="hard">Schwer</option>
          <option value="expert">Experte</option>
        </select>
      </Field>
      <Field label="Sichtbarkeit">
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as any)} className="input">
          <option value="public">Öffentlich</option>
          <option value="members">Nur Mitglieder</option>
        </select>
      </Field>
      <Field label="Discord-Link">
        <input value={discordLink} onChange={(e) => setDiscordLink(e.target.value)} className="input" placeholder="https://discord.gg/…" />
      </Field>
      <Field label="Route-Link (Maps)">
        <input value={routeLink} onChange={(e) => setRouteLink(e.target.value)} className="input" placeholder="https://…" />
      </Field>
      <Field label="Kontaktperson">
        <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="input" />
      </Field>
      <Field label="DLC (kommagetrennt)">
        <input value={dlc} onChange={(e) => setDlc(e.target.value)} className="input" placeholder="Going East, Scandinavia" />
      </Field>
      <div className="md:col-span-2">
        <Field label="Beschreibung">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input" />
        </Field>
      </div>
      <div className="md:col-span-2 flex gap-2">
        <button type="submit" disabled={mut.isPending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md hover:opacity-90 disabled:opacity-60">
          {mut.isPending ? "Speichern…" : "Event anlegen"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm hover:bg-muted">
          Abbrechen
        </button>
      </div>
      <style>{`.input { width: 100%; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--surface-2)); padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

// Silence unused imports warnings when tree-shaking optimizes them out
void updateVtcEvent;
