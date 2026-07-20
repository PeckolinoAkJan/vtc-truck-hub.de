import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Wallet,
  Fuel,
  Wrench,
  ShieldAlert,
  TrendingUp,
  TrendingDown,
  Users,
  Trophy,
  Settings2,
  BarChart3,
  Plus,
  Trash2,
  Search,
  Download,
  Star,
  Bell,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import {
  getCostDashboard,
  listFuelLogs,
  upsertFuelLog,
  deleteFuelLog,
  listServiceLogs,
  upsertServiceLog,
  deleteServiceLog,
  listDamageLogs,
  upsertDamageLog,
  deleteDamageLog,
  getDriverCostBreakdown,
  getCostSettings,
  saveCostSettings,
  listVtcDriversAndVehicles,
  type FuelLog,
  type ServiceLog,
  type DamageLog,
} from "@/lib/costs.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/costs")({
  component: CostsPage,
});

type TabKey =
  | "overview"
  | "fuel"
  | "service"
  | "damage"
  | "breakdown"
  | "drivers"
  | "rankings"
  | "settings";

const TABS: { key: TabKey; label: string; icon: any; staffOnly?: boolean }[] = [
  { key: "overview", label: "Übersicht", icon: BarChart3 },
  { key: "fuel", label: "Tankprotokoll", icon: Fuel },
  { key: "service", label: "Serviceprotokoll", icon: Wrench },
  { key: "damage", label: "Schadensprotokoll", icon: ShieldAlert },
  { key: "breakdown", label: "Kostenübersicht", icon: Wallet },
  { key: "drivers", label: "Fahrerkosten", icon: Users },
  { key: "rankings", label: "Rankings", icon: Trophy },
  { key: "settings", label: "Einstellungen", icon: Settings2, staffOnly: true },
];

const SERVICE_LABELS: Record<string, string> = {
  oil: "Ölwechsel",
  tires: "Reifenwechsel",
  tuv: "HU/TÜV",
  brakes: "Bremsen",
  inspection: "Inspektion",
  engine: "Motorservice",
  gearbox: "Getriebeservice",
  other: "Sonstige",
};

const INSURANCE_LABELS: Record<string, { label: string; cls: string }> = {
  none: { label: "Keine", cls: "bg-muted text-muted-foreground" },
  pending: { label: "Prüfung", cls: "bg-orange-500/15 text-orange-400" },
  approved: { label: "Übernommen", cls: "bg-emerald-500/15 text-emerald-400" },
  denied: { label: "Abgelehnt", cls: "bg-destructive/15 text-destructive" },
};

const WORK_LABELS: Record<string, { label: string; cls: string }> = {
  open: { label: "Offen", cls: "bg-orange-500/15 text-orange-400" },
  in_progress: { label: "In Arbeit", cls: "bg-primary/15 text-primary" },
  done: { label: "Erledigt", cls: "bg-emerald-500/15 text-emerald-400" },
};

const PIE_COLORS = ["#22c55e", "#f97316", "#3b82f6", "#a855f7", "#ef4444", "#eab308"];

const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);
const fmtEUR2 = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);
const fmtKm = (n: number) => `${new Intl.NumberFormat("de-DE").format(Math.round(n || 0))} km`;
const fmtNum = (n: number, d = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: d }).format(n || 0);

