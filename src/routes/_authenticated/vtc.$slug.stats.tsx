import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  TrendingUp,
  TrendingDown,
  Gauge,
  Coins,
  Route as RouteIcon,
  ClipboardCheck,
  Users,
  Wallet,
  Fuel,
  Truck,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import { getBusinessIntelligence, listVtcDriversForFilter } from "@/lib/bi.functions";
import { currency, km as fmtKm } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vtc/$slug/stats")({
  component: StatsPage,
});

type TabKey =
  | "overview"
  | "finance"
  | "drivers"
  | "vehicles"
  | "jobs"
  | "routes"
  | "games"
  | "convoys"
  | "compare";

type RangeKey = "today" | "7d" | "30d" | "month" | "year" | "all" | "custom";

function rangeDates(key: RangeKey, customFrom?: string, customTo?: string) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);
  switch (key) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "7d":
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "30d":
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      break;
    case "month":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "year":
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "custom":
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(customTo).toISOString() : undefined,
      };
    case "all":
    default:
      return { from: undefined, to: undefined };
  }
  return { from: start.toISOString(), to: end.toISOString() };
}

const STATUS_COLORS: Record<string, string> = {
  approved: "#22c55e",
  in_progress: "#3b82f6",
  submitted: "#f59e0b",
  cancelled: "#ef4444",
  rejected: "#f87171",
  draft: "#94a3b8",
};

const STATUS_LABELS: Record<string, string> = {
  approved: "Abgeschlossen",
  in_progress: "Unterwegs",
  submitted: "Eingereicht",
  cancelled: "Storniert",
  rejected: "Abgelehnt",
  draft: "Entwurf",
};

