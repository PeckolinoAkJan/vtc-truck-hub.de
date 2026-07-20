import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { getVtcContext } from "@/lib/vtcs.functions";
import { getJob, reviewJob, deleteJob } from "@/lib/jobs.functions";
import { StatusPill } from "@/components/StatusPill";
import { currency, km, dt } from "@/lib/format";
import {
  ChevronRight,
  MapPin,
  Gauge,
  Sparkles,
  ShieldAlert,
  Wallet,
  FileCheck2,
  History,
  ClipboardList,
  Route as RouteIcon,
  ExternalLink,
  Trash2,
  Check,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/vtc/$slug/jobs/$jobId")({
  component: JobDetail,
});

type TabKey =
  | "overview"
  | "route"
  | "telemetry"
  | "resume"
  | "damage"
  | "costs"
  | "billing"
  | "history";

const TABS: { key: TabKey; label: string; icon: typeof MapPin }[] = [
  { key: "overview", label: "Übersicht", icon: ClipboardList },
  { key: "route", label: "Route", icon: RouteIcon },
  { key: "telemetry", label: "Telemetrie", icon: Gauge },
  { key: "resume", label: "Smart Resume", icon: Sparkles },
  { key: "damage", label: "Schäden", icon: ShieldAlert },
  { key: "costs", label: "Kosten", icon: Wallet },
  { key: "billing", label: "Abrechnung", icon: FileCheck2 },
  { key: "history", label: "Historie", icon: History },
];