function CostsPage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const role = ctx?.role;
  const isStaff = role === "owner" || role === "admin" || role === "dispatcher";
  const isAdmin = role === "owner" || role === "admin";

  const [tab, setTab] = useState<TabKey>("overview");
  const [range, setRange] = useState<number>(30);

  return (
    <div>
      <PageHeader title="Kosten & Service" subtitle="Betriebskosten, Wartungen und Wirtschaftlichkeit deiner Spedition." icon={Wallet}>
        <select
          value={range}
          onChange={(e) => setRange(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm"
        >
          <option value={7}>Letzte 7 Tage</option>
          <option value={30}>Letzte 30 Tage</option>
          <option value={90}>Letzte 90 Tage</option>
          <option value={365}>Letztes Jahr</option>
        </select>
      </PageHeader>

      {/* Tab bar */}
      <div className="panel mb-5 flex flex-wrap gap-1 p-1.5">
        {TABS.filter((t) => !t.staffOnly || isAdmin).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${
                tab === t.key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {vtcId && (
        <>
          {tab === "overview" && <OverviewTab vtcId={vtcId} range={range} />}
          {tab === "fuel" && <FuelTab vtcId={vtcId} canManage={isStaff} />}
          {tab === "service" && <ServiceTab vtcId={vtcId} canManage={isStaff} />}
          {tab === "damage" && <DamageTab vtcId={vtcId} canManage={isStaff} />}
          {tab === "breakdown" && <BreakdownTab vtcId={vtcId} range={range} />}
          {tab === "drivers" && <DriversTab vtcId={vtcId} range={range} />}
          {tab === "rankings" && <RankingsTab vtcId={vtcId} range={range} />}
          {tab === "settings" && isAdmin && <SettingsTab vtcId={vtcId} />}
        </>
      )}
    </div>
  );
}

/* =============================================================
 * OVERVIEW
 * ============================================================= */
function OverviewTab({ vtcId, range }: { vtcId: string; range: number }) {
  const fetchDash = useServerFn(getCostDashboard);
  const { data } = useQuery({
    queryKey: ["cost-dash", vtcId, range],
    queryFn: () => fetchDash({ data: { vtcId, rangeDays: range } }),
  });

  if (!data) return <div className="panel p-6 text-sm text-muted-foreground">Lade Kennzahlen…</div>;

  return (
    <div className="grid gap-4">
      {/* Cost KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <Kpi icon={Fuel} label="Kraftstoff" value={fmtEUR(data.fuelCost)} accent="orange" />
        <Kpi icon={Wrench} label="Reparaturen" value={fmtEUR(data.repairCost)} accent="red" />
        <Kpi icon={Wrench} label="Wartung" value={fmtEUR(data.maintenanceCost)} accent="blue" />
        <Kpi icon={ShieldAlert} label="Reifen" value={fmtEUR(data.tiresCost)} accent="purple" />
        <Kpi icon={Wallet} label="Sonstige" value={fmtEUR(data.otherCost)} accent="muted" />
      </div>

      {/* Revenue / profit row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Umsatz" value={fmtEUR(data.revenue)} accent="emerald" hint={`${fmtKm(data.km)} gefahren`} />
        <Kpi icon={TrendingUp} label="Gewinn heute" value={fmtEUR(data.profitDay)} accent="emerald" />
        <Kpi icon={TrendingUp} label="Gewinn Monat" value={fmtEUR(data.profitMonth)} accent="emerald" />
        <Kpi icon={TrendingUp} label="Gewinn Jahr" value={fmtEUR(data.profitYear)} accent="emerald" />
      </div>

      {/* Ratios */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={BarChart3} label="Wirtschaftlichkeit" value={`${data.economyIndex}%`} accent="emerald" hint="Gewinn / Umsatz" />
        <Kpi icon={TrendingDown} label="Kosten je km" value={fmtEUR2(data.costPerKm)} accent="orange" />
        <Kpi icon={TrendingUp} label="Gewinn je km" value={fmtEUR2(data.profitPerKm)} accent="emerald" />
        <Kpi icon={Wallet} label="Gesamtkosten" value={fmtEUR(data.totalCost)} accent="red" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Trend chart */}
        <div className="panel p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Umsatz & Kosten (Verlauf)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: any) => fmtEUR2(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" name="Umsatz" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="costs" name="Kosten" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" name="Gewinn" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost breakdown pie */}
        <div className="panel p-5">
          <h3 className="mb-3 text-sm font-semibold">Kostenverteilung</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.breakdown} dataKey="value" nameKey="label" outerRadius={90} innerRadius={50}>
                  {data.breakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: any) => fmtEUR2(Number(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  accent = "muted",
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  accent?: "emerald" | "orange" | "red" | "blue" | "purple" | "muted";
}) {
  const accentBg: Record<string, string> = {
    emerald: "bg-emerald-500/15 text-emerald-400",
    orange: "bg-orange-500/15 text-orange-400",
    red: "bg-destructive/15 text-destructive",
    blue: "bg-blue-500/15 text-blue-400",
    purple: "bg-purple-500/15 text-purple-400",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`grid size-8 place-items-center rounded-md ${accentBg[accent]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/* =============================================================
 * FUEL TAB
 * ============================================================= */
function FuelTab({ vtcId, canManage }: { vtcId: string; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [game, setGame] = useState<string>("");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const fetchList = useServerFn(listFuelLogs);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["fuel-logs", vtcId, search, game, page],
    queryFn: () =>
      fetchList({
        data: { vtcId, search: search || undefined, game: game || undefined, page, pageSize: 50 },
      }),
  });

  const doDelete = useServerFn(deleteFuelLog);
  const delMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      qc.invalidateQueries({ queryKey: ["fuel-logs", vtcId] });
    },
  });

  const exportCsv = () => {
    const rows = data?.rows ?? [];
    const header = ["Datum", "Uhrzeit", "Fahrer", "Fahrzeug", "Spiel", "Liter", "Preis/L", "Gesamt", "Füllstand", "KM", "Ort"];
    const csv = [header.join(";"), ...rows.map((r) => [
      new Date(r.occurred_at).toLocaleDateString("de-DE"),
      new Date(r.occurred_at).toLocaleTimeString("de-DE"),
      r.driver_name ?? "",
      r.vehicle_label ?? "",
      r.game ?? "",
      r.liters,
      r.price_per_liter,
      r.total_cost,
      r.fuel_level_pct ?? "",
      r.odometer_km ?? "",
      r.station ?? "",
    ].join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tankprotokoll-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Tankstelle suchen…"
            className="rounded-md border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-xs"
          />
        </div>
        <select
          value={game}
          onChange={(e) => setGame(e.target.value)}
          className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs"
        >
          <option value="">Alle Spiele</option>
          <option value="ets2">ETS2</option>
          <option value="ats">ATS</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Download className="size-3.5" /> Export
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5" /> Tankung hinzufügen
          </button>
        </div>
      </div>

      {showForm && <FuelForm vtcId={vtcId} onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["fuel-logs", vtcId] }); }} />}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Fahrer</th>
                <th className="px-3 py-2 text-left">Fahrzeug</th>
                <th className="px-3 py-2 text-left">Spiel</th>
                <th className="px-3 py-2 text-right">Liter</th>
                <th className="px-3 py-2 text-right">€/L</th>
                <th className="px-3 py-2 text-right">Gesamt</th>
                <th className="px-3 py-2 text-right">Füll</th>
                <th className="px-3 py-2 text-right">KM-Stand</th>
                <th className="px-3 py-2 text-left">Ort</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{new Date(r.occurred_at).toLocaleDateString("de-DE")}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(r.occurred_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
                  </td>
                  <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.vehicle_label ?? "—"}</td>
                  <td className="px-3 py-2 uppercase text-xs">{r.game ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.liters, 1)} L</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtNum(r.price_per_liter, 3)} €</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEUR2(r.total_cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.fuel_level_pct != null ? `${r.fuel_level_pct}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.odometer_km != null ? fmtKm(r.odometer_km) : "—"}</td>
                  <td className="px-3 py-2">{r.station ?? "—"}</td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { if (confirm("Eintrag löschen?")) delMut.mutate(r.id); }} className="text-destructive hover:opacity-80">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={canManage ? 11 : 10} className="p-8 text-center text-sm text-muted-foreground">
                    Noch keine Tankeinträge.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={50} total={data?.total ?? 0} onChange={setPage} />
      </div>
    </div>
  );
}

/* =============================================================
 * SERVICE TAB
 * ============================================================= */
function ServiceTab({ vtcId, canManage }: { vtcId: string; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string>("");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const fetchList = useServerFn(listServiceLogs);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["service-logs", vtcId, search, type, page],
    queryFn: () => fetchList({ data: { vtcId, search: search || undefined, serviceType: type || undefined, page, pageSize: 50 } }),
  });
  const doDelete = useServerFn(deleteServiceLog);
  const delMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      qc.invalidateQueries({ queryKey: ["service-logs", vtcId] });
    },
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Werkstatt suchen…"
            className="rounded-md border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-xs"
          />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs">
          <option value="">Alle Wartungen</option>
          {Object.entries(SERVICE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5" /> Wartung hinzufügen
        </button>
      </div>

      {showForm && <ServiceForm vtcId={vtcId} onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["service-logs", vtcId] }); }} />}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Art</th>
                <th className="px-3 py-2 text-left">Fahrzeug</th>
                <th className="px-3 py-2 text-left">Werkstatt</th>
                <th className="px-3 py-2 text-right">KM-Stand</th>
                <th className="px-3 py-2 text-right">Kosten</th>
                <th className="px-3 py-2 text-left">Verantwortlich</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.occurred_at).toLocaleDateString("de-DE")}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {SERVICE_LABELS[r.service_type]}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.vehicle_label ?? "—"}</td>
                  <td className="px-3 py-2">{r.workshop ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.odometer_km != null ? fmtKm(r.odometer_km) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEUR2(r.cost)}</td>
                  <td className="px-3 py-2">{r.responsible_name ?? "—"}</td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { if (confirm("Eintrag löschen?")) delMut.mutate(r.id); }} className="text-destructive hover:opacity-80">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="p-8 text-center text-sm text-muted-foreground">
                    Noch keine Wartungen erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={50} total={data?.total ?? 0} onChange={setPage} />
      </div>
    </div>
  );
}

