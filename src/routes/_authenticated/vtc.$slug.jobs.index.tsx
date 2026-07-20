import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Plus,
  Trash2,
  Search,
  Filter as FilterIcon,
  RotateCcw,
  Eye,
  Download,
  Zap,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Truck,
  CheckCircle2,
  Route as RouteIcon,
  Euro,
  TrendingUp,
  X,
} from "lucide-react";
import { getVtcContext } from "@/lib/vtcs.functions";
import { listJobsPaged, getJobsKpis, deleteJob } from "@/lib/jobs.functions";
import { StatusPill } from "@/components/StatusPill";
import { currency, km, dt } from "@/lib/format";

const statusValues = [
  "all",
  "in_progress",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;
type StatusKey = (typeof statusValues)[number];

const searchSchema = z.object({
  status: z.enum(statusValues).catch("all").default("all"),
  q: z.string().catch("").default(""),
  game: z.enum(["all", "ets2", "ats", "other"]).catch("all").default("all"),
  driver: z.string().catch("").default(""),
  from: z.string().catch("").default(""),
  to: z.string().catch("").default(""),
  page: z.number().catch(1).default(1),
  pageSize: z.number().catch(25).default(25),
  sort: z
    .enum([
      "submitted_at_desc",
      "submitted_at_asc",
      "distance_desc",
      "distance_asc",
      "revenue_desc",
      "revenue_asc",
    ])
    .catch("submitted_at_desc")
    .default("submitted_at_desc"),
  sel: z.string().catch("").default(""),
});

export const Route = createFileRoute("/_authenticated/vtc/$slug/jobs/")({
  validateSearch: searchSchema,
  component: JobsList,
});

const statusLabel: Record<StatusKey, string> = {
  all: "Alle Aufträge",
  in_progress: "Unterwegs",
  submitted: "Offen",
  approved: "Abgeschlossen",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
};

function shortId(id: string) {
  return id.slice(0, 4).toUpperCase();
}

function JobsList() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounced search input
  const [rawSearch, setRawSearch] = useState(search.q);
  useEffect(() => setRawSearch(search.q), [search.q]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (val: string) => {
    setRawSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      navigate({ to: ".", search: (p: z.infer<typeof searchSchema>) => ({ ...p, q: val, page: 1 }) });
    }, 350);
  };

  const setSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ to: ".", search: (p: z.infer<typeof searchSchema>) => ({ ...p, ...patch }) });
  };

  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const role = ctx?.role;
  const canDelete = role === "owner" || role === "admin";
  const canReview = role === "owner" || role === "admin" || role === "dispatcher";

  const fetchKpis = useServerFn(getJobsKpis);
  const { data: kpis } = useQuery({
    queryKey: ["jobs-kpis", vtcId],
    queryFn: () => fetchKpis({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  const fetchPaged = useServerFn(listJobsPaged);
  const { data: paged, isLoading } = useQuery({
    queryKey: [
      "jobs-paged",
      vtcId,
      search.status,
      search.q,
      search.game,
      search.driver,
      search.from,
      search.to,
      search.sort,
      search.page,
      search.pageSize,
    ],
    queryFn: () =>
      fetchPaged({
        data: {
          vtcId: vtcId!,
          status: search.status === "all" ? undefined : search.status,
          game: search.game === "all" ? undefined : search.game,
          driverId: search.driver || undefined,
          search: search.q || undefined,
          from: search.from ? new Date(search.from).toISOString() : undefined,
          to: search.to ? new Date(search.to).toISOString() : undefined,
          sort: search.sort,
          page: search.page,
          pageSize: search.pageSize,
        },
      }),
    enabled: !!vtcId,
  });

  const rows = paged?.rows ?? [];
  const total = paged?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / search.pageSize));
  const selected = useMemo(
    () => rows.find((r) => r.id === search.sel) ?? rows[0] ?? null,
    [rows, search.sel],
  );

  const removeJob = useServerFn(deleteJob);
  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => removeJob({ data: { jobId } }),
    onMutate: (jobId) => {
      setDeletingId(jobId);
      setError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs-paged", vtcId] });
      queryClient.invalidateQueries({ queryKey: ["jobs-kpis", vtcId] });
      queryClient.invalidateQueries({ queryKey: ["global-stats"] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Fehler beim Löschen"),
    onSettled: () => setDeletingId(null),
  });

  const handleDelete = (jobId: string) => {
    const ok = window.confirm(
      "Möchtest du diesen Auftrag wirklich löschen? Diese Aktion korrigiert Statistiken und kann nicht rückgängig gemacht werden.",
    );
    if (ok) deleteMutation.mutate(jobId);
  };

  const exportCsv = () => {
    if (rows.length === 0) return;
    const header = [
      "id",
      "status",
      "game",
      "cargo",
      "source_city",
      "dest_city",
      "driver",
      "distance_km",
      "revenue",
      "fuel_cost",
      "submitted_at",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.id,
        r.status,
        r.game,
        r.cargo,
        r.source_city,
        r.dest_city,
        r.driver.display_name,
        r.distance_km,
        r.revenue,
        r.fuel_cost,
        r.submitted_at,
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auftraege-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () =>
    navigate({
      to: ".",
      search: {
        status: "all",
        q: "",
        game: "all",
        driver: "",
        from: "",
        to: "",
        page: 1,
        pageSize: search.pageSize,
        sort: "submitted_at_desc",
        sel: "",
      },
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Auftragsübersicht</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Verwalte alle Aufträge deiner VTC
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSearch({ status: "in_progress", page: 1 })}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2"
            >
              <Zap className="size-4" /> Smart Resume
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={rows.length === 0}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              <Download className="size-4" /> Export
            </button>
            {canReview && (
              <Link
                to="/vtc/$slug/jobs/new"
                params={{ slug }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Plus className="size-4" /> Neuer Auftrag
              </Link>
            )}
          </div>
        </header>

        {/* KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            label="Alle Aufträge"
            value={String(kpis?.counts.all ?? 0)}
            sub="Gesamt"
            icon={<ClipboardList className="size-5" />}
          />
          <KpiCard
            label="Aktive Aufträge"
            value={String(kpis?.counts.in_progress ?? 0)}
            sub="Unterwegs"
            icon={<Truck className="size-5" />}
          />
          <KpiCard
            label="Abgeschlossen"
            value={String(kpis?.totals.completed ?? 0)}
            sub="Insgesamt"
            icon={<CheckCircle2 className="size-5" />}
          />
          <KpiCard
            label="Gesamt-Kilometer"
            value={km(kpis?.totals.km ?? 0)}
            sub="Alle Aufträge"
            icon={<RouteIcon className="size-5" />}
          />
          <KpiCard
            label="Gesamt-Umsatz"
            value={currency(kpis?.totals.revenue ?? 0)}
            sub="Alle Aufträge"
            icon={<Euro className="size-5" />}
          />
          <KpiCard
            label="Gesamt-Gewinn"
            value={currency(kpis?.totals.profit ?? 0)}
            sub="Umsatz − Kraftstoff"
            icon={<TrendingUp className="size-5" />}
          />
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {statusValues.map((s) => {
            const active = search.status === s;
            const count = kpis?.counts[s] ?? 0;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSearch({ status: s, page: 1, sel: "" })}
                className={`relative -mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {statusLabel[s]}
                {kpis && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      active ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter bar */}
        <div className="panel flex flex-wrap items-center gap-2 p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={rawSearch}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Aufträge suchen (Fracht, Ort, Fahrzeug)…"
              className="w-full rounded-md border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={search.game}
            onChange={(e) =>
              setSearch({ game: e.target.value as z.infer<typeof searchSchema>["game"], page: 1 })
            }
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="all">Alle Spiele</option>
            <option value="ets2">ETS2</option>
            <option value="ats">ATS</option>
            <option value="other">Sonstige</option>
          </select>
          <select
            value={search.sort}
            onChange={(e) =>
              setSearch({ sort: e.target.value as z.infer<typeof searchSchema>["sort"], page: 1 })
            }
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="submitted_at_desc">Neueste zuerst</option>
            <option value="submitted_at_asc">Älteste zuerst</option>
            <option value="distance_desc">Distanz ↓</option>
            <option value="distance_asc">Distanz ↑</option>
            <option value="revenue_desc">Umsatz ↓</option>
            <option value="revenue_asc">Umsatz ↑</option>
          </select>
          <input
            type="date"
            value={search.from}
            onChange={(e) => setSearch({ from: e.target.value, page: 1 })}
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={search.to}
            onChange={(e) => setSearch({ to: e.target.value, page: 1 })}
            className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
          >
            <RotateCcw className="size-4" /> Zurücksetzen
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <FilterIcon className="size-4" />
            {total} Ergebnisse
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Auftrags-Nr.</th>
                <th className="px-4 py-3">Spiel</th>
                <th className="px-4 py-3">Fracht</th>
                <th className="px-4 py-3">Von</th>
                <th className="px-4 py-3">Nach</th>
                <th className="px-4 py-3">Fahrer</th>
                <th className="px-4 py-3">Entfernung</th>
                <th className="px-4 py-3">Vergütung</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Start</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Lade Aufträge…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Noch keine Aufträge vorhanden.
                  </td>
                </tr>
              )}
              {rows.map((j) => {
                const isSel = selected?.id === j.id;
                return (
                  <tr
                    key={j.id}
                    onClick={() => setSearch({ sel: j.id })}
                    className={`cursor-pointer border-t border-border transition ${
                      isSel ? "bg-primary/5" : "hover:bg-surface-2/50"
                    }`}
                  >
                    <td className="px-4 py-3 font-medium">#{shortId(j.id)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{j.game.toUpperCase()}</td>
                    <td className="px-4 py-3">{j.cargo}</td>
                    <td className="px-4 py-3 text-muted-foreground">{j.source_city}</td>
                    <td className="px-4 py-3 text-muted-foreground">{j.dest_city}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={j.driver.display_name} url={j.driver.avatar_url} />
                        <span className="truncate">{j.driver.display_name}</span>
                      </div>
                    </td>
                    <td className="num px-4 py-3">{km(j.distance_km)}</td>
                    <td className="num px-4 py-3">{currency(j.revenue)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={j.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {dt(j.submitted_at)}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to="/vtc/$slug/jobs/$jobId"
                          params={{ slug, jobId: j.id }}
                          aria-label="Details anzeigen"
                          title="Details anzeigen"
                          className="inline-flex items-center justify-center rounded-md border border-border bg-surface p-2 text-muted-foreground transition hover:bg-surface-2 hover:text-foreground"
                        >
                          <Eye className="size-4" />
                        </Link>
                        {canDelete && (
                          <button
                            type="button"
                            aria-label="Auftrag löschen"
                            title="Auftrag löschen"
                            onClick={() => handleDelete(j.id)}
                            disabled={deletingId === j.id}
                            className="inline-flex items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="text-muted-foreground">
            {total === 0
              ? "Keine Einträge"
              : `Zeige ${(search.page - 1) * search.pageSize + 1} bis ${Math.min(
                  search.page * search.pageSize,
                  total,
                )} von ${total} Aufträgen`}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              pro Seite
              <select
                value={search.pageSize}
                onChange={(e) => setSearch({ pageSize: Number(e.target.value), page: 1 })}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={search.page <= 1}
              onClick={() => setSearch({ page: search.page - 1 })}
              className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-1 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs text-muted-foreground">
              {search.page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={search.page >= totalPages}
              onClick={() => setSearch({ page: search.page + 1 })}
              className="inline-flex items-center rounded-md border border-border bg-surface px-2 py-1 disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right detail sidebar (desktop only) */}
      <aside className="hidden xl:block">
        <div className="panel sticky top-4 p-4">
          {selected ? (
            <DetailBody
              job={selected}
              slug={slug}
              canReview={!!canReview}
              onClose={() => setSearch({ sel: "" })}
            />
          ) : (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Wähle einen Auftrag aus, um die Details zu sehen.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-primary/80">{icon}</div>
      </div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="size-6 rounded-full object-cover ring-1 ring-border"
      />
    );
  }
  return (
    <div className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary ring-1 ring-primary/30">
      {initials || "?"}
    </div>
  );
}

type JobRow = NonNullable<
  Awaited<ReturnType<typeof listJobsPaged>>
>["rows"][number];

function DetailBody({
  job,
  slug,
  canReview,
  onClose,
}: {
  job: JobRow;
  slug: string;
  canReview: boolean;
  onClose: () => void;
}) {
  const profit = Number(job.revenue) - Number(job.fuel_cost);
  const drivenKm =
    job.odometer_end_km != null && job.odometer_start_km != null
      ? Math.max(0, Number(job.odometer_end_km) - Number(job.odometer_start_km))
      : Number(job.distance_km ?? 0);
  const progress =
    job.distance_km > 0 && drivenKm > 0
      ? Math.min(100, Math.round((drivenKm / Number(job.distance_km)) * 100))
      : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Auftragsdetails
          </div>
          <div className="mt-1 text-lg font-semibold">#{shortId(job.id)}</div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={job.status} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="Detail schließen"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <Row label="Typ" value={job.game.toUpperCase()} />
        <Row label="Fracht" value={job.cargo} />
        <Row label="Von" value={job.source_city} />
        <Row label="Nach" value={job.dest_city} />
        <Row label="Entfernung" value={km(job.distance_km)} num />
        <Row label="Vergütung" value={currency(job.revenue)} num />
        <Row label="Kraftstoff" value={currency(job.fuel_cost)} num />
        <Row label="Gewinn" value={currency(profit)} num accent />
        <Row label="Schaden" value={`${Number(job.damage_pct ?? 0).toFixed(1)} %`} num />
        <Row label="Fahrzeug" value={job.truck ?? "—"} />
        <Row label="Startdatum" value={dt(job.started_at ?? job.submitted_at)} />
        <Row label="Beendet" value={dt(job.finished_at)} />
        <Row label="Fahrer" value={job.driver.display_name} />
      </div>

      {progress !== null && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Fortschritt</span>
            <span className="num text-foreground">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-primary"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <Link
          to="/vtc/$slug/jobs/$jobId"
          params={{ slug, jobId: job.id }}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Details anzeigen
        </Link>
        {canReview && job.status === "submitted" && (
          <Link
            to="/vtc/$slug/jobs/$jobId"
            params={{ slug, jobId: job.id }}
            className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2"
          >
            Auftrag prüfen
          </Link>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  num,
  accent,
}: {
  label: string;
  value: string;
  num?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs uppercase text-muted-foreground">{label}</span>
      <span
        className={`${num ? "num" : ""} truncate text-right text-sm ${
          accent ? "text-primary" : ""
        }`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