function JobDetail() {
  const { slug, jobId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getVtcContext);
  const fetchJob = useServerFn(getJob);
  const review = useServerFn(reviewJob);
  const remove = useServerFn(deleteJob);
  const [tab, setTab] = useState<TabKey>("overview");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const { data: job, isLoading } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob({ data: { jobId } }),
  });

  const canReview =
    ctx && ["owner", "admin", "dispatcher"].includes(ctx.role);
  const canDecide = canReview && job?.status === "submitted";
  const canDelete = ctx && ["owner", "admin"].includes(ctx.role);

  const profit = useMemo(() => {
    if (!job) return 0;
    return Number(job.revenue) - Number(job.fuel_cost);
  }, [job]);

  const progress = useMemo(() => {
    if (!job) return 0;
    const t = job.telemetry;
    const done = Number(job.distance_km ?? 0);
    const remaining = Number(t?.job_remaining_km ?? 0);
    const planned = done + remaining;
    if (planned <= 0) return job.status === "approved" || job.status === "submitted" ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round((done / planned) * 100)));
  }, [job]);

  async function decide(decision: "approved" | "rejected") {
    setLoading(true);
    try {
      await review({ data: { jobId, decision, note: note || undefined } });
      toast.success(decision === "approved" ? "Auftrag genehmigt" : "Auftrag abgelehnt");
      await qc.invalidateQueries({ queryKey: ["job", jobId] });
      await qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm("Diesen Auftrag unwiderruflich löschen?")) return;
    setLoading(true);
    try {
      await remove({ data: { jobId } });
      toast.success("Auftrag gelöscht");
      navigate({ to: `/vtc/${slug}/jobs` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!job) {
    return <div className="text-sm text-muted-foreground">Auftrag nicht gefunden.</div>;
  }

  const t = job.telemetry;
  const shortId = job.id.slice(0, 8).toUpperCase();
  const plannedKm = Number(job.distance_km ?? 0) + Number(t?.job_remaining_km ?? 0);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/vtc/$slug/jobs" params={{ slug }} className="hover:text-foreground">
          Aufträge
        </Link>
        <ChevronRight className="size-3.5" />
        <Link to="/vtc/$slug/jobs" params={{ slug }} className="hover:text-foreground">
          Auftragsübersicht
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">Auftrag #{shortId}</span>
      </nav>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold">Auftrag #{shortId}</h1>
            <StatusPill status={job.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Standard-Auftrag · {job.game.toUpperCase()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDecide && (
            <>
              <button
                disabled={loading}
                onClick={() => decide("approved")}
                className="inline-flex items-center gap-2 rounded-md bg-success px-3 py-2 text-sm font-medium text-success-foreground hover:opacity-90 disabled:opacity-60"
              >
                <Check className="size-4" /> Genehmigen
              </button>
              <button
                disabled={loading}
                onClick={() => decide("rejected")}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
              >
                <X className="size-4" /> Ablehnen
              </button>
            </>
          )}
          {canDelete && (
            <button
              disabled={loading}
              onClick={onDelete}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
            >
              <Trash2 className="size-4" /> Löschen
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex flex-wrap gap-1 overflow-x-auto">
          {TABS.map((it) => {
            const Icon = it.icon;
            const active = tab === it.key;
            return (
              <button
                key={it.key}
                onClick={() => setTab(it.key)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" /> {it.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout: main + sidebar */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {tab === "overview" && (
            <OverviewTab job={job} plannedKm={plannedKm} />
          )}
          {tab === "route" && <RouteTab job={job} plannedKm={plannedKm} />}
          {tab === "telemetry" && <TelemetryTab telemetry={t} />}
          {tab === "resume" && <ResumeTab job={job} />}
          {tab === "damage" && <DamageTab job={job} telemetry={t} />}
          {tab === "costs" && <CostsTab job={job} profit={profit} />}
          {tab === "billing" && <BillingTab job={job} />}
          {tab === "history" && <HistoryTab events={job.events} />}

          {canDecide && (
            <section className="panel p-5">
              <label className="mb-2 block text-sm font-medium">Prüf-Notiz (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Anmerkung zur Genehmigung oder Ablehnung …"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
              />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          <SidebarStatus job={job} progress={progress} plannedKm={plannedKm} />
          <SidebarFinance job={job} profit={profit} />
          <SidebarApproval job={job} />
        </aside>
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */

function OverviewTab({
  job,
  plannedKm,
}: {
  job: JobData;
  plannedKm: number;
}) {
  const t = job.telemetry;
  return (
    <>
      <section className="panel p-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Auftrags-Nr." value={`#${job.id.slice(0, 8).toUpperCase()}`} mono />
          <Field label="Auftragstyp" value="Standard-Auftrag" />
          <Field label="Fracht" value={job.cargo} strong />
          <Field
            label="Frachtgewicht"
            value={
              t?.cargo_mass_kg
                ? `${new Intl.NumberFormat("de-DE").format(Number(t.cargo_mass_kg))} kg`
                : "—"
            }
          />
          <Field label="Von" value={job.source_city} strong />
          <Field label="Nach" value={job.dest_city} strong />
          <Field label="Entfernung (geplant)" value={plannedKm ? km(plannedKm) : "—"} />
          <Field label="Entfernung (gefahren)" value={km(job.distance_km)} />
          <Field label="Startzeit" value={dt(job.started_at ?? job.submitted_at)} />
          <Field label="Beendet" value={dt(job.finished_at)} />
          <Field
            label="Fahrer"
            value={job.driver.display_name}
            strong
          />
          <Field
            label="Fahrzeug"
            value={t?.truck_brand || t?.truck_model ? `${t?.truck_brand ?? ""} ${t?.truck_model ?? ""}`.trim() : (job.truck ?? "—")}
          />
          <Field label="Kennzeichen" value={t?.truck_plate ?? "—"} mono />
          <Field label="Spiel" value={job.game === "ets2" ? "Euro Truck Simulator 2" : job.game === "ats" ? "American Truck Simulator" : job.game} />
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Fahrdaten
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Aktuelle Geschw." value={t?.speed_kmh != null ? `${Math.round(Number(t.speed_kmh))} km/h` : "—"} />
          <Field label="Ø Verbrauch" value={t?.fuel_consumption_avg != null ? `${Number(t.fuel_consumption_avg).toFixed(1)} l/100 km` : "—"} />
          <Field label="Tankfüllung" value={t?.fuel_level != null ? `${Math.round(Number(t.fuel_level))} %` : "—"} />
          <Field label="Fahrzeit heute" value={t?.driving_time_today_min != null ? `${Math.floor(Number(t.driving_time_today_min) / 60)} h ${Math.round(Number(t.driving_time_today_min) % 60)} min` : "—"} />
          <Field label="Ruhezeit verbleibend" value={t?.rest_time_remaining_min != null ? `${Math.round(Number(t.rest_time_remaining_min))} min` : "—"} />
          <Field label="Schäden" value={`${Number(job.damage_pct).toFixed(1)} %`} />
        </div>
      </section>

      {job.review_note && (
        <section className="panel border-l-2 border-primary p-5">
          <div className="text-xs uppercase text-muted-foreground">
            Prüfer-Notiz{job.reviewer ? ` · ${job.reviewer.display_name}` : ""}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{job.review_note}</p>
        </section>
      )}
    </>
  );
}

function RouteTab({ job, plannedKm }: { job: JobData; plannedKm: number }) {
  const remaining = Math.max(0, plannedKm - Number(job.distance_km ?? 0));
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Strecke &amp; Route
      </h2>
      <div className="mb-4 flex items-center justify-between rounded-md border border-border bg-surface-2 p-4">
        <div className="flex items-center gap-3">
          <div className="size-2 rounded-full bg-primary" />
          <div>
            <div className="text-sm font-medium">{job.source_city}</div>
            <div className="text-xs text-muted-foreground">Start</div>
          </div>
        </div>
        <div className="flex-1 border-t border-dashed border-border mx-4" />
        <div className="flex items-center gap-3">
          <div>
            <div className="text-sm font-medium text-right">{job.dest_city}</div>
            <div className="text-xs text-muted-foreground text-right">Ziel</div>
          </div>
          <MapPin className="size-4 text-destructive" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Geplant" value={plannedKm ? km(plannedKm) : "—"} />
        <Field label="Gefahren" value={km(job.distance_km)} />
        <Field label="Verbleibend" value={remaining ? km(remaining) : "—"} />
      </div>
      <div className="mt-6 rounded-md border border-dashed border-border bg-surface-2 p-8 text-center text-sm text-muted-foreground">
        <RouteIcon className="mx-auto mb-2 size-6 opacity-50" />
        Kartendarstellung wird in einer kommenden Version integriert.
      </div>
    </section>
  );
}

function TelemetryTab({ telemetry }: { telemetry: TelemetryData }) {
  if (!telemetry) return <EmptyState label="Noch keine Telemetriedaten verfügbar." />;
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Live-Telemetrie
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Status" value={telemetry.status ?? "—"} />
        <Field label="Geschwindigkeit" value={telemetry.speed_kmh != null ? `${Math.round(Number(telemetry.speed_kmh))} km/h` : "—"} />
        <Field label="Kurs" value={telemetry.heading != null ? `${Math.round(Number(telemetry.heading))}°` : "—"} />
        <Field label="Kraftstoff" value={telemetry.fuel != null ? `${Math.round(Number(telemetry.fuel))} l` : "—"} />
        <Field label="Tank-Kapazität" value={telemetry.fuel_capacity != null ? `${Math.round(Number(telemetry.fuel_capacity))} l` : "—"} />
        <Field label="Verbrauch Ø" value={telemetry.fuel_consumption_avg != null ? `${Number(telemetry.fuel_consumption_avg).toFixed(1)} l/100km` : "—"} />
        <Field label="LKW" value={`${telemetry.truck_brand ?? ""} ${telemetry.truck_model ?? ""}`.trim() || "—"} />
        <Field label="Kennzeichen" value={telemetry.truck_plate ?? "—"} mono />
        <Field label="Aktualisiert" value={dt(telemetry.updated_at)} />
      </div>
    </section>
  );
}

function ResumeTab({ job }: { job: JobData }) {
  const active = job.status === "in_progress";
  return (
    <section className="panel p-6">
      <div className="flex items-start gap-3">
        <div className={`grid size-10 place-items-center rounded-md ${active ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"}`}>
          <Sparkles className="size-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold">Smart Resume</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {active
              ? "Diese Tour wird sitzungsübergreifend fortgesetzt. Der Client erkennt den offenen Auftrag automatisch beim nächsten Spielstart."
              : "Smart Resume ist nur für aktive Aufträge relevant."}
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Field label="Status" value={active ? "Aktiv" : "Inaktiv"} />
        <Field label="Letzte Aktualisierung" value={dt(job.updated_at)} />
        <Field label="Odometer Start" value={job.odometer_start_km != null ? km(job.odometer_start_km) : "—"} />
        <Field label="Odometer Ende" value={job.odometer_end_km != null ? km(job.odometer_end_km) : "—"} />
      </div>
    </section>
  );
}

function DamageTab({ job, telemetry }: { job: JobData; telemetry: TelemetryData }) {
  const parts = [
    ["Gesamt", telemetry?.damage_pct ?? job.damage_pct],
    ["Motor", telemetry?.damage_engine],
    ["Getriebe", telemetry?.damage_transmission],
    ["Kabine", telemetry?.damage_cabin],
    ["Chassis", telemetry?.damage_chassis],
    ["Räder", telemetry?.damage_wheels],
  ] as const;
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Schadensübersicht
      </h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {parts.map(([label, val]) => (
          <DamageBar key={label} label={label} value={val != null ? Number(val) : null} />
        ))}
      </div>
    </section>
  );
}

function DamageBar({ label, value }: { label: string; value: number | null }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = pct > 30 ? "bg-destructive" : pct > 10 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="num font-medium">{value == null ? "—" : `${pct.toFixed(1)} %`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CostsTab({ job, profit }: { job: JobData; profit: number }) {
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Kostenaufstellung
      </h2>
      <div className="divide-y divide-border rounded-md border border-border">
        <Row label="Grundvergütung" value={currency(job.revenue)} positive />
        <Row label="Kraftstoff" value={`− ${currency(job.fuel_cost)}`} />
        <Row label="Schäden" value={`${Number(job.damage_pct).toFixed(1)} %`} />
        <Row label="Netto-Gewinn" value={currency(profit)} strong />
      </div>
    </section>
  );
}

function BillingTab({ job }: { job: JobData }) {
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Abrechnung
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Status" value={job.paid_at ? "Bezahlt" : "Ausstehend"} />
        <Field label="Ausgezahlt am" value={dt(job.paid_at)} />
        <Field label="Auszahlungsbetrag" value={job.payout_amount != null ? currency(job.payout_amount) : "—"} />
        <Field label="Umsatz" value={currency(job.revenue)} />
      </div>
    </section>
  );
}

function HistoryTab({ events }: { events: JobEvent[] }) {
  if (!events.length) return <EmptyState label="Noch keine Ereignisse aufgezeichnet." />;
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Verlauf
      </h2>
      <ol className="space-y-3">
        {events.map((ev) => (
          <li key={ev.id} className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
            <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{formatEventType(ev.event_type)}</span>
                <span className="text-xs text-muted-foreground">{dt(ev.received_at)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{ev.event_type}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatEventType(t: string) {
  const map: Record<string, string> = {
    job_started: "Auftrag gestartet",
    job_delivered: "Fracht abgeliefert",
    job_cancelled: "Auftrag abgebrochen",
    job_finished: "Auftrag abgeschlossen",
    telemetry_ping: "Positions-Update",
    pause_started: "Pause gestartet",
    pause_ended: "Pause beendet",
  };
  return map[t] ?? t;
}

/* ---------- Sidebar ---------- */

function SidebarStatus({
  job,
  progress,
  plannedKm,
}: {
  job: JobData;
  progress: number;
  plannedKm: number;
}) {
  const remaining = Math.max(0, plannedKm - Number(job.distance_km ?? 0));
  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-sm font-semibold">Status &amp; Fortschritt</h3>
      <div className="space-y-3 text-sm">
        <SideRow label="Auftragsstatus" value={<StatusPill status={job.status} />} />
        <SideRow
          label="Smart Resume"
          value={<Chip tone={job.status === "in_progress" ? "success" : "muted"}>{job.status === "in_progress" ? "Aktiv" : "Inaktiv"}</Chip>}
        />
        <SideRow label="Letzte Aktualisierung" value={<span className="num text-xs">{dt(job.updated_at)}</span>} />
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Fortschritt</span>
          <span className="num font-medium">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm">
        <SideRow
          label="Gefahrene Strecke"
          value={
            <span className="num">
              {km(job.distance_km)}
              {plannedKm ? <span className="text-muted-foreground"> / {km(plannedKm)}</span> : null}
            </span>
          }
        />
        <SideRow label="Verbleibende Strecke" value={<span className="num">{remaining ? km(remaining) : "—"}</span>} />
      </div>
    </div>
  );
}

function SidebarFinance({ job, profit }: { job: JobData; profit: number }) {
  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-sm font-semibold">Finanzübersicht</h3>
      <div className="space-y-2 text-sm">
        <SideRow label="Grundvergütung" value={<span className="num">{currency(job.revenue)}</span>} />
        <SideRow label="Kraftstoff" value={<span className="num text-destructive">−{currency(job.fuel_cost)}</span>} />
        <SideRow label="Schäden" value={<span className="num">{Number(job.damage_pct).toFixed(1)} %</span>} />
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <SideRow label={<span className="font-semibold">Netto-Gewinn</span>} value={<span className="num font-semibold text-primary">{currency(profit)}</span>} />
      </div>
    </div>
  );
}

function SidebarApproval({ job }: { job: JobData }) {
  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-sm font-semibold">Genehmigungsstatus</h3>
      <div className="space-y-2 text-sm">
        <SideRow label="Status" value={<StatusPill status={job.status} />} />
        <SideRow label="Prüfer" value={<span>{job.reviewer?.display_name ?? "—"}</span>} />
        <SideRow label="Geprüft am" value={<span className="num text-xs">{dt(job.reviewed_at)}</span>} />
        <SideRow label="Beendet am" value={<span className="num text-xs">{dt(job.finished_at)}</span>} />
      </div>
      {job.review_note && (
        <div className="mt-4 rounded-md border border-border bg-surface-2 p-3 text-xs">
          <div className="mb-1 text-muted-foreground">Bemerkung</div>
          <p className="whitespace-pre-wrap">{job.review_note}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- Primitives ---------- */

function Field({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-sm ${strong ? "font-semibold" : "font-medium"} ${mono ? "num" : ""}`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={`num ${strong ? "font-semibold text-primary" : positive ? "" : ""}`}>{value}</span>
    </div>
  );
}

function SideRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone: "success" | "muted" }) {
  const cls =
    tone === "success"
      ? "border-success/40 bg-success/10 text-success"
      : "border-border bg-surface-2 text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${cls}`}>
      {children}
    </span>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <section className="panel p-10 text-center text-sm text-muted-foreground">
      <ClipboardList className="mx-auto mb-2 size-6 opacity-50" />
      {label}
    </section>
  );
}

/* ---------- Types ---------- */

type JobData = Awaited<ReturnType<typeof getJob>>;
type TelemetryData = JobData["telemetry"];
type JobEvent = JobData["events"][number];