/* =============================================================
 * DAMAGE TAB
 * ============================================================= */
function DamageTab({ vtcId, canManage }: { vtcId: string; canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [workStatus, setWorkStatus] = useState<string>("");
  const [insurance, setInsurance] = useState<string>("");
  const [page, setPage] = useState(0);
  const [showForm, setShowForm] = useState(false);

  const fetchList = useServerFn(listDamageLogs);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["damage-logs", vtcId, search, workStatus, insurance, page],
    queryFn: () =>
      fetchList({
        data: {
          vtcId,
          search: search || undefined,
          workStatus: workStatus || undefined,
          insuranceStatus: insurance || undefined,
          page,
          pageSize: 50,
        },
      }),
  });
  const doDelete = useServerFn(deleteDamageLog);
  const delMut = useMutation({
    mutationFn: (id: string) => doDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      qc.invalidateQueries({ queryKey: ["damage-logs", vtcId] });
    },
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Schadensart suchen…"
            className="rounded-md border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-xs"
          />
        </div>
        <select value={workStatus} onChange={(e) => setWorkStatus(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs">
          <option value="">Alle Status</option>
          {Object.entries(WORK_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={insurance} onChange={(e) => setInsurance(e.target.value)} className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs">
          <option value="">Alle Versicherungen</option>
          {Object.entries(INSURANCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-3.5" /> Schaden melden
        </button>
      </div>

      {showForm && <DamageForm vtcId={vtcId} onDone={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ["damage-logs", vtcId] }); }} />}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Datum</th>
                <th className="px-3 py-2 text-left">Fahrer</th>
                <th className="px-3 py-2 text-left">Fahrzeug</th>
                <th className="px-3 py-2 text-left">Schaden</th>
                <th className="px-3 py-2 text-right">Ausmaß</th>
                <th className="px-3 py-2 text-right">Reparatur</th>
                <th className="px-3 py-2 text-left">Versicherung</th>
                <th className="px-3 py-2 text-left">Bearbeitung</th>
                {canManage && <th className="px-3 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-2/50">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.occurred_at).toLocaleDateString("de-DE")}</td>
                  <td className="px-3 py-2">{r.driver_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.vehicle_label ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{r.damage_type}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.damage_pct != null ? `${r.damage_pct}%` : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtEUR2(r.repair_cost)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${INSURANCE_LABELS[r.insurance_status].cls}`}>
                      {INSURANCE_LABELS[r.insurance_status].label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${WORK_LABELS[r.work_status].cls}`}>
                      {WORK_LABELS[r.work_status].label}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => { if (confirm("Eintrag löschen?")) delMut.mutate(r.id); }} className="text-destructive hover:opacity-80">
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="p-8 text-center text-sm text-muted-foreground">
                    Keine Schäden erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} pageSize={50} total={data?.total ?? 0} onChange={setPage} />
      </div>
    </div>
  );
}

