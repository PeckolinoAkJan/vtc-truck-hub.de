import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  UserCheck,
  ClipboardList,
  Truck,
  Newspaper,
  Zap,
  Bell,
  Plus,
  CalendarDays,
  UserPlus,
  FileText,
  ChevronRight,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getVtcContext } from "@/lib/vtcs.functions";
import { getDashboard } from "@/lib/dashboard.functions";
import { listLiveTelemetry } from "@/lib/telemetry.functions";
import { listNews } from "@/lib/news.functions";
import { currency, km } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vtc/$slug/")({
  component: Dashboard,
});

function Dashboard() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const displayName = ctx?.profile?.display_name ?? "Fahrer";

  const fetchDash = useServerFn(getDashboard);
  const { data: dash } = useQuery({
    queryKey: ["dash", vtcId],
    queryFn: () => fetchDash({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  const fetchLive = useServerFn(listLiveTelemetry);
  const { data: live } = useQuery({
    queryKey: ["dash-live", vtcId],
    queryFn: () => fetchLive({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
    refetchInterval: 15_000,
  });

  const fetchNews = useServerFn(listNews);
  const { data: news } = useQuery({
    queryKey: ["dash-news"],
    queryFn: () => fetchNews(),
  });

  const t = dash?.totals;
  const now = useNow();
  const activeJobs = (t?.pending ?? 0) + (t?.liveDriversNow ?? 0); // approx: submitted + laufende
  const liveNow = live ?? [];
  const cutoff = Date.now() - 5 * 60_000;
  const onlineDrivers = liveNow.filter(
    (r) => new Date(r.updated_at).getTime() > cutoff && r.status !== "offline",
  );
  const drivingDrivers = onlineDrivers.filter((r) => r.status === "driving");

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Willkommen zurück, <span className="text-foreground font-medium">{displayName}</span>.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface px-4 py-2.5 text-right text-xs text-muted-foreground">
          <div className="font-medium text-foreground">{fmtDate(now)}</div>
          <div>Serverzeit · {fmtTime(now)}</div>
        </div>
      </header>

      {/* KPI Row + Hero */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Online Fahrer"
          value={`${onlineDrivers.length} / ${t?.members ?? 0}`}
          icon={UserCheck}
          tone="emerald"
        />
        <KpiCard
          label="Aktive Aufträge"
          value={String(t?.pending ?? 0)}
          hint={`${t?.jobs ?? 0} genehmigt gesamt`}
          icon={ClipboardList}
          tone="blue"
        />
        <KpiCard
          label="Fahrzeuge im Einsatz"
          value={`${t?.vehiclesInUse ?? 0}`}
          hint={`von ${t?.vehiclesTotal ?? 0}`}
          icon={Truck}
          tone="orange"
        />
        <div className="panel relative overflow-hidden p-0 min-h-[128px]">
          <div className="absolute inset-0 hero-bg" />
          <div className="relative flex h-full flex-col justify-between p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              VTC Hub · Live
            </div>
            <div>
              <div className="num text-2xl font-bold">{km(t?.km ?? 0)}</div>
              <div className="text-xs text-muted-foreground">Gesamtstrecke</div>
            </div>
          </div>
          <Truck className="absolute -right-4 -bottom-4 size-24 text-primary/20" />
        </div>
      </div>

      {/* News + Live-Stats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-1">
          <SectionTitle icon={Newspaper} title="News-Feed">
            <Link
              to="/profile"
              className="text-xs text-primary hover:underline"
            >
              News verwalten
            </Link>
          </SectionTitle>
          <ul className="mt-4 space-y-3">
            {(news ?? []).slice(0, 4).map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-border bg-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{n.title}</div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {relTime(n.created_at)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {n.content}
                </p>
              </li>
            ))}
            {(news ?? []).length === 0 && (
              <li className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Noch keine News.
              </li>
            )}
          </ul>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <SectionTitle icon={Activity} title="Live-Statistiken" />
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <MiniStat label="Umsatz" value={currency(t?.revenue ?? 0)} tone="emerald" />
            <MiniStat label="Gewinn" value={currency(t?.profit ?? 0)} tone="emerald" />
            <MiniStat label="Kosten" value={currency(t?.cost ?? 0)} tone="rose" />
            <MiniStat label="Kilometer" value={km(t?.km ?? 0)} tone="blue" />
          </div>
          <div className="mt-4">
            <ProfitChart data={dash?.series ?? []} />
          </div>
        </section>
      </div>

      {/* Aktive Fahrer + Schnellzugriff + Benachrichtigungen */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <SectionTitle icon={UserCheck} title="Aktive Fahrer (Live)">
            <Link
              to={`/vtc/${slug}/live`}
              className="text-xs text-primary hover:underline"
            >
              Live-Karte öffnen
            </Link>
          </SectionTitle>
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Fahrer</th>
                  <th className="px-4 py-2.5 font-medium">Standort</th>
                  <th className="px-4 py-2.5 font-medium">Fahrzeug</th>
                  <th className="px-4 py-2.5 text-right font-medium">Speed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {drivingDrivers.slice(0, 6).map((d) => (
                  <tr key={d.driver_id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid size-8 place-items-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                          {(d.driver_name ?? "F").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="font-medium">{d.driver_name}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.source_city ?? d.dest_city ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[d.truck_brand, d.truck_model].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="num px-4 py-3 text-right">
                      {Math.round(Number(d.speed_kmh ?? 0))} km/h
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusDot status={d.status} />
                    </td>
                  </tr>
                ))}
                {drivingDrivers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-xs text-muted-foreground"
                    >
                      Aktuell keine Fahrer online.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4">
          <div className="panel p-5">
            <SectionTitle icon={Zap} title="Schnellzugriff" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <QuickAction
                icon={Plus}
                label="Neuer Auftrag"
                to={`/vtc/${slug}/jobs/new`}
              />
              <QuickAction
                icon={CalendarDays}
                label="Konvoi planen"
                to={`/vtc/${slug}/events`}
              />
              <QuickAction
                icon={UserPlus}
                label="Fahrer einladen"
                to={`/vtc/${slug}/drivers`}
              />
              <QuickAction
                icon={FileText}
                label="Dokument hoch"
                to={`/vtc/${slug}/documents`}
              />
            </div>
          </div>

          <div className="panel p-5">
            <SectionTitle icon={Bell} title="Benachrichtigungen" />
            <ul className="mt-4 space-y-3">
              {(dash?.activities ?? []).slice(0, 5).map((a, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-1 size-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">
                      {labelForEvent(a.type)}{" "}
                      <span className="text-muted-foreground">
                        von {a.driver_name}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {relTime(a.created_at)}
                    </div>
                  </div>
                </li>
              ))}
              {(dash?.activities ?? []).length === 0 && (
                <li className="py-6 text-center text-xs text-muted-foreground">
                  Keine Benachrichtigungen.
                </li>
              )}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- shared UI primitives ---------- */

const toneMap: Record<string, string> = {
  emerald: "bg-primary/15 text-primary",
  blue: "bg-sky-500/15 text-sky-400",
  orange: "bg-orange-500/15 text-orange-400",
  rose: "bg-rose-500/15 text-rose-400",
};

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone: keyof typeof toneMap;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="num mt-2 text-2xl font-bold tracking-tight">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${toneMap[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof toneMap;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`num mt-1 text-lg font-bold ${toneMap[tone].split(" ")[1]}`}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  to,
}: {
  icon: LucideIcon;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <span className="truncate">{label}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary" />
    </Link>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    driving: { color: "bg-primary", label: "Fährt" },
    idle: { color: "bg-warning", label: "Pause" },
    offline: { color: "bg-muted-foreground", label: "Offline" },
  };
  const m = map[status] ?? map.offline;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`size-2 rounded-full ${m.color}`} />
      {m.label}
    </span>
  );
}

function ProfitChart({ data }: { data: { month: string; profit: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.profit));
  const w = 640;
  const h = 180;
  const pad = 28;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = pad + i * step;
    const y = h - pad - (d.profit / max) * (h - pad * 2);
    return { x, y, ...d };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area =
    `M ${points[0]?.x ?? 0} ${h - pad} ` +
    points.map((p) => `L ${p.x} ${p.y}`).join(" ") +
    ` L ${points[points.length - 1]?.x ?? 0} ${h - pad} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-44 w-full">
      <defs>
        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((r) => (
        <line
          key={r}
          x1={pad}
          x2={w - pad / 2}
          y1={h - pad - r * (h - pad * 2)}
          y2={h - pad - r * (h - pad * 2)}
          stroke="var(--border)"
          strokeDasharray="3 4"
        />
      ))}
      {points.length > 0 && (
        <>
          <path d={area} fill="url(#profitGrad)" />
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
          {points.map((p) => (
            <circle key={p.month + p.x} cx={p.x} cy={p.y} r="3.5" fill="var(--primary)" />
          ))}
        </>
      )}
      {points.map((p) => (
        <text
          key={"lbl" + p.month + p.x}
          x={p.x}
          y={h - 8}
          textAnchor="middle"
          fill="var(--muted-foreground)"
          fontSize="10"
        >
          {p.month}
        </text>
      ))}
    </svg>
  );
}

function useNow() {
  const [d, setD] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setD(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return d;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function labelForEvent(type: string) {
  switch (type) {
    case "job_delivered":
      return "Neue Abrechnung";
    case "job_approved":
      return "Abrechnung genehmigt";
    case "job_started":
      return "Neuer Auftrag gestartet";
    case "job_cancelled":
      return "Auftrag abgebrochen";
    case "vehicle_service":
      return "Fahrzeug gewartet";
    default:
      return type;
  }
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag(en)`;
}