function StatsPage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const fetchBi = useServerFn(getBusinessIntelligence);
  const fetchDrivers = useServerFn(listVtcDriversForFilter);

  const [tab, setTab] = useState<TabKey>("overview");
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [game, setGame] = useState<"all" | "ets2" | "ats">("all");
  const [driverId, setDriverId] = useState<string>("");

  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;

  const dateRange = useMemo(
    () => rangeDates(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["bi", vtcId, range, customFrom, customTo, game, driverId],
    queryFn: () =>
      fetchBi({
        data: {
          vtcId: vtcId!,
          from: dateRange.from,
          to: dateRange.to,
          game,
          driverId: driverId || undefined,
        },
      }),
    enabled: !!vtcId,
  });

  const { data: drivers } = useQuery({
    queryKey: ["bi-drivers", vtcId],
    queryFn: () => fetchDrivers({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  const exportCsv = () => {
    if (!data) return;
    const rows: string[][] = [
      ["Kennzahl", "Wert"],
      ["Gesamtumsatz", data.totals.revenue.toFixed(2)],
      ["Gesamtgewinn", data.totals.profit.toFixed(2)],
      ["Gesamtkilometer", data.totals.km.toFixed(0)],
      ["Abgeschlossene Aufträge", String(data.totals.jobs)],
      ["Aktive Fahrer", String(data.totals.activeDrivers)],
      ["Ø Gewinn / Auftrag", data.totals.avgProfitPerJob.toFixed(2)],
      ["Ø Gewinn / km", data.totals.avgProfitPerKm.toFixed(3)],
      ["Ø Verbrauch (l/100km)", data.totals.avgFuelPer100.toFixed(2)],
      ["Gewinnmarge %", data.totals.margin.toFixed(1)],
      [],
      ["Top Fahrer nach Gewinn", "Gewinn"],
      ...data.topDriversByProfit.map((d) => [d.display_name, d.profit.toFixed(2)]),
      [],
      ["Top Routen (Kilometer)", "km"],
      ...data.topRoutesByKm.map((r) => [r.route, r.km.toFixed(0)]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${(c ?? "").toString().replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vtc-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiken & Business Intelligence"
        subtitle="Detaillierte Auswertungen und Kennzahlen deiner VTC"
        icon={BarChart3}
      >
        <button
          onClick={exportCsv}
          disabled={!data}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
        >
          <Download className="size-4" /> Exportieren
        </button>
      </PageHeader>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "Heute"],
            ["7d", "7 Tage"],
            ["30d", "30 Tage"],
            ["month", "Dieser Monat"],
            ["year", "Dieses Jahr"],
            ["all", "Alle"],
            ["custom", "Benutzerdefiniert"],
          ] as [RangeKey, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setRange(k)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              range === k
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface-2 text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        {range === "custom" && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
            />
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={game}
            onChange={(e) => setGame(e.target.value as typeof game)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
          >
            <option value="all">Alle Spiele</option>
            <option value="ets2">ETS2</option>
            <option value="ats">ATS</option>
          </select>
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm"
          >
            <option value="">Alle Fahrer</option>
            {(drivers ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={Gauge}
          label="Gesamtumsatz"
          value={currency(data?.totals.revenue ?? 0)}
          delta={data?.comparison.revenue ?? null}
        />
        <Kpi
          icon={Coins}
          label="Gesamtgewinn"
          value={currency(data?.totals.profit ?? 0)}
          delta={data?.comparison.profit ?? null}
        />
        <Kpi
          icon={RouteIcon}
          label="Gesamtkilometer"
          value={fmtKm(data?.totals.km ?? 0)}
          delta={data?.comparison.km ?? null}
        />
        <Kpi
          icon={ClipboardCheck}
          label="Abgeschlossene Aufträge"
          value={String(data?.totals.jobs ?? 0)}
          delta={data?.comparison.jobs ?? null}
        />
        <Kpi
          icon={Users}
          label="Aktive Fahrer"
          value={String(data?.totals.activeDrivers ?? 0)}
          delta={data?.comparison.activeDrivers ?? null}
        />
        <Kpi
          icon={Wallet}
          label="Ø Gewinn / Auftrag"
          value={currency(data?.totals.avgProfitPerJob ?? 0)}
          delta={data?.comparison.avgProfit ?? null}
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["overview", "Übersicht"],
            ["finance", "Finanzen"],
            ["drivers", "Fahrer"],
            ["vehicles", "Fahrzeuge"],
            ["jobs", "Aufträge"],
            ["routes", "Routen"],
            ["games", "Spiele (ETS2/ATS)"],
            ["compare", "Vergleiche"],
          ] as [TabKey, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`border-b-2 px-4 py-2 text-sm transition-colors ${
              tab === k
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Statistiken werden geladen …
        </div>
      )}

      {data && tab === "overview" && <OverviewTab data={data} />}
      {data && tab === "finance" && <FinanceTab data={data} />}
      {data && tab === "drivers" && <DriversTab data={data} />}
      {data && tab === "vehicles" && <VehiclesTab data={data} />}
      {data && tab === "jobs" && <JobsTab data={data} />}
      {data && tab === "routes" && <RoutesTab data={data} />}
      {data && tab === "games" && <GamesTab data={data} />}
      {data && tab === "compare" && <CompareTab data={data} />}

      {/* Bericht Generator */}
      <div className="panel p-5">
        <h3 className="mb-1 text-lg font-semibold">Benutzerdefinierter Bericht</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          Erstelle individuelle Berichte und Auswertungen nach deinen Anforderungen.
        </p>
        <div className="flex flex-wrap gap-3">
          <select className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            <option>Berichtstyp wählen</option>
            <option>Finanzübersicht</option>
            <option>Fahrer-Leistung</option>
            <option>Flottenauslastung</option>
          </select>
          <input
            type="date"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <input
            type="date"
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <button
            onClick={exportCsv}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Bericht generieren
          </button>
        </div>
      </div>
    </div>
  );
}

type Bi = NonNullable<ReturnType<typeof useOverviewData>>;

// helper type only
function useOverviewData(): Awaited<ReturnType<typeof getBusinessIntelligence>> | undefined {
  return undefined;
}

function Kpi({
  icon: Icon,
  label,
  value,
  delta,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  delta: number | null;
}) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
      </div>
      <div className="num mt-2 text-2xl font-bold">{value}</div>
      {delta !== null ? (
        <div
          className={`mt-1 flex items-center gap-1 text-xs ${
            positive ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
          {positive ? "+" : ""}
          {delta.toFixed(1)}% vs. Vormonat
        </div>
      ) : (
        <div className="mt-1 text-xs text-muted-foreground">Keine Vergleichsdaten</div>
      )}
    </div>
  );
}

function Panel({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ label }: { label?: string }) {
  return (
    <div className="grid h-full min-h-40 place-items-center text-sm text-muted-foreground">
      {label ?? "Keine Daten im gewählten Zeitraum"}
    </div>
  );
}

function OverviewTab({ data }: { data: Bi }) {
  const hasMonths = data.months.some((m) => m.revenue > 0 || m.profit > 0);
  const hasStatus = data.statusBreakdown.length > 0;
  const hasGame = data.revenueByGame.length > 0;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Umsatz & Gewinn Entwicklung">
        <div className="h-72">
          {hasMonths ? (
            <ResponsiveContainer>
              <LineChart data={data.months}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Legend />
                <Line type="monotone" dataKey="revenue" name="Umsatz" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="profit" name="Gewinn" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </Panel>

      <Panel title="Aufträge nach Status">
        <div className="h-72">
          {hasStatus ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.statusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {data.statusBreakdown.map((s) => (
                    <Cell key={s.status} fill={STATUS_COLORS[s.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number, _n, p) => [`${v}`, STATUS_LABELS[String(p.payload.status)] ?? p.payload.status]}
                />
                <Legend formatter={(v) => STATUS_LABELS[String(v)] ?? v} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </Panel>

      <Panel title="Umsatz nach Spielen">
        <div className="h-72">
          {hasGame ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.revenueByGame}
                  dataKey="revenue"
                  nameKey="game"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {data.revenueByGame.map((g) => (
                    <Cell key={g.game} fill={g.game === "ets2" ? "#22c55e" : "#3b82f6"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Legend formatter={(v) => (v === "ets2" ? "ETS2" : "ATS")} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </Panel>

      <Panel title="Top 5 Fahrer (nach Gewinn)">
        {data.topDriversByProfit.length ? (
          <ul className="space-y-3">
            {data.topDriversByProfit.map((d, i) => (
              <li key={d.driver_id} className="flex items-center gap-3">
                <div className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/20 text-xs text-primary">
                  {d.avatar_url ? (
                    <img src={d.avatar_url} alt={d.display_name} className="size-full object-cover" />
                  ) : (
                    d.display_name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="flex-1 truncate text-sm font-medium">{d.display_name}</div>
                <div className="num text-sm font-semibold">{currency(d.profit)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Panel>

      <Panel title="Kilometer nach Monaten">
        <div className="h-64">
          {hasMonths ? (
            <ResponsiveContainer>
              <BarChart data={data.months}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => fmtKm(v)}
                />
                <Bar dataKey="km" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </Panel>

      <Panel title="Aufträge nach Entfernung">
        {data.distanceBuckets.some((b) => b.count > 0) ? (
          <div className="space-y-3">
            {data.distanceBuckets.map((b) => {
              const total = data.distanceBuckets.reduce((s, x) => s + x.count, 0) || 1;
              const pct = (b.count / total) * 100;
              return (
                <div key={b.key}>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{b.key} km</span>
                    <span>
                      {b.count} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
    </div>
  );
}

function FinanceTab({ data }: { data: Bi }) {
  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <div className="panel p-5 lg:col-span-3">
        <h3 className="mb-4 text-base font-semibold">Umsatz & Gewinn (12 Monate)</h3>
        <div className="h-80">
          {data.months.some((m) => m.revenue > 0) ? (
            <ResponsiveContainer>
              <BarChart data={data.months}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Legend />
                <Bar dataKey="revenue" name="Umsatz" fill="#22c55e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="profit" name="Gewinn" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </div>
      <div className="panel space-y-3 p-5">
        <h3 className="text-base font-semibold">Finanzübersicht</h3>
        <Row label="Einnahmen" value={currency(data.totals.revenue)} accent="emerald" />
        <Row
          label="Ausgaben"
          value={currency(data.totals.wages + data.totals.fuel)}
          accent="red"
        />
        <Row label="Gewinn" value={currency(data.totals.profit)} accent="emerald" />
        <Row label="Gewinnmarge" value={`${data.totals.margin.toFixed(1)}%`} />
        <Row label="Ø Gewinn / Auftrag" value={currency(data.totals.avgProfitPerJob)} />
        <Row
          label="Ø Gewinn / km"
          value={`${data.totals.avgProfitPerKm.toFixed(2)} €`}
        />
        <Row label="Löhne" value={currency(data.totals.wages)} />
        <Row label="Kraftstoffkosten" value={currency(data.totals.fuel)} />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "red";
}) {
  const color =
    accent === "emerald" ? "text-emerald-400" : accent === "red" ? "text-red-400" : "";
  return (
    <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm first:border-t-0 first:pt-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`num font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function DriversTab({ data }: { data: Bi }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <RankingList
        title="Top Fahrer – Gewinn"
        icon={Users}
        items={data.topDriversByProfit.map((d) => ({
          id: d.driver_id,
          name: d.display_name,
          avatar: d.avatar_url,
          value: currency(d.profit),
          sub: `${d.jobs} Aufträge`,
        }))}
      />
      <RankingList
        title="Top Fahrer – Kilometer"
        icon={RouteIcon}
        items={data.topDriversByKm.map((d) => ({
          id: d.driver_id,
          name: d.display_name,
          avatar: d.avatar_url,
          value: fmtKm(d.km),
          sub: `${d.jobs} Aufträge`,
        }))}
      />
    </div>
  );
}

function VehiclesTab({ data }: { data: Bi }) {
  return (
    <div className="panel p-5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <Truck className="size-4" /> Fahrzeugauslastung
      </h3>
      {data.trucks.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 text-left">Fahrzeug</th>
                <th className="pb-2 text-right">Aufträge</th>
                <th className="pb-2 text-right">Kilometer</th>
                <th className="pb-2 text-right">Gewinn</th>
                <th className="pb-2 text-right">Sprit</th>
                <th className="pb-2 text-right">Ø Schaden</th>
                <th className="pb-2 text-right">Auslastung</th>
              </tr>
            </thead>
            <tbody>
              {data.trucks.map((t) => (
                <tr key={t.truck} className="border-t border-border/60">
                  <td className="py-2 font-medium">{t.truck}</td>
                  <td className="py-2 text-right num">{t.jobs}</td>
                  <td className="py-2 text-right num">{fmtKm(t.km)}</td>
                  <td className="py-2 text-right num">{currency(t.profit)}</td>
                  <td className="py-2 text-right num">{currency(t.fuel)}</td>
                  <td className="py-2 text-right num">{t.damage.toFixed(1)}%</td>
                  <td className="py-2 text-right num">{t.utilization.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JobsTab({ data }: { data: Bi }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Auftragsstatus">
        {data.statusBreakdown.length ? (
          <ul className="space-y-2">
            {data.statusBreakdown.map((s) => (
              <li
                key={s.status}
                className="flex items-center justify-between rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: STATUS_COLORS[s.status] ?? "#64748b" }}
                  />
                  {STATUS_LABELS[s.status] ?? s.status}
                </span>
                <span className="num font-semibold">{s.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Panel>
      <Panel title="Top Frachten">
        {data.topCargo.length ? (
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2 text-left">Fracht</th>
                <th className="pb-2 text-right">Aufträge</th>
                <th className="pb-2 text-right">Umsatz</th>
              </tr>
            </thead>
            <tbody>
              {data.topCargo.map((c) => (
                <tr key={c.cargo} className="border-t border-border/60">
                  <td className="py-2">{c.cargo}</td>
                  <td className="py-2 text-right num">{c.jobs}</td>
                  <td className="py-2 text-right num">{currency(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty />
        )}
      </Panel>
    </div>
  );
}

function RoutesTab({ data }: { data: Bi }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="panel space-y-4 p-5 lg:col-span-2">
        <h3 className="text-base font-semibold">Top 5 Routen nach Kilometern</h3>
        {data.topRoutesByKm.length === 0 ? (
          <Empty />
        ) : (
          <ul className="space-y-3">
            {data.topRoutesByKm.map((r, i) => (
              <li key={r.route} className="flex items-center gap-3 text-sm">
                <div className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted-foreground">
                  {i + 1}
                </div>
                <div className="flex-1 truncate">{r.route}</div>
                <div className="num text-right text-xs text-muted-foreground">
                  {r.jobs} × {fmtKm(r.km / r.jobs)}
                </div>
                <div className="num w-24 text-right font-semibold">{fmtKm(r.km)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel space-y-3 p-5">
        <h3 className="text-base font-semibold">Highlights</h3>
        <Highlight label="Häufigste Route" value={data.mostFrequentRoute?.route ?? "—"} sub={data.mostFrequentRoute ? `${data.mostFrequentRoute.jobs} Aufträge` : undefined} />
        <Highlight label="Längste Route" value={data.longestRoute?.route ?? "—"} sub={data.longestRoute ? `Ø ${fmtKm(data.longestRoute.km / data.longestRoute.jobs)}` : undefined} />
        <Highlight label="Wirtschaftlichste Route" value={data.mostProfitableRoute?.route ?? "—"} sub={data.mostProfitableRoute ? currency(data.mostProfitableRoute.profit) : undefined} />
      </div>
    </div>
  );
}

function Highlight({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function GamesTab({ data }: { data: Bi }) {
  const total = data.revenueByGame.reduce((s, g) => s + g.revenue, 0) || 1;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Umsatz nach Spielen">
        <div className="h-72">
          {data.revenueByGame.length ? (
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.revenueByGame}
                  dataKey="revenue"
                  nameKey="game"
                  innerRadius={70}
                  outerRadius={100}
                >
                  {data.revenueByGame.map((g) => (
                    <Cell key={g.game} fill={g.game === "ets2" ? "#22c55e" : "#3b82f6"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => currency(v)}
                />
                <Legend formatter={(v) => (v === "ets2" ? "ETS2" : "ATS")} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </Panel>
      <Panel title="Aufteilung">
        {data.revenueByGame.length ? (
          <ul className="space-y-3">
            {data.revenueByGame.map((g) => (
              <li key={g.game}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{g.game === "ets2" ? "ETS2" : "ATS"}</span>
                  <span className="num">
                    {currency(g.revenue)}{" "}
                    <span className="text-muted-foreground">
                      ({((g.revenue / total) * 100).toFixed(1)}%)
                    </span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(g.revenue / total) * 100}%`,
                      background: g.game === "ets2" ? "#22c55e" : "#3b82f6",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty />
        )}
      </Panel>
      <div className="panel p-5 lg:col-span-2">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Fuel className="size-4" /> Kraftstoffverbrauch (Ø l/100 km)
        </h3>
        <div className="h-72">
          {data.days.some((d) => d.consumption > 0) ? (
            <ResponsiveContainer>
              <LineChart data={data.days}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => `${v.toFixed(2)} €/100km`}
                />
                <Line
                  type="monotone"
                  dataKey="consumption"
                  stroke="var(--primary)"
                  strokeWidth={2.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </div>
      </div>
    </div>
  );
}

function CompareTab({ data }: { data: Bi }) {
  const rows = [
    { label: "Gesamtumsatz", value: currency(data.totals.revenue), delta: data.comparison.revenue },
    { label: "Gesamtgewinn", value: currency(data.totals.profit), delta: data.comparison.profit },
    { label: "Gesamtkilometer", value: fmtKm(data.totals.km), delta: data.comparison.km },
    {
      label: "Abgeschlossene Aufträge",
      value: String(data.totals.jobs),
      delta: data.comparison.jobs,
    },
    {
      label: "Aktive Fahrer",
      value: String(data.totals.activeDrivers),
      delta: data.comparison.activeDrivers,
    },
    {
      label: "Ø Gewinn / Auftrag",
      value: currency(data.totals.avgProfitPerJob),
      delta: data.comparison.avgProfit,
    },
  ];
  return (
    <div className="panel p-5">
      <h3 className="mb-4 text-base font-semibold">Vergleich zum Vormonat</h3>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between border-t border-border/60 pt-3 first:border-t-0 first:pt-0"
          >
            <span className="text-sm text-muted-foreground">{r.label}</span>
            <span className="flex items-center gap-3">
              <span className="num text-sm font-semibold">{r.value}</span>
              <span
                className={`num inline-flex min-w-16 items-center justify-end gap-1 rounded-md px-2 py-0.5 text-xs ${
                  r.delta === null
                    ? "bg-surface-2 text-muted-foreground"
                    : r.delta >= 0
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                }`}
              >
                {r.delta === null
                  ? "—"
                  : `${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)}%`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RankingList({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Users;
  items: { id: string; name: string; avatar: string | null; value: string; sub?: string }[];
}) {
  return (
    <div className="panel p-5">
      <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
        <Icon className="size-4" /> {title}
      </h3>
      {items.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3">
              <div className="grid size-7 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted-foreground">
                {i + 1}
              </div>
              <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/20 text-xs text-primary">
                {it.avatar ? (
                  <img src={it.avatar} alt={it.name} className="size-full object-cover" />
                ) : (
                  it.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="flex-1 truncate">
                <div className="truncate text-sm font-medium">{it.name}</div>
                {it.sub && <div className="text-xs text-muted-foreground">{it.sub}</div>}
              </div>
              <div className="num text-sm font-semibold">{it.value}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