/* =============================================================
 * BREAKDOWN TAB (detailed cost table by category)
 * ============================================================= */
function BreakdownTab({ vtcId, range }: { vtcId: string; range: number }) {
  const fetchDash = useServerFn(getCostDashboard);
  const { data } = useQuery({
    queryKey: ["cost-dash", vtcId, range],
    queryFn: () => fetchDash({ data: { vtcId, rangeDays: range } }),
  });
  if (!data) return <div className="panel p-6 text-sm text-muted-foreground">Lade…</div>;
  const total = data.totalCost || 1;
  const rows = [
    { key: "fuel", label: "Kraftstoff", value: data.fuelCost },
    { key: "repair", label: "Reparaturen", value: data.repairCost },
    { key: "maintenance", label: "Wartung", value: data.maintenanceCost },
    { key: "tires", label: "Reifen", value: data.tiresCost },
    { key: "other", label: "Sonstige", value: data.otherCost },
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Kosten je km" value={fmtEUR2(data.costPerKm)} accent="orange" />
        <Kpi icon={TrendingUp} label="Gewinn je km" value={fmtEUR2(data.profitPerKm)} accent="emerald" />
        <Kpi icon={BarChart3} label="Kosten je Auftrag" value={fmtEUR(data.km > 0 ? data.totalCost / Math.max(1, Math.round(data.km / 100)) : 0)} accent="blue" hint="pro 100 km Segment" />
        <Kpi icon={ShieldAlert} label="Anteil Reparatur" value={`${data.totalCost > 0 ? Math.round((data.repairCost / data.totalCost) * 100) : 0}%`} accent="red" />
      </div>
      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Kostenart</th>
                <th className="px-3 py-2 text-right">Gesamt</th>
                <th className="px-3 py-2 text-right">Anteil</th>
                <th className="px-3 py-2 text-left">Verteilung</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(r.value)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{((r.value / total) * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full"
                        style={{
                          width: `${(r.value / total) * 100}%`,
                          background: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border bg-surface-2 font-semibold">
                <td className="px-3 py-2">Gesamt</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(data.totalCost)}</td>
                <td className="px-3 py-2 text-right">100%</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =============================================================
 * DRIVERS TAB
 * ============================================================= */
function DriversTab({ vtcId, range }: { vtcId: string; range: number }) {
  const fetchDrivers = useServerFn(getDriverCostBreakdown);
  const { data } = useQuery({
    queryKey: ["driver-costs", vtcId, range],
    queryFn: () => fetchDrivers({ data: { vtcId, rangeDays: range } }),
  });
  if (!data) return <div className="panel p-6 text-sm text-muted-foreground">Lade…</div>;
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Fahrer</th>
              <th className="px-3 py-2 text-right">Umsatz</th>
              <th className="px-3 py-2 text-right">Kraftstoff</th>
              <th className="px-3 py-2 text-right">Reparatur</th>
              <th className="px-3 py-2 text-right">Wartung</th>
              <th className="px-3 py-2 text-right">Verbrauch</th>
              <th className="px-3 py-2 text-right">Gewinn</th>
              <th className="px-3 py-2 text-right">Wirtschaftlichkeit</th>
              <th className="px-3 py-2 text-left">Bewertung</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d: any) => (
              <tr key={d.user_id} className="border-t border-border hover:bg-surface-2/50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {d.avatar_url ? (
                      <img src={d.avatar_url} alt="" className="size-7 rounded-full object-cover" />
                    ) : (
                      <div className="grid size-7 place-items-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">
                        {(d.display_name ?? "?").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="font-medium">{d.display_name ?? "Fahrer"}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(d.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(d.fuel)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(d.damage)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(d.maintenance + d.tires)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.consumption > 0 ? `${fmtNum(d.consumption, 1)} L/100` : "—"}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${d.profit >= 0 ? "text-emerald-400" : "text-destructive"}`}>{fmtEUR2(d.profit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{d.economy}%</td>
                <td className="px-3 py-2">
                  <div className="flex text-amber-400">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className={`size-3.5 ${i <= Math.round(d.rating) ? "fill-current" : "opacity-30"}`} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-sm text-muted-foreground">
                  Noch keine Fahrerdaten.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =============================================================
 * RANKINGS TAB
 * ============================================================= */
function RankingsTab({ vtcId, range }: { vtcId: string; range: number }) {
  const fetchDrivers = useServerFn(getDriverCostBreakdown);
  const { data } = useQuery({
    queryKey: ["driver-costs", vtcId, range],
    queryFn: () => fetchDrivers({ data: { vtcId, rangeDays: range } }),
  });
  const [key, setKey] = useState<"profit_per_km" | "consumption" | "damage" | "maintenance" | "economy">("profit_per_km");

  const ranking = useMemo(() => {
    if (!data) return [];
    const rows = [...data];
    if (key === "consumption") rows.sort((a: any, b: any) => (a.consumption || Infinity) - (b.consumption || Infinity));
    else if (key === "damage") rows.sort((a: any, b: any) => a.damage - b.damage);
    else if (key === "maintenance") rows.sort((a: any, b: any) => a.maintenance + a.tires - (b.maintenance + b.tires));
    else if (key === "economy") rows.sort((a: any, b: any) => b.economy - a.economy);
    else rows.sort((a: any, b: any) => b.profit_per_km - a.profit_per_km);
    return rows.slice(0, 20);
  }, [data, key]);

  const chartData = ranking.slice(0, 10).map((d: any) => ({
    name: (d.display_name ?? "Fahrer").slice(0, 12),
    value:
      key === "consumption"
        ? d.consumption
        : key === "damage"
          ? d.damage
          : key === "maintenance"
            ? d.maintenance + d.tires
            : key === "economy"
              ? d.economy
              : d.profit_per_km,
  }));

  const tabs: { k: typeof key; l: string }[] = [
    { k: "profit_per_km", l: "Gewinn pro km" },
    { k: "consumption", l: "Niedrigster Verbrauch" },
    { k: "damage", l: "Wenigste Schäden" },
    { k: "maintenance", l: "Niedrigste Wartungskosten" },
    { k: "economy", l: "Wirtschaftlichkeit" },
  ];

  return (
    <div className="grid gap-4">
      <div className="panel flex flex-wrap gap-1 p-1.5">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => setKey(t.k)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${key === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-surface-2"}`}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="panel p-5">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: "hsl(var(--surface-2))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Rang</th>
              <th className="px-3 py-2 text-left">Fahrer</th>
              <th className="px-3 py-2 text-right">Wert</th>
              <th className="px-3 py-2 text-right">Umsatz</th>
              <th className="px-3 py-2 text-right">Km</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((d: any, i) => (
              <tr key={d.user_id} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className={`inline-grid size-6 place-items-center rounded-full text-[10px] font-bold ${i < 3 ? "bg-amber-500/20 text-amber-400" : "bg-surface-2 text-muted-foreground"}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="px-3 py-2">{d.display_name ?? "Fahrer"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {key === "consumption"
                    ? `${fmtNum(d.consumption, 1)} L/100`
                    : key === "damage" || key === "maintenance"
                      ? fmtEUR2(key === "damage" ? d.damage : d.maintenance + d.tires)
                      : key === "economy"
                        ? `${d.economy}%`
                        : `${fmtEUR2(d.profit_per_km)} /km`}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEUR2(d.revenue)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtKm(d.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =============================================================
 * SETTINGS TAB (admin only)
 * ============================================================= */
function SettingsTab({ vtcId }: { vtcId: string }) {
  const fetch = useServerFn(getCostSettings);
  const save = useServerFn(saveCostSettings);
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ["cost-settings", vtcId],
    queryFn: () => fetch({ data: { vtcId } }),
  });
  const [form, setForm] = useState<any>(null);
  const settings = form ?? s;

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          vtcId,
          defaultFuelPrice: Number(settings.default_fuel_price),
          oilIntervalKm: Number(settings.oil_interval_km),
          tireIntervalKm: Number(settings.tire_interval_km),
          inspectionIntervalKm: Number(settings.inspection_interval_km),
          brakeIntervalKm: Number(settings.brake_interval_km),
          tuvIntervalDays: Number(settings.tuv_interval_days),
          damageRatePerPct: Number(settings.damage_rate_per_pct),
          taxRate: Number(settings.tax_rate),
          notificationsEnabled: !!settings.notifications_enabled,
          notifyOil: !!settings.notify_oil,
          notifyTires: !!settings.notify_tires,
          notifyInspection: !!settings.notify_inspection,
          notifyBrakes: !!settings.notify_brakes,
          notifyTuv: !!settings.notify_tuv,
          notifyHighConsumption: !!settings.notify_high_consumption,
          notifyHighRepair: !!settings.notify_high_repair,
        },
      }),
    onSuccess: () => {
      toast.success("Einstellungen gespeichert");
      qc.invalidateQueries({ queryKey: ["cost-settings", vtcId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  if (!settings) return <div className="panel p-6 text-sm text-muted-foreground">Lade…</div>;
  const patch = (k: string, v: any) => setForm({ ...settings, [k]: v });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-5">
        <h3 className="mb-3 text-sm font-semibold">Kraftstoffpreise & Steuern</h3>
        <div className="grid gap-3">
          <SettingInput label="Standard-Kraftstoffpreis (€/L)" step="0.001" value={settings.default_fuel_price} onChange={(v) => patch("default_fuel_price", v)} />
          <SettingInput label="Steuersatz (%)" step="0.1" value={settings.tax_rate} onChange={(v) => patch("tax_rate", v)} />
          <SettingInput label="Reparaturkosten pro % Schaden (€)" value={settings.damage_rate_per_pct} onChange={(v) => patch("damage_rate_per_pct", v)} />
        </div>
      </div>

      <div className="panel p-5">
        <h3 className="mb-3 text-sm font-semibold">Wartungsintervalle</h3>
        <div className="grid gap-3">
          <SettingInput label="Ölwechsel alle (km)" value={settings.oil_interval_km} onChange={(v) => patch("oil_interval_km", v)} />
          <SettingInput label="Reifenwechsel alle (km)" value={settings.tire_interval_km} onChange={(v) => patch("tire_interval_km", v)} />
          <SettingInput label="Inspektion alle (km)" value={settings.inspection_interval_km} onChange={(v) => patch("inspection_interval_km", v)} />
          <SettingInput label="Bremsservice alle (km)" value={settings.brake_interval_km} onChange={(v) => patch("brake_interval_km", v)} />
          <SettingInput label="HU/TÜV alle (Tage)" value={settings.tuv_interval_days} onChange={(v) => patch("tuv_interval_days", v)} />
        </div>
      </div>

      <div className="panel p-5 lg:col-span-2">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Bell className="size-4" /> Benachrichtigungen
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle label="Benachrichtigungen aktiv" checked={settings.notifications_enabled} onChange={(v) => patch("notifications_enabled", v)} />
          <Toggle label="Ölwechsel fällig" checked={settings.notify_oil} onChange={(v) => patch("notify_oil", v)} />
          <Toggle label="Reifen fällig" checked={settings.notify_tires} onChange={(v) => patch("notify_tires", v)} />
          <Toggle label="Inspektion fällig" checked={settings.notify_inspection} onChange={(v) => patch("notify_inspection", v)} />
          <Toggle label="Bremsen fällig" checked={settings.notify_brakes} onChange={(v) => patch("notify_brakes", v)} />
          <Toggle label="HU/TÜV fällig" checked={settings.notify_tuv} onChange={(v) => patch("notify_tuv", v)} />
          <Toggle label="Hoher Verbrauch" checked={settings.notify_high_consumption} onChange={(v) => patch("notify_high_consumption", v)} />
          <Toggle label="Hohe Reparaturkosten" checked={settings.notify_high_repair} onChange={(v) => patch("notify_high_repair", v)} />
        </div>
      </div>

      <div className="lg:col-span-2">
        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {mut.isPending ? "Speichern…" : "Einstellungen speichern"}
        </button>
      </div>
    </div>
  );
}

function SettingInput({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step ?? "1"}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
    </label>
  );
}

/* =============================================================
 * FORMS
 * ============================================================= */
function useDriversAndVehicles(vtcId: string) {
  const fetch = useServerFn(listVtcDriversAndVehicles);
  return useQuery({
    queryKey: ["dv", vtcId],
    queryFn: () => fetch({ data: { vtcId } }),
  });
}

function FuelForm({ vtcId, onDone }: { vtcId: string; onDone: () => void }) {
  const { data: dv } = useDriversAndVehicles(vtcId);
  const [f, setF] = useState({
    driverId: "",
    vehicleId: "",
    game: "ets2",
    liters: "",
    pricePerLiter: "1.82",
    fuelLevelPct: "",
    odometerKm: "",
    station: "",
    occurredAt: new Date().toISOString().slice(0, 16),
  });
  const save = useServerFn(upsertFuelLog);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          vtcId,
          driverId: f.driverId || undefined,
          vehicleId: f.vehicleId || undefined,
          game: f.game || undefined,
          liters: Number(f.liters),
          pricePerLiter: Number(f.pricePerLiter),
          fuelLevelPct: f.fuelLevelPct ? Number(f.fuelLevelPct) : null,
          odometerKm: f.odometerKm ? Number(f.odometerKm) : null,
          station: f.station || null,
          occurredAt: f.occurredAt,
        },
      }),
    onSuccess: () => {
      toast.success("Tankung gespeichert");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  return (
    <FormShell onSubmit={() => mut.mutate()} onCancel={onDone} loading={mut.isPending}>
      <FormRow>
        <FormField label="Fahrer"><select value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })} className="input">
          <option value="">Ich selbst</option>
          {(dv?.drivers ?? []).map((d) => <option key={d.user_id} value={d.user_id}>{d.display_name}</option>)}
        </select></FormField>
        <FormField label="Fahrzeug"><select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} className="input">
          <option value="">—</option>
          {(dv?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select></FormField>
        <FormField label="Spiel"><select value={f.game} onChange={(e) => setF({ ...f, game: e.target.value })} className="input">
          <option value="ets2">ETS2</option><option value="ats">ATS</option>
        </select></FormField>
      </FormRow>
      <FormRow>
        <FormField label="Liter" required><input type="number" step="0.1" required value={f.liters} onChange={(e) => setF({ ...f, liters: e.target.value })} className="input" /></FormField>
        <FormField label="Preis / Liter (€)" required><input type="number" step="0.001" required value={f.pricePerLiter} onChange={(e) => setF({ ...f, pricePerLiter: e.target.value })} className="input" /></FormField>
        <FormField label="Füllstand (%)"><input type="number" step="1" value={f.fuelLevelPct} onChange={(e) => setF({ ...f, fuelLevelPct: e.target.value })} className="input" /></FormField>
      </FormRow>
      <FormRow>
        <FormField label="KM-Stand"><input type="number" value={f.odometerKm} onChange={(e) => setF({ ...f, odometerKm: e.target.value })} className="input" /></FormField>
        <FormField label="Tankstelle"><input value={f.station} onChange={(e) => setF({ ...f, station: e.target.value })} className="input" /></FormField>
        <FormField label="Datum / Uhrzeit"><input type="datetime-local" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} className="input" /></FormField>
      </FormRow>
    </FormShell>
  );
}

function ServiceForm({ vtcId, onDone }: { vtcId: string; onDone: () => void }) {
  const { data: dv } = useDriversAndVehicles(vtcId);
  const [f, setF] = useState({
    vehicleId: "",
    serviceType: "oil" as ServiceLog["service_type"],
    workshop: "",
    cost: "",
    odometerKm: "",
    responsibleId: "",
    notes: "",
    occurredAt: new Date().toISOString().slice(0, 16),
  });
  const save = useServerFn(upsertServiceLog);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          vtcId,
          vehicleId: f.vehicleId || undefined,
          serviceType: f.serviceType,
          workshop: f.workshop || null,
          cost: Number(f.cost || 0),
          odometerKm: f.odometerKm ? Number(f.odometerKm) : null,
          responsibleId: f.responsibleId || undefined,
          notes: f.notes || null,
          occurredAt: f.occurredAt,
        },
      }),
    onSuccess: () => {
      toast.success("Wartung gespeichert");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  return (
    <FormShell onSubmit={() => mut.mutate()} onCancel={onDone} loading={mut.isPending}>
      <FormRow>
        <FormField label="Art" required>
          <select value={f.serviceType} onChange={(e) => setF({ ...f, serviceType: e.target.value as any })} className="input">
            {Object.entries(SERVICE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </FormField>
        <FormField label="Fahrzeug"><select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} className="input">
          <option value="">—</option>
          {(dv?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select></FormField>
        <FormField label="Werkstatt"><input value={f.workshop} onChange={(e) => setF({ ...f, workshop: e.target.value })} className="input" /></FormField>
      </FormRow>
      <FormRow>
        <FormField label="Kosten (€)"><input type="number" step="0.01" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} className="input" /></FormField>
        <FormField label="KM-Stand"><input type="number" value={f.odometerKm} onChange={(e) => setF({ ...f, odometerKm: e.target.value })} className="input" /></FormField>
        <FormField label="Verantwortlich">
          <select value={f.responsibleId} onChange={(e) => setF({ ...f, responsibleId: e.target.value })} className="input">
            <option value="">Ich selbst</option>
            {(dv?.drivers ?? []).map((d) => <option key={d.user_id} value={d.user_id}>{d.display_name}</option>)}
          </select>
        </FormField>
      </FormRow>
      <FormRow>
        <FormField label="Datum / Uhrzeit"><input type="datetime-local" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} className="input" /></FormField>
        <div className="md:col-span-2"><FormField label="Notizen"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="input" /></FormField></div>
      </FormRow>
    </FormShell>
  );
}

function DamageForm({ vtcId, onDone }: { vtcId: string; onDone: () => void }) {
  const { data: dv } = useDriversAndVehicles(vtcId);
  const [f, setF] = useState({
    vehicleId: "",
    driverId: "",
    damageType: "",
    damagePct: "",
    repairCost: "",
    cause: "",
    screenshotUrl: "",
    insuranceStatus: "none" as DamageLog["insurance_status"],
    workStatus: "open" as DamageLog["work_status"],
    notes: "",
    occurredAt: new Date().toISOString().slice(0, 16),
  });
  const save = useServerFn(upsertDamageLog);
  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          vtcId,
          vehicleId: f.vehicleId || undefined,
          driverId: f.driverId || undefined,
          damageType: f.damageType,
          damagePct: f.damagePct ? Number(f.damagePct) : null,
          repairCost: Number(f.repairCost || 0),
          cause: f.cause || null,
          screenshotUrl: f.screenshotUrl || null,
          insuranceStatus: f.insuranceStatus,
          workStatus: f.workStatus,
          notes: f.notes || null,
          occurredAt: f.occurredAt,
        },
      }),
    onSuccess: () => {
      toast.success("Schaden gespeichert");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  return (
    <FormShell onSubmit={() => mut.mutate()} onCancel={onDone} loading={mut.isPending}>
      <FormRow>
        <FormField label="Schadensart" required><input required value={f.damageType} onChange={(e) => setF({ ...f, damageType: e.target.value })} placeholder="z. B. Motorschaden" className="input" /></FormField>
        <FormField label="Ausmaß (%)"><input type="number" step="0.1" value={f.damagePct} onChange={(e) => setF({ ...f, damagePct: e.target.value })} className="input" /></FormField>
        <FormField label="Reparaturkosten (€)"><input type="number" step="0.01" value={f.repairCost} onChange={(e) => setF({ ...f, repairCost: e.target.value })} className="input" /></FormField>
      </FormRow>
      <FormRow>
        <FormField label="Fahrzeug"><select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })} className="input">
          <option value="">—</option>
          {(dv?.vehicles ?? []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select></FormField>
        <FormField label="Verursacher">
          <select value={f.driverId} onChange={(e) => setF({ ...f, driverId: e.target.value })} className="input">
            <option value="">Ich selbst</option>
            {(dv?.drivers ?? []).map((d) => <option key={d.user_id} value={d.user_id}>{d.display_name}</option>)}
          </select>
        </FormField>
        <FormField label="Ursache"><input value={f.cause} onChange={(e) => setF({ ...f, cause: e.target.value })} className="input" /></FormField>
      </FormRow>
      <FormRow>
        <FormField label="Versicherungsstatus">
          <select value={f.insuranceStatus} onChange={(e) => setF({ ...f, insuranceStatus: e.target.value as any })} className="input">
            {Object.entries(INSURANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </FormField>
        <FormField label="Bearbeitungsstatus">
          <select value={f.workStatus} onChange={(e) => setF({ ...f, workStatus: e.target.value as any })} className="input">
            {Object.entries(WORK_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </FormField>
        <FormField label="Datum / Uhrzeit"><input type="datetime-local" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} className="input" /></FormField>
      </FormRow>
      <FormRow>
        <FormField label="Screenshot-URL"><input value={f.screenshotUrl} onChange={(e) => setF({ ...f, screenshotUrl: e.target.value })} placeholder="https://…" className="input" /></FormField>
        <div className="md:col-span-2"><FormField label="Notizen"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="input" /></FormField></div>
      </FormRow>
    </FormShell>
  );
}

function FormShell({ children, onSubmit, onCancel, loading }: { children: React.ReactNode; onSubmit: () => void; onCancel: () => void; loading?: boolean }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="panel mb-4 grid gap-3 p-5"
    >
      {children}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md hover:opacity-90 disabled:opacity-60">
          {loading ? "Speichern…" : "Speichern"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm hover:bg-muted">Abbrechen</button>
      </div>
      <style>{`.input { width: 100%; border-radius: 0.5rem; border: 1px solid hsl(var(--border)); background: hsl(var(--surface-2)); padding: 0.5rem 0.75rem; font-size: 0.875rem; }`}</style>
    </form>
  );
}

function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-3">{children}</div>;
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
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

function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between border-t border-border p-3 text-xs text-muted-foreground">
      <span>
        Seite {page + 1} / {pages} · {total} Einträge
      </span>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="rounded-md border border-border bg-surface-2 px-3 py-1 hover:bg-muted disabled:opacity-40"
        >
          Zurück
        </button>
        <button
          onClick={() => onChange(Math.min(pages - 1, page + 1))}
          disabled={page + 1 >= pages}
          className="rounded-md border border-border bg-surface-2 px-3 py-1 hover:bg-muted disabled:opacity-40"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
