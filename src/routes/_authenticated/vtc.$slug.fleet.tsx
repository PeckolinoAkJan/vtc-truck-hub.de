import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Car,
  Plus,
  Search,
  LayoutGrid,
  List,
  Wrench,
  Users,
  Fuel,
  Gauge,
  MapPin,
  X,
  UserPlus,
  UserMinus,
  Trash2,
  AlertTriangle,
  History as HistoryIcon,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import {
  listFleet,
  getFleetKpis,
  getVehicle,
  createVehicle,
  updateVehicle,
  assignDriver,
  deleteVehicle,
  addHistoryNote,
  listVtcDrivers,
} from "@/lib/fleet.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/fleet")({
  component: FleetPage,
});

type Status = "" | "idle" | "assigned" | "driving" | "maintenance" | "retired";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  idle: { label: "Frei", cls: "bg-emerald-500/15 text-emerald-400" },
  assigned: { label: "Zugewiesen", cls: "bg-sky-500/15 text-sky-400" },
  driving: { label: "Unterwegs", cls: "bg-primary/15 text-primary" },
  maintenance: { label: "In Wartung", cls: "bg-amber-500/15 text-amber-400" },
  retired: { label: "Außer Betrieb", cls: "bg-red-500/15 text-red-400" },
};

function FleetPage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;

  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("");
  const [brand, setBrand] = useState("");
  const [game, setGame] = useState<"" | "ets2" | "ats">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchList = useServerFn(listFleet);
  const fetchKpis = useServerFn(getFleetKpis);

  const kpis = useQuery({
    queryKey: ["fleet-kpis", vtcId],
    queryFn: () => fetchKpis({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  const list = useQuery({
    queryKey: ["fleet-list", vtcId, search, status, brand, game],
    queryFn: () =>
      fetchList({
        data: {
          vtcId: vtcId!,
          search: search || undefined,
          status: status || undefined,
          brand: brand || undefined,
          game: (game || undefined) as any,
        },
      }),
    enabled: !!vtcId,
  });

  const brands = useMemo(() => {
    const s = new Set<string>();
    (list.data ?? []).forEach((v: any) => v.brand && s.add(v.brand));
    return Array.from(s).sort();
  }, [list.data]);

  const canManage =
    ctx && ["owner", "admin", "dispatcher"].includes((ctx as any).role ?? "");

  return (
    <div>
      <PageHeader title="Fuhrpark" subtitle="Alle Fahrzeuge deiner Spedition." icon={Car}>
        {canManage && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90"
          >
            <Plus className="size-4" /> Fahrzeug hinzufügen
          </button>
        )}
      </PageHeader>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon={Car} label="Gesamt" value={kpis.data?.total ?? 0} tone="primary" />
        <KpiCard icon={Gauge} label="Frei" value={kpis.data?.idle ?? 0} tone="emerald" />
        <KpiCard
          icon={Users}
          label="Zugewiesen"
          value={(kpis.data?.assigned ?? 0) + (kpis.data?.driving ?? 0)}
          tone="sky"
        />
        <KpiCard icon={Wrench} label="Wartung" value={kpis.data?.maintenance ?? 0} tone="amber" />
        <KpiCard
          icon={AlertTriangle}
          label="Außer Betrieb"
          value={kpis.data?.retired ?? 0}
          tone="red"
        />
      </div>

      {/* Filter bar */}
      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche nach Name, Kennzeichen, Modell…"
            className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="">Alle Hersteller</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="">Alle Status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <select
          value={game}
          onChange={(e) => setGame(e.target.value as any)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
        >
          <option value="">Alle Spiele</option>
          <option value="ets2">ETS2</option>
          <option value="ats">ATS</option>
        </select>
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            onClick={() => setView("grid")}
            className={`px-3 py-2 ${view === "grid" ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"}`}
            aria-label="Kartenansicht"
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-3 py-2 ${view === "list" ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"}`}
            aria-label="Listenansicht"
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {list.isLoading ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">Wird geladen…</div>
      ) : (list.data ?? []).length === 0 ? (
        <div className="panel p-12 text-center">
          <Car className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Keine Fahrzeuge gefunden. Passe die Filter an oder lege ein neues Fahrzeug an.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.data!.map((v: any) => (
            <VehicleCard key={v.id} v={v} onOpen={() => setSelectedId(v.id)} />
          ))}
        </div>
      ) : (
        <VehicleTable rows={list.data!} onOpen={(id) => setSelectedId(id)} />
      )}

      {selectedId && (
        <VehicleDrawer
          vehicleId={selectedId}
          onClose={() => setSelectedId(null)}
          canManage={!!canManage}
          vtcId={vtcId!}
        />
      )}

      {showCreate && vtcId && (
        <CreateVehicleModal vtcId={vtcId} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "primary" | "emerald" | "sky" | "amber" | "red";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    emerald: "bg-emerald-500/15 text-emerald-400",
    sky: "bg-sky-500/15 text-sky-400",
    amber: "bg-amber-500/15 text-amber-400",
    red: "bg-red-500/15 text-red-400",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-3">
        <div className={`grid size-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-xl font-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function VehicleCard({ v, onOpen }: { v: any; onOpen: () => void }) {
  const s = STATUS_LABELS[v.status] ?? { label: v.status, cls: "bg-muted text-muted-foreground" };
  return (
    <button
      onClick={onOpen}
      className="panel group overflow-hidden p-0 text-left transition hover:border-primary/40"
    >
      <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-surface-2 to-surface">
        {v.details?.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.details.image_url} alt={v.name} className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Car className="size-10" />
          </div>
        )}
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}
        >
          {s.label}
        </span>
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-base font-semibold">{v.name}</div>
          {v.details?.game && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              {v.details.game}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">
          {[v.brand, v.model].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="size-3.5" />{" "}
            {v.details?.odometer_km ? `${Number(v.details.odometer_km).toLocaleString("de-DE")} km` : "—"}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="size-3.5" /> {v.driver?.display_name ?? "Frei"}
          </div>
        </div>
      </div>
    </button>
  );
}

function VehicleTable({ rows, onOpen }: { rows: any[]; onOpen: (id: string) => void }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Fahrzeug</th>
            <th className="px-4 py-3">Kennzeichen</th>
            <th className="px-4 py-3">Fahrer</th>
            <th className="px-4 py-3">Spiel</th>
            <th className="px-4 py-3">Km</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const s =
              STATUS_LABELS[v.status] ?? { label: v.status, cls: "bg-muted text-muted-foreground" };
            return (
              <tr
                key={v.id}
                onClick={() => onOpen(v.id)}
                className="cursor-pointer border-b border-border/50 hover:bg-surface-2"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{v.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[v.brand, v.model].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{v.plate ?? "—"}</td>
                <td className="px-4 py-3">{v.driver?.display_name ?? "—"}</td>
                <td className="px-4 py-3 uppercase text-xs">{v.details?.game ?? "—"}</td>
                <td className="px-4 py-3">
                  {v.details?.odometer_km
                    ? `${Number(v.details.odometer_km).toLocaleString("de-DE")}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${s.cls}`}
                  >
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============= Detail Drawer =============
function VehicleDrawer({
  vehicleId,
  onClose,
  canManage,
  vtcId,
}: {
  vehicleId: string;
  onClose: () => void;
  canManage: boolean;
  vtcId: string;
}) {
  const qc = useQueryClient();
  const fetchVehicle = useServerFn(getVehicle);
  const { data, isLoading } = useQuery({
    queryKey: ["vehicle", vehicleId],
    queryFn: () => fetchVehicle({ data: { vehicleId } }),
  });
  const [tab, setTab] = useState<
    "overview" | "history" | "maintenance" | "damage" | "documents"
  >("overview");
  const [showAssign, setShowAssign] = useState(false);

  const assignFn = useServerFn(assignDriver);
  const release = useMutation({
    mutationFn: () => assignFn({ data: { vehicleId, driverId: null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      qc.invalidateQueries({ queryKey: ["fleet-list"] });
      qc.invalidateQueries({ queryKey: ["fleet-kpis"] });
    },
  });

  const delFn = useServerFn(deleteVehicle);
  const del = useMutation({
    mutationFn: () => delFn({ data: { vehicleId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-list"] });
      qc.invalidateQueries({ queryKey: ["fleet-kpis"] });
      onClose();
    },
  });

  const updateFn = useServerFn(updateVehicle);
  const setStatus = useMutation({
    mutationFn: (status: string) =>
      updateFn({ data: { vehicleId, base: { status } } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      qc.invalidateQueries({ queryKey: ["fleet-list"] });
      qc.invalidateQueries({ queryKey: ["fleet-kpis"] });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-surface shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/95 px-5 py-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onClose}
              className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
            >
              <ChevronLeft className="size-4" />
            </button>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">
                {isLoading ? "…" : data?.vehicle?.name}
              </div>
              {data?.vehicle?.plate && (
                <div className="font-mono text-xs text-muted-foreground">{data.vehicle.plate}</div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>

        {isLoading || !data ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Wird geladen…</div>
        ) : (
          <>
            <div className="border-b border-border p-5">
              {data.details?.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={data.details.image_url}
                  alt={data.vehicle.name}
                  className="h-40 w-full rounded-xl object-cover"
                />
              ) : (
                <div className="grid h-40 w-full place-items-center rounded-xl bg-surface-2 text-muted-foreground">
                  <Car className="size-12" />
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {canManage && (
                  <>
                    <button
                      onClick={() => setShowAssign(true)}
                      className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      <UserPlus className="size-3.5" /> Zuweisen
                    </button>
                    {data.vehicle.current_driver_id && (
                      <button
                        onClick={() => release.mutate()}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface"
                      >
                        <UserMinus className="size-3.5" /> Freigeben
                      </button>
                    )}
                    <button
                      onClick={() =>
                        setStatus.mutate(
                          data.vehicle.status === "maintenance" ? "idle" : "maintenance",
                        )
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/20"
                    >
                      <Wrench className="size-3.5" />{" "}
                      {data.vehicle.status === "maintenance" ? "Wartung beenden" : "In Wartung"}
                    </button>
                    <button
                      onClick={() =>
                        setStatus.mutate(data.vehicle.status === "retired" ? "idle" : "retired")
                      }
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs hover:bg-surface"
                    >
                      {data.vehicle.status === "retired" ? "Reaktivieren" : "Stilllegen"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Fahrzeug "${data.vehicle.name}" wirklich löschen?`))
                          del.mutate();
                      }}
                      className="ml-auto flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="size-3.5" /> Löschen
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border px-5 pt-2">
              {(
                [
                  ["overview", "Übersicht"],
                  ["history", "Historie"],
                  ["maintenance", "Wartung"],
                  ["damage", "Zustand"],
                  ["documents", "Dokumente"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`border-b-2 px-3 py-2 text-sm ${
                    tab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {tab === "overview" && <OverviewTab d={data} />}
              {tab === "history" && <HistoryTab d={data} />}
              {tab === "maintenance" && <MaintenanceTab d={data} />}
              {tab === "damage" && <ConditionTab d={data} />}
              {tab === "documents" && <DocumentsTab d={data} />}
            </div>
          </>
        )}

        {showAssign && data && (
          <AssignModal
            vtcId={vtcId}
            vehicleId={vehicleId}
            currentDriverId={data.vehicle.current_driver_id}
            onClose={() => setShowAssign(false)}
          />
        )}
      </div>
    </div>
  );
}

function OverviewTab({ d }: { d: any }) {
  const fields = [
    ["Hersteller", d.vehicle.brand],
    ["Modell", d.vehicle.model],
    ["Baujahr", d.details?.year],
    ["Farbe", d.details?.color],
    ["Motor", d.details?.engine_hp ? `${d.details.engine_hp} PS` : null],
    ["Getriebe", d.details?.gearbox],
    ["Tank", d.details?.fuel_tank_l ? `${d.details.fuel_tank_l} L` : null],
    ["Standort", d.details?.location],
    ["Spiel", d.details?.game?.toUpperCase()],
    ["Kilometerstand", d.details?.odometer_km ? `${Number(d.details.odometer_km).toLocaleString("de-DE")} km` : null],
    ["DLC", (d.details?.dlc ?? []).join(", ")],
  ].filter(([, v]) => v);
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-surface-2 p-4">
        {fields.map(([k, v]) => (
          <div key={k as string}>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="mt-0.5 text-sm font-medium">{v}</div>
          </div>
        ))}
      </div>
      {d.driver && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-4">
          <div className="grid size-10 place-items-center rounded-full bg-primary/15 text-primary">
            <Users className="size-5" />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Aktueller Fahrer
            </div>
            <div className="text-sm font-medium">{d.driver.display_name}</div>
          </div>
        </div>
      )}
      {d.details?.notes && (
        <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4 text-sm">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Bemerkungen
          </div>
          {d.details.notes}
        </div>
      )}
    </div>
  );
}

function HistoryTab({ d }: { d: any }) {
  if (!d.history?.length)
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">
        <HistoryIcon className="mx-auto mb-2 size-6" />
        Noch keine Ereignisse.
      </div>
    );
  return (
    <ol className="relative ml-3 border-l border-border pl-6">
      {d.history.map((h: any) => (
        <li key={h.id} className="mb-4">
          <div className="absolute -ml-[29px] mt-1 size-2.5 rounded-full bg-primary" />
          <div className="text-xs text-muted-foreground">
            {new Date(h.created_at).toLocaleString("de-DE")}
          </div>
          <div className="text-sm">
            <span className="mr-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              {h.event_type}
            </span>
            {h.description}
            {h.cost != null && (
              <span className="ml-2 text-muted-foreground">({Number(h.cost).toFixed(2)} €)</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MaintenanceTab({ d }: { d: any }) {
  const KIND_LABELS: Record<string, string> = {
    oil: "Ölwechsel",
    inspection: "Inspektion",
    brakes: "Bremsen",
    tires: "Reifen",
    tuv: "HU / TÜV",
    ac: "Klimaanlage",
    other: "Sonstiges",
  };
  const items = d.maintenance ?? [];
  return items.length === 0 ? (
    <div className="rounded-xl border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">
      <Wrench className="mx-auto mb-2 size-6" />
      Noch keine Wartungsintervalle hinterlegt.
    </div>
  ) : (
    <div className="space-y-2">
      {items.map((m: any) => {
        const dueSoon =
          m.next_due_at && new Date(m.next_due_at).getTime() - Date.now() < 14 * 86400000;
        return (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4"
          >
            <div>
              <div className="text-sm font-medium">{KIND_LABELS[m.kind] ?? m.kind}</div>
              <div className="text-xs text-muted-foreground">
                {m.next_due_km ? `in ${Number(m.next_due_km).toLocaleString("de-DE")} km` : ""}
                {m.next_due_at &&
                  ` · ${new Date(m.next_due_at).toLocaleDateString("de-DE")}`}
              </div>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                dueSoon ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {dueSoon ? "Bald fällig" : "OK"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConditionTab({ d }: { d: any }) {
  const c = d.condition ?? {};
  const parts = [
    ["Motor", c.engine_pct],
    ["Getriebe", c.gearbox_pct],
    ["Bremsen", c.brakes_pct],
    ["Reifen", c.tires_pct],
    ["Fahrwerk", c.chassis_pct],
    ["Karosserie", c.body_pct],
  ] as const;
  return (
    <div className="space-y-2">
      {parts.map(([label, val]) => {
        const v = Number(val ?? 100);
        const tone =
          v > 75 ? "bg-emerald-400" : v > 40 ? "bg-amber-400" : "bg-red-400";
        return (
          <div key={label} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{label}</span>
              <span className="font-medium">{v.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface">
              <div className={`h-full ${tone}`} style={{ width: `${v}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentsTab({ d }: { d: any }) {
  if (!d.documents?.length)
    return (
      <div className="rounded-xl border border-border bg-surface-2 p-6 text-center text-sm text-muted-foreground">
        <FileText className="mx-auto mb-2 size-6" />
        Keine Dokumente hinterlegt.
      </div>
    );
  return (
    <ul className="space-y-2">
      {d.documents.map((doc: any) => (
        <li
          key={doc.id}
          className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3"
        >
          <div className="flex items-center gap-3">
            <FileText className="size-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">{doc.title}</div>
              <div className="text-xs text-muted-foreground">
                {doc.doc_type} · v{doc.version}
              </div>
            </div>
          </div>
          {doc.valid_until && (
            <span className="text-xs text-muted-foreground">
              gültig bis {new Date(doc.valid_until).toLocaleDateString("de-DE")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ============= Assign Modal =============
function AssignModal({
  vtcId,
  vehicleId,
  currentDriverId,
  onClose,
}: {
  vtcId: string;
  vehicleId: string;
  currentDriverId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchDrivers = useServerFn(listVtcDrivers);
  const { data } = useQuery({
    queryKey: ["vtc-drivers", vtcId],
    queryFn: () => fetchDrivers({ data: { vtcId } }),
  });
  const assignFn = useServerFn(assignDriver);
  const mut = useMutation({
    mutationFn: (driverId: string) => assignFn({ data: { vehicleId, driverId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicle", vehicleId] });
      qc.invalidateQueries({ queryKey: ["fleet-list"] });
      qc.invalidateQueries({ queryKey: ["fleet-kpis"] });
      onClose();
    },
  });
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Fahrer zuweisen</h3>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {(data ?? []).map((u: any) => (
            <li key={u.user_id}>
              <button
                disabled={mut.isPending || u.user_id === currentDriverId}
                onClick={() => mut.mutate(u.user_id)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm hover:border-primary/40 disabled:opacity-50"
              >
                <span>
                  <span className="font-medium">{u.display_name}</span>{" "}
                  <span className="text-xs text-muted-foreground">· {u.role}</span>
                </span>
                {u.user_id === currentDriverId && (
                  <span className="text-xs text-primary">Aktuell</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============= Create Modal =============
function CreateVehicleModal({ vtcId, onClose }: { vtcId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    brand: "",
    model: "",
    plate: "",
    year: "",
    color: "",
    engine_hp: "",
    gearbox: "",
    fuel_tank_l: "",
    location: "",
    game: "",
    notes: "",
    image_url: "",
  });
  const set = (k: keyof typeof form) => (e: any) =>
    setForm({ ...form, [k]: e.target.value });

  const create = useServerFn(createVehicle);
  const mut = useMutation({
    mutationFn: () =>
      create({
        data: {
          vtcId,
          name: form.name.trim(),
          brand: form.brand || null,
          model: form.model || null,
          plate: form.plate || null,
          year: form.year ? Number(form.year) : null,
          color: form.color || null,
          engine_hp: form.engine_hp ? Number(form.engine_hp) : null,
          gearbox: form.gearbox || null,
          fuel_tank_l: form.fuel_tank_l ? Number(form.fuel_tank_l) : null,
          location: form.location || null,
          game: (form.game || null) as any,
          notes: form.notes || null,
          image_url: form.image_url || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fleet-list"] });
      qc.invalidateQueries({ queryKey: ["fleet-kpis"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim()) mut.mutate();
        }}
        className="w-full max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Neues Fahrzeug hinzufügen</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name*" value={form.name} onChange={set("name")} required />
          <Input label="Kennzeichen" value={form.plate} onChange={set("plate")} />
          <Input label="Hersteller" value={form.brand} onChange={set("brand")} />
          <Input label="Modell" value={form.model} onChange={set("model")} />
          <Input label="Baujahr" type="number" value={form.year} onChange={set("year")} />
          <Input label="Farbe" value={form.color} onChange={set("color")} />
          <Input label="Motorleistung (PS)" type="number" value={form.engine_hp} onChange={set("engine_hp")} />
          <Input label="Getriebe" value={form.gearbox} onChange={set("gearbox")} />
          <Input
            label="Kraftstofftank (L)"
            type="number"
            value={form.fuel_tank_l}
            onChange={set("fuel_tank_l")}
          />
          <Input label="Standort" value={form.location} onChange={set("location")} />
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Spiel
            </label>
            <select
              value={form.game}
              onChange={set("game")}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="ets2">ETS2</option>
              <option value="ats">ATS</option>
            </select>
          </div>
          <Input label="Bild-URL" value={form.image_url} onChange={set("image_url")} />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
            Bemerkungen
          </label>
          <textarea
            value={form.notes}
            onChange={set("notes")}
            rows={3}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm"
          />
        </div>
        {mut.isError && (
          <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
            Fehler: {(mut.error as Error).message}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm hover:bg-surface"
          >
            Abbrechen
          </button>
          <button
            disabled={mut.isPending || !form.name.trim()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </form>
    </div>
  );
}

function Input({
  label,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <input
        {...rest}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </div>
  );
}
