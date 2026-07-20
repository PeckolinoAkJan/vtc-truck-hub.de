import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Gauge,
  Fuel,
  Thermometer,
  ChevronLeft,
  Maximize2,
  Plug,
  Truck,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Siren,
  PlayCircle,
  ClipboardList,
  Radio,
  Zap,
  Wind,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getVtcContext } from "@/lib/vtcs.functions";
import { listLiveTelemetry, getTelemetryDetail } from "@/lib/telemetry.functions";
import { km, dt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusPill, type PillStatus } from "@/components/StatusPill";

export const Route = createFileRoute("/_authenticated/vtc/$slug/telemetry")({
  component: TelemetryPage,
  head: () => ({
    meta: [
      { title: "Telemetry Live — VTC Hub" },
      { name: "description", content: "Echtzeit-Telemetrie: Fahrzeugdaten, Karte, Diagramme und Ereignisse." },
    ],
  }),
});

type SamplePoint = { t: number; speed: number; rpm: number; fuel: number; temp: number; consumption: number };
const MAX_SAMPLES = 60;

function TelemetryPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getVtcContext);
  const fetchLive = useServerFn(listLiveTelemetry);
  const fetchDetail = useServerFn(getTelemetryDetail);

  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;

  const { data: liveRows } = useQuery({
    queryKey: ["live-telemetry", vtcId],
    queryFn: () => fetchLive({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
    refetchInterval: 5000,
    refetchOnWindowFocus: false,
  });

  const drivers = liveRows ?? [];
  const [selectedDriver, setSelectedDriver] = useState<string | undefined>();

  // Auto-select first driver
  useEffect(() => {
    if (!selectedDriver && drivers.length > 0) {
      setSelectedDriver(drivers[0].driver_id);
    }
  }, [drivers, selectedDriver]);

  const { data: detail } = useQuery({
    queryKey: ["telemetry-detail", vtcId, selectedDriver],
    queryFn: () => fetchDetail({ data: { vtcId: vtcId!, driverId: selectedDriver } }),
    enabled: !!vtcId,
    refetchInterval: 4000,
    refetchOnWindowFocus: false,
  });

  // Realtime channel to hint refresh
  useEffect(() => {
    if (!vtcId) return;
    const channel = supabase
      .channel(`telemetry-page-${vtcId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemetry_data", filter: `vtc_id=eq.${vtcId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["live-telemetry", vtcId] });
          qc.invalidateQueries({ queryKey: ["telemetry-detail", vtcId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "telemetry_events", filter: `vtc_id=eq.${vtcId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["telemetry-detail", vtcId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vtcId, qc]);

  // Rolling sample buffer for charts
  const samplesRef = useRef<Map<string, SamplePoint[]>>(new Map());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!detail?.telemetry || !selectedDriver) return;
    const t = detail.telemetry;
    if (import.meta.env.DEV) {
      // Diagnose: rohe Telemetrie + abgeleitete Route-Werte (Client sendet job_remaining_km oft nicht)
      console.debug("[telemetry-detail]", {
        driver: selectedDriver,
        updated_at: t.updated_at,
        source_city: t.source_city,
        dest_city: t.dest_city,
        job_distance_km: t.job_distance_km,
        job_remaining_km: t.job_remaining_km,
        position: { x: t.position_x, z: t.position_z, heading: t.heading },
        route: detail.route,
        hasActiveJob: detail.hasActiveJob,
      });
    }
    const key = selectedDriver;
    const cap = Number(t.fuel_capacity ?? 0);
    const point: SamplePoint = {
      t: new Date(t.updated_at).getTime(),
      speed: Number(t.speed_kmh ?? 0),
      rpm: Number(((t.raw as Record<string, unknown> | null)?.rpm as number) ?? 0),
      fuel: cap > 0 ? Math.round((Number(t.fuel ?? t.fuel_level ?? 0) / cap) * 100) : Number(t.fuel_level ?? 0),
      temp: Number(((t.raw as Record<string, unknown> | null)?.engine_temp as number) ?? 89),
      consumption: Number(t.fuel_consumption_avg ?? 0),
    };
    const arr = samplesRef.current.get(key) ?? [];
    if (arr[arr.length - 1]?.t !== point.t) {
      const next = [...arr, point].slice(-MAX_SAMPLES);
      samplesRef.current.set(key, next);
      setTick((n) => n + 1);
    }
  }, [detail, selectedDriver]);


  const samples = (selectedDriver && samplesRef.current.get(selectedDriver)) || [];
  // reference tick to satisfy React
  void tick;

  const t = detail?.telemetry;
  const now = Date.now();
  const ageSec = t ? Math.round((now - new Date(t.updated_at).getTime()) / 1000) : Infinity;
  const connected = ageSec < 60 && t?.status !== "offline";
  const speed = Number(t?.speed_kmh ?? 0);
  const rpm = Number(((t?.raw as Record<string, unknown> | null)?.rpm as number) ?? 0);
  const fuelCap = Number(t?.fuel_capacity ?? 0);
  const fuelL = Number(t?.fuel ?? t?.fuel_level ?? 0);
  const fuelPct = fuelCap > 0 ? Math.round((fuelL / fuelCap) * 100) : null;
  const consumption = Number(t?.fuel_consumption_avg ?? 0);
  const engineLoad = Number(((t?.raw as Record<string, unknown> | null)?.engine_load as number) ?? 0);
  const coolant = Number(((t?.raw as Record<string, unknown> | null)?.engine_temp as number) ?? 0);
  const damage =
    Math.max(
      Number(t?.damage_engine ?? 0),
      Number(t?.damage_cabin ?? 0),
      Number(t?.damage_chassis ?? 0),
      Number(t?.damage_wheels ?? 0),
      Number(t?.damage_transmission ?? 0),
      Number(t?.damage_pct ?? 0),
    ) || 0;

  const avgSpeed = samples.length ? Math.round(samples.reduce((s, p) => s + p.speed, 0) / samples.length) : 0;
  const avgRpm = samples.length ? Math.round(samples.reduce((s, p) => s + p.rpm, 0) / samples.length) : 0;
  const avgLoad = samples.length
    ? Math.round(samples.reduce((s, p) => s + p.speed, 0) / samples.length && engineLoad)
    : engineLoad;

  const warnings = useMemo(() => {
    const list: { level: "warn" | "danger"; label: string }[] = [];
    if (!connected) list.push({ level: "danger", label: "Verbindung verloren" });
    if (fuelPct !== null && fuelPct < 15) list.push({ level: "warn", label: `Wenig Kraftstoff (${fuelPct}%)` });
    if (damage > 40) list.push({ level: "warn", label: `Fahrzeugschaden ${Math.round(damage)}%` });
    if (coolant > 105) list.push({ level: "warn", label: `Motortemperatur ${Math.round(coolant)}°C` });
    return list;
  }, [connected, fuelPct, damage, coolant]);

  return (
    <div>
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/vtc/$slug/live" params={{ slug }} className="hover:text-foreground">
              Live-Karte
            </Link>
            <span>/</span>
            <span className="text-foreground">Telemetry</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Telemetry Live</h1>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                connected
                  ? "border-primary/30 bg-primary/15 text-primary"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", connected ? "bg-primary animate-pulse" : "bg-muted-foreground")} />
              {connected ? "Live" : "Offline"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Echtzeit-Datenstrom von Fahrzeug und Fahrer</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail?.activeJob && (
            <Link
              to="/vtc/$slug/jobs/$jobId"
              params={{ slug, jobId: detail.activeJob.id }}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
            >
              <ChevronLeft className="size-4" />
              Zur Auftragsdetailseite
            </Link>
          )}
          <button
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Maximize2 className="size-4" />
            Vollbild
          </button>
          <div className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <Plug className="size-4" />
            {connected ? "Datenstrom verbunden" : "Warte auf Datenstrom"}
          </div>
        </div>
      </div>

      {/* Driver selector */}
      {detail?.canSeeAll && drivers.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {drivers.map((d) => {
            const isActive = d.driver_id === selectedDriver;
            const online = now - new Date(d.updated_at).getTime() < 60_000 && d.status !== "offline";
            return (
              <button
                key={d.driver_id}
                onClick={() => setSelectedDriver(d.driver_id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                  isActive
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-surface text-muted-foreground hover:bg-surface-2",
                )}
              >
                <span className={cn("size-1.5 rounded-full", online ? "bg-primary" : "bg-muted-foreground")} />
                {d.driver_name}
              </button>
            );
          })}
        </div>
      )}

      {!t ? (
        <div className="panel p-10 text-center">
          <Activity className="mx-auto mb-3 size-8 text-muted-foreground" />
          <div className="text-sm font-medium">Keine Live-Daten verfügbar</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Starte den VTC Hub Desktop-Client und aktiviere Auto-Polling in ETS2 / ATS.
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Main column */}
          <div className="space-y-4">
            {/* KPI cards */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <KpiCard icon={Gauge} label="Geschwindigkeit" value={`${Math.round(speed)} km/h`} sub={`Ø ${avgSpeed} km/h`} data={samples} dataKey="speed" color="hsl(var(--primary))" />
              <KpiCard icon={Zap} label="Motor-Drehzahl" value={`${Math.round(rpm).toLocaleString("de-DE")} rpm`} sub={`Ø ${avgRpm.toLocaleString("de-DE")} rpm`} data={samples} dataKey="rpm" color="hsl(var(--primary))" />
              <KpiCard icon={Fuel} label="Kraftstoffstand" value={`${Math.round(fuelL)} L${fuelPct !== null ? ` (${fuelPct}%)` : ""}`} sub={consumption > 0 ? `Verbrauch: ${consumption.toFixed(1)} l/100 km` : "—"} data={samples} dataKey="fuel" color="hsl(var(--primary))" />
              <KpiCard icon={Wind} label="Motorlast" value={`${Math.round(engineLoad)} %`} sub={`Ø ${Math.round(avgLoad)} %`} data={samples} dataKey="speed" color="hsl(var(--primary))" />
              <KpiCard icon={Thermometer} label="Kühlmittel" value={`${Math.round(coolant)} °C`} sub={coolant > 0 && coolant < 105 ? "Optimal" : coolant >= 105 ? "Kritisch" : "—"} data={samples} dataKey="temp" color="hsl(var(--primary))" />
              <KpiCard icon={Activity} label="Kraftstoffverbrauch" value={`${consumption.toFixed(1)} l/100 km`} sub={consumption > 0 ? `Ø ${consumption.toFixed(1)} l/100 km` : "—"} data={samples} dataKey="consumption" color="hsl(var(--primary))" />
            </div>

            {/* Route panel */}
            <div className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="text-sm font-semibold">Live-Position</div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  Aktualisierung: Live
                </span>
              </div>
              <RouteView
                source={detail?.route?.source ?? "—"}
                dest={detail?.route?.destination ?? "—"}
                remainingKm={Number(detail?.route?.remainingKm ?? 0)}
                totalKm={Number(detail?.route?.totalKm ?? 0)}
                heading={Number(t.heading ?? 0)}
                position={detail?.route?.position ?? null}
                hasActiveJob={!!detail?.hasActiveJob}
              />

            </div>

            {/* Live charts */}
            <div className="grid gap-3 md:grid-cols-3">
              <LiveChart title="Geschwindigkeit (km/h)" data={samples} dataKey="speed" color="hsl(var(--primary))" latest={`${Math.round(speed)} km/h`} />
              <LiveChart title="Motor-Drehzahl (rpm)" data={samples} dataKey="rpm" color="#eab308" latest={`${Math.round(rpm)} rpm`} />
              <LiveChart title="Kraftstoffstand (L)" data={samples} dataKey="fuel" color="#3b82f6" latest={`${Math.round(fuelL)} L`} />
            </div>

            {/* Events + Warnings */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">Letzte Ereignisse</div>
                  <button className="text-xs text-muted-foreground hover:text-foreground">Alle anzeigen</button>
                </div>
                {detail && detail.events.length > 0 ? (
                  <ul className="space-y-2 text-xs">
                    {detail.events.slice(0, 8).map((e) => (
                      <li key={e.id} className="flex items-start gap-2">
                        <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                        <div className="flex-1">
                          <div className="text-muted-foreground">{formatEventTime(e.received_at)}</div>
                          <div>{formatEvent(e.event_type, e.payload as Record<string, unknown> | null)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-6 text-center text-xs text-muted-foreground">Keine Ereignisse</div>
                )}
              </div>

              <div className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">Warnungen ({warnings.length} aktiv)</div>
                </div>
                {warnings.length === 0 ? (
                  <div className="grid place-items-center py-8 text-center">
                    <CheckCircle2 className="mb-2 size-8 text-primary" />
                    <div className="text-sm font-medium">Keine aktiven Warnungen</div>
                    <div className="text-xs text-muted-foreground">Alle Systeme im grünen Bereich</div>
                  </div>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {warnings.map((w, i) => (
                      <li
                        key={i}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2",
                          w.level === "danger"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-warning/30 bg-warning/10 text-warning",
                        )}
                      >
                        <AlertTriangle className="size-4" />
                        {w.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            {/* Current job */}
            <div className="panel p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">Aktueller Auftrag</div>
                {detail?.activeJob && (
                  <StatusPill status={(detail.activeJob.status as PillStatus) ?? "in_progress"} />
                )}
              </div>
              {detail?.activeJob ? (
                <div className="space-y-3 text-sm">
                  <div className="text-lg font-bold">#{detail.activeJob.id.slice(0, 8)}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 text-primary" />
                    <span>{detail.activeJob.source_city}</span>
                    <span>→</span>
                    <span>{detail.activeJob.dest_city}</span>
                  </div>
                  <Row label="Entfernung gesamt" value={km(Number(detail.route?.totalKm ?? 0))} />
                  <Row label="Zurückgelegt" value={km(Number(detail.route?.drivenKm ?? 0))} />
                  <Row label="Verbleibend" value={km(Number(detail.route?.remainingKm ?? 0))} />
                  <Row
                    label="Vorauss. Ankunft"
                    value={estimateEta(Number(detail.route?.remainingKm ?? 0), speed)}
                  />

                </div>
              ) : (
                <div className="py-4 text-center text-xs text-muted-foreground">Kein aktiver Auftrag</div>
              )}
            </div>

            {/* Vehicle & driver */}
            <div className="panel p-4">
              <div className="mb-3 text-sm font-semibold">Fahrzeug &amp; Fahrer</div>
              <div className="mb-4 flex items-center gap-3 rounded-lg bg-surface-2 p-3">
                <div className="grid size-12 place-items-center rounded-lg bg-primary/15 text-primary">
                  <Truck className="size-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {detail?.vehicle?.brand ?? ""} {detail?.vehicle?.model ?? t.truck_model ?? "Unbekannt"}
                  </div>
                  {detail?.vehicle?.plate && (
                    <span className="mt-0.5 inline-block rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                      {detail.vehicle.plate}
                    </span>
                  )}
                </div>
                <div className="text-right text-xs">
                  <div className="text-muted-foreground">Anhänger</div>
                  <div className="font-medium">{t.cargo ? t.cargo : "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {detail?.driverAvatar ? (
                  <img src={detail.driverAvatar} alt="" className="size-10 rounded-full object-cover" />
                ) : (
                  <div className="grid size-10 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                    {(detail?.driverName ?? "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{detail?.driverName}</div>
                  <div className="text-xs text-muted-foreground">@{(detail?.driverName ?? "").replace(/\s+/g, "")}</div>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    connected ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", connected ? "bg-primary" : "bg-muted-foreground")} />
                  {connected ? "Online" : "Offline"}
                </span>
              </div>
            </div>

            {/* Client status */}
            <div className="panel p-4">
              <div className="mb-3 text-sm font-semibold">Verbindung &amp; Client</div>
              <div className="space-y-2 text-xs">
                <Row
                  label="Client-Status"
                  value={
                    <span className={cn("font-medium", connected ? "text-primary" : "text-muted-foreground")}>
                      • {connected ? "Verbunden" : "Getrennt"}
                    </span>
                  }
                />
                <Row label="Letzte Aktualisierung" value={dt(t.updated_at)} />
                <Row label="Alter" value={`${Math.max(0, ageSec)} s`} />
                <Row label="Spiel" value={(t.game ?? "—").toUpperCase()} />
                <Row label="Client-Version" value="via Desktop-Client" />
              </div>
            </div>

            {/* Quick actions */}
            <div className="panel p-4">
              <div className="mb-3 text-sm font-semibold">Schnellaktionen</div>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  to="/vtc/$slug/live"
                  params={{ slug }}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-surface"
                >
                  <Radio className="size-3.5" />
                  Zur Live-Karte
                </Link>
                {detail?.activeJob ? (
                  <Link
                    to="/vtc/$slug/jobs/$jobId"
                    params={{ slug, jobId: detail.activeJob.id }}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-surface"
                  >
                    <ClipboardList className="size-3.5" />
                    Auftrag öffnen
                  </Link>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-medium opacity-50"
                  >
                    <ClipboardList className="size-3.5" />
                    Auftrag öffnen
                  </button>
                )}
                <button
                  disabled={!detail?.activeJob}
                  onClick={() => toast.info("Smart Resume wird automatisch vom Desktop-Client verwaltet.")}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-50"
                >
                  <PlayCircle className="size-3.5" />
                  Smart Resume
                </button>
                <Link
                  to="/vtc/$slug/messages"
                  params={{ slug }}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs font-medium hover:bg-surface"
                >
                  <MessageSquare className="size-3.5" />
                  Nachricht senden
                </Link>
                <button
                  onClick={() => toast.warning("Notfallcode gesendet")}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20"
                >
                  <Siren className="size-3.5" />
                  Notfallcode senden
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  data,
  dataKey,
  color,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  sub: string;
  data: SamplePoint[];
  dataKey: keyof SamplePoint;
  color: string;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className="size-4 text-primary" />
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>
      <div className="mt-2 h-8">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <Line type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LiveChart({
  title,
  data,
  dataKey,
  color,
  latest,
}: {
  title: string;
  data: SamplePoint[];
  dataKey: keyof SamplePoint;
  color: string;
  latest: string;
}) {
  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{latest}</div>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="t"
              tickFormatter={(v: number) => new Date(v).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border))"
            />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} stroke="hsl(var(--border))" width={30} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
              labelFormatter={(v: number) => new Date(v).toLocaleTimeString("de-DE")}
            />
            <Line type="monotone" dataKey={dataKey as string} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function RouteView({
  source,
  dest,
  remainingKm,
  totalKm,
  heading,
  position,
  hasActiveJob,
}: {
  source: string;
  dest: string;
  remainingKm: number;
  totalKm: number;
  heading: number;
  position: { x: number; y: number; z: number; heading: number } | null;
  hasActiveJob: boolean;
}) {
  const progress = totalKm > 0 ? Math.max(0, Math.min(1, 1 - remainingKm / totalKm)) : 0;
  return (
    <div className="relative h-72 bg-gradient-to-br from-surface-2 via-surface to-surface-2 p-6">
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage:
          "radial-gradient(circle at 20% 30%, hsl(var(--primary)) 0, transparent 40%), radial-gradient(circle at 80% 70%, hsl(var(--primary)) 0, transparent 40%)",
      }} />
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="rounded-lg bg-background/80 px-3 py-2 backdrop-blur">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Start</div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPin className="size-3.5 text-primary" />
              {hasActiveJob ? source : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-background/80 px-3 py-2 text-center backdrop-blur">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Live-Position</div>
            <div className="font-mono text-xs font-semibold">
              {position ? `X ${Math.round(position.x)} · Z ${Math.round(position.z)}` : "—"}
            </div>
          </div>
          <div className="rounded-lg bg-background/80 px-3 py-2 text-right backdrop-blur">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ziel</div>
            <div className="flex items-center justify-end gap-1.5 text-sm font-semibold">
              {hasActiveJob ? dest : "—"}
              <MapPin className="size-3.5 text-destructive" />
            </div>
          </div>
        </div>

        {/* Route line */}
        <div className="relative mx-4 h-2 rounded-full bg-surface-2">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 -mt-3 -ml-3 grid size-6 place-items-center rounded-full border-2 border-primary bg-background shadow-lg"
            style={{ left: `${progress * 100}%`, transform: `rotate(${heading}deg)` }}
          >
            <Truck className="size-3 text-primary" />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Zurückgelegt: {hasActiveJob && totalKm > 0 ? km(Math.max(0, totalKm - remainingKm)) : "—"}</span>
          <span>Gesamt: {hasActiveJob && totalKm > 0 ? km(totalKm) : "—"}</span>
          <span>Verbleibend: {hasActiveJob && remainingKm > 0 ? km(remainingKm) : "—"}</span>
        </div>
      </div>
    </div>
  );
}


function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function estimateEta(remainingKm: number, speedKmh: number) {
  if (remainingKm <= 0) return "Angekommen";
  if (speedKmh < 5) return "—";
  const minutes = (remainingKm / speedKmh) * 60;
  const eta = new Date(Date.now() + minutes * 60_000);
  return eta.toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatEvent(type: string, payload: Record<string, unknown> | null): string {
  switch (type) {
    case "job_started":
      return `Auftrag gestartet: ${payload?.cargo ?? ""}`;
    case "job_finished":
    case "job_delivered":
      return "Auftrag abgeliefert";
    case "job_cancelled":
      return "Auftrag abgebrochen";
    case "refuel":
      return `Tankvorgang${payload?.liters ? ` (${payload.liters} L)` : ""}`;
    case "damage":
      return `Motorschaden gemeldet${payload?.pct ? ` (${payload.pct}%)` : ""}`;
    case "collision":
      return "Kollision erkannt";
    case "cruise_on":
      return `Tempomat aktiviert${payload?.speed ? ` (${payload.speed} km/h)` : ""}`;
    case "cruise_off":
      return "Tempomat deaktiviert";
    case "connected":
      return "Verbindung hergestellt";
    case "disconnected":
      return "Verbindung getrennt";
    case "speed":
      return `Geschwindigkeit: ${payload?.value ?? "?"} km/h`;
    default:
      return type;
  }
}
