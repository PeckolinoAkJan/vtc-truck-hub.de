import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Receipt,
  Download,
  Plus,
  Search,
  RotateCcw,
  Eye,
  Edit3,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Send,
  X,
  Trash2,
  FileText,
  Hourglass,
  Euro,
} from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { StatusPill, type PillStatus } from "@/components/StatusPill";
import { getVtcContext } from "@/lib/vtcs.functions";
import {
  listSettlements,
  getSettlementsKpis,
  getSettlement,
  createSettlement,
  updateSettlement,
  addAdjustment,
  removeAdjustment,
  setSettlementStatus,
  paySettlement,
  respondDispute,
  listVtcDrivers,
} from "@/lib/settlements.functions";
import { currency, km } from "@/lib/format";


const statusTabs = [
  { key: "all", label: "Alle" },
  { key: "draft", label: "Entwurf" },
  { key: "pending", label: "Ausstehend" },
  { key: "ready", label: "Bereit" },
  { key: "approved", label: "Freigegeben" },
  { key: "paid", label: "Ausgezahlt" },
  { key: "disputed", label: "Beanstandet" },
  { key: "archived", label: "Archiv" },
] as const;
type StatusKey = (typeof statusTabs)[number]["key"];

const payModelLabels: Record<string, string> = {
  per_km: "Kilometerbasiert",
  per_job: "Pro Auftrag",
  fixed: "Festbetrag",
  manual: "Manuell",
  all: "Alle Lohnmodelle",
};

const searchSchema = z.object({
  status: z.enum(["all", "draft", "pending", "ready", "approved", "paid", "disputed", "archived"]).catch("all").default("all"),
  q: z.string().catch("").default(""),
  driver: z.string().catch("").default(""),
  payModel: z.enum(["all", "per_km", "per_job", "fixed", "manual"]).catch("all").default("all"),
  from: z.string().catch("").default(""),
  to: z.string().catch("").default(""),
  page: z.number().catch(1).default(1),
  pageSize: z.number().catch(10).default(10),
  sel: z.string().catch("").default(""),
});

export const Route = createFileRoute("/_authenticated/vtc/$slug/billing")({
  validateSearch: searchSchema,
  component: BillingPage,
});

function BillingPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const fetchCtx = useServerFn(getVtcContext);
  const fetchKpis = useServerFn(getSettlementsKpis);
  const fetchList = useServerFn(listSettlements);
  const fetchDrivers = useServerFn(listVtcDrivers);
  const fetchOne = useServerFn(getSettlement);

  const ctxQ = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctxQ.data?.vtc?.id;
  const role = ctxQ.data?.role;
  const isAdmin = role === "owner" || role === "admin" || role === "dispatcher";

  const kpiQ = useQuery({
    queryKey: ["billing-kpis", vtcId],
    queryFn: () => fetchKpis({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId && isAdmin,
  });

  const listQ = useQuery({
    queryKey: ["billing-list", vtcId, search],
    queryFn: () =>
      fetchList({
        data: {
          vtcId: vtcId!,
          status: search.status,
          driverId: search.driver || undefined,
          payModel: search.payModel,
          search: search.q,
          from: search.from || undefined,
          to: search.to || undefined,
          page: search.page,
          pageSize: search.pageSize,
        },
      }),
    enabled: !!vtcId && isAdmin,
  });

  const driversQ = useQuery({
    queryKey: ["billing-drivers", vtcId],
    queryFn: () => fetchDrivers({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId && isAdmin,
  });

  const selId = search.sel || listQ.data?.rows[0]?.id || "";
  const selQ = useQuery({
    queryKey: ["billing-one", selId],
    queryFn: () => fetchOne({ data: { id: selId } }),
    enabled: !!selId && isAdmin,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [disputeReply, setDisputeReply] = useState<Record<string, string>>({});

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["billing-kpis", vtcId] });
    qc.invalidateQueries({ queryKey: ["billing-list", vtcId] });
    if (selId) qc.invalidateQueries({ queryKey: ["billing-one", selId] });
  };

  const setStatusFn = useServerFn(setSettlementStatus);
  const payFn = useServerFn(paySettlement);
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: "pending" | "ready" | "approved" | "archived" }) =>
      setStatusFn({ data: v }),
    onSuccess: () => {
      toast.success("Status aktualisiert");
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  const payMut = useMutation({
    mutationFn: (id: string) => payFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ausgezahlt");
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  if (ctxQ.isLoading) return <div className="p-6 text-sm text-muted-foreground">Lade…</div>;
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Abrechnungen" subtitle="Nur für Admins." icon={Receipt} />
        <EmptyState icon={Receipt} title="Kein Zugriff" body="Nur Owner, Admins und Disponenten sehen Abrechnungen." />
      </div>
    );
  }

  const rows = listQ.data?.rows ?? [];
  const counts = listQ.data?.counts ?? {};
  const total = listQ.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / search.pageSize));

  const updateSearch = (patch: Partial<typeof search>) =>
    navigate({ search: (prev: typeof search) => ({ ...prev, ...patch, page: patch.page ?? 1 }) });


  const kpi = kpiQ.data;

  const exportCsv = () => {
    const header = ["Nr.", "Fahrer", "Zeitraum", "Touren", "km", "Grundlohn", "Bonus", "Abzüge", "Endbetrag", "Status", "Erstellt"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push(
        [
          r.number,
          r.driver_name,
          `${r.period_start} - ${r.period_end}`,
          r.jobs_count,
          r.total_km,
          r.base_pay,
          r.bonus_total,
          r.deduction_total,
          r.final_amount,
          r.status,
          new Date(r.created_at).toISOString(),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(";"),
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `abrechnungen-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Abrechnungen"
        subtitle="Verwalte, prüfe und erledige alle finanziellen Abrechnungen deiner VTC."
        icon={Receipt}
      >
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:bg-surface-3"
        >
          <Download className="size-4" />
          Exportieren
        </button>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <Plus className="size-4" />
          Neue Abrechnung
        </button>
      </PageHeader>

      {/* KPI Grid */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={FileText} label="Abrechnungen gesamt" value={kpi?.total ?? 0} sub="Insgesamt" tone="primary" />
        <KpiCard icon={Hourglass} label="Ausstehend" value={kpi?.pending ?? 0} sub="Zur Freigabe" tone="warning" />
        <KpiCard icon={Euro} label="Freizugebender Betrag" value={currency(kpi?.readyAmount ?? 0)} sub="Gesamtbetrag" tone="primary" />
        <KpiCard icon={Wallet} label="Ausgezahlt (dieser Monat)" value={currency(kpi?.paidMonth ?? 0)} sub="Bereits ausgezahlt" tone="success" />
        <KpiCard icon={AlertTriangle} label="Offene Beanstandungen" value={kpi?.disputesOpen ?? 0} sub="Abrechnungen" tone="destructive" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left column */}
        <section className="panel overflow-hidden">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-3">
            {statusTabs.map((t) => {
              const active = search.status === t.key;
              const cnt = counts[t.key] ?? 0;
              return (
                <button
                  key={t.key}
                  onClick={() => updateSearch({ status: t.key as StatusKey })}
                  className={`inline-flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm ${
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {cnt > 0 && (
                    <span className={`rounded-full px-1.5 text-xs ${active ? "bg-primary/20 text-primary" : "bg-surface-2 text-muted-foreground"}`}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search.q}
                onChange={(e) => updateSearch({ q: e.target.value })}
                placeholder="Abrechnungen suchen…"
                className="input w-full pl-9"
              />
            </div>
            <input
              type="date"
              value={search.from}
              onChange={(e) => updateSearch({ from: e.target.value })}
              className="input"
            />
            <input
              type="date"
              value={search.to}
              onChange={(e) => updateSearch({ to: e.target.value })}
              className="input"
            />
            <select
              value={search.driver}
              onChange={(e) => updateSearch({ driver: e.target.value })}
              className="input"
            >
              <option value="">Alle Fahrer</option>
              {(driversQ.data?.drivers ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.display_name}
                </option>
              ))}
            </select>
            <select
              value={search.payModel}
              onChange={(e) => updateSearch({ payModel: e.target.value as typeof search.payModel })}
              className="input"
            >
              <option value="all">Alle Lohnmodelle</option>
              <option value="per_km">Kilometerbasiert</option>
              <option value="per_job">Pro Auftrag</option>
              <option value="fixed">Festbetrag</option>
              <option value="manual">Manuell</option>
            </select>
            <button
              onClick={() =>
                navigate({ search: () => searchSchema.parse({}) })
              }
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
              title="Zurücksetzen"
            >
              <RotateCcw className="size-4" />
              Zurücksetzen
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Abrechnungs-Nr.</th>
                  <th className="px-3 py-2">Fahrer</th>
                  <th className="px-3 py-2">Zeitraum</th>
                  <th className="px-3 py-2 text-right">Touren</th>
                  <th className="px-3 py-2 text-right">Kilometer</th>
                  <th className="px-3 py-2 text-right">Grundlohn</th>
                  <th className="px-3 py-2 text-right">Bonus</th>
                  <th className="px-3 py-2 text-right">Abzüge</th>
                  <th className="px-3 py-2 text-right">Endbetrag</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Erstellt am</th>
                  <th className="px-3 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {listQ.isLoading ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                      Lade…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-10 text-center text-muted-foreground">
                      Keine Abrechnungen gefunden.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const active = r.id === selId;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => updateSearch({ sel: r.id })}
                        className={`cursor-pointer border-t border-border hover:bg-surface-2/40 ${active ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-2 font-medium">{r.number}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="grid size-8 place-items-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
                              {r.driver_avatar ? (
                                <img src={r.driver_avatar} alt="" className="size-8 object-cover" />
                              ) : (
                                (r.driver_name || "?").slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div className="leading-tight">
                              <div className="font-medium">{r.driver_name}</div>
                              <div className="text-xs text-muted-foreground">@{r.driver_name.replace(/\s+/g, "")}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDate(r.period_start)} – {formatDate(r.period_end)}
                        </td>
                        <td className="px-3 py-2 text-right">{r.jobs_count}</td>
                        <td className="px-3 py-2 text-right">{km(r.total_km)}</td>
                        <td className="px-3 py-2 text-right">{currency(r.base_pay)}</td>
                        <td className="px-3 py-2 text-right text-success">{r.bonus_total ? currency(r.bonus_total) : "—"}</td>
                        <td className="px-3 py-2 text-right text-destructive">{r.deduction_total ? `-${currency(r.deduction_total)}` : "—"}</td>
                        <td className="px-3 py-2 text-right font-semibold">{currency(r.final_amount)}</td>
                        <td className="px-3 py-2">
                          <StatusPill status={r.status as PillStatus} />
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString("de-DE")}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSearch({ sel: r.id });
                              }}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                              title="Ansehen"
                            >
                              <Eye className="size-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateSearch({ sel: r.id });
                                setEditOpen(true);
                              }}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                              title="Bearbeiten"
                            >
                              <Edit3 className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-sm">
            <div className="text-muted-foreground">
              Zeige {rows.length === 0 ? 0 : (search.page - 1) * search.pageSize + 1} bis {(search.page - 1) * search.pageSize + rows.length} von {total} Abrechnungen
            </div>
            <div className="flex items-center gap-2">
              <select
                value={search.pageSize}
                onChange={(e) => updateSearch({ pageSize: Number(e.target.value), page: 1 })}
                className="input"
              >
                <option value={10}>10 pro Seite</option>
                <option value={25}>25 pro Seite</option>
                <option value={50}>50 pro Seite</option>
              </select>
              <button
                onClick={() => updateSearch({ page: Math.max(1, search.page - 1) })}
                disabled={search.page <= 1}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm disabled:opacity-40"
              >
                ←
              </button>
              <span className="text-muted-foreground">
                {search.page} / {pages}
              </span>
              <button
                onClick={() => updateSearch({ page: Math.min(pages, search.page + 1) })}
                disabled={search.page >= pages}
                className="rounded-md border border-border bg-surface-2 px-2 py-1 text-sm disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>
        </section>

        {/* Right sidebar */}
        <aside className="space-y-3">
          {selQ.data ? (
            <>
              <div className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Abrechnungsdetails</div>
                    <div className="text-lg font-semibold">{selQ.data.settlement.number}</div>
                  </div>
                  <StatusPill status={selQ.data.settlement.status as PillStatus} />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Fahrer</dt>
                  <dd className="text-right">{selQ.data.driver.display_name}</dd>
                  <dt className="text-muted-foreground">Zeitraum</dt>
                  <dd className="text-right">
                    {formatDate(selQ.data.settlement.period_start)} – {formatDate(selQ.data.settlement.period_end)}
                  </dd>
                  <dt className="text-muted-foreground">Touren</dt>
                  <dd className="text-right">{selQ.data.settlement.jobs_count}</dd>
                  <dt className="text-muted-foreground">Gefahrene Kilometer</dt>
                  <dd className="text-right">{km(selQ.data.settlement.total_km)}</dd>
                  <dt className="text-muted-foreground">Lohnmodell</dt>
                  <dd className="text-right">{payModelLabels[selQ.data.settlement.pay_model] ?? "—"}</dd>
                  <dt className="text-muted-foreground">Grundlohn</dt>
                  <dd className="text-right">{currency(selQ.data.settlement.base_pay)}</dd>
                  <dt className="text-muted-foreground">Bonus</dt>
                  <dd className="text-right text-success">{selQ.data.settlement.bonus_total ? `+${currency(selQ.data.settlement.bonus_total)}` : "—"}</dd>
                  <dt className="text-muted-foreground">Abzüge</dt>
                  <dd className="text-right text-destructive">{selQ.data.settlement.deduction_total ? `-${currency(selQ.data.settlement.deduction_total)}` : "—"}</dd>
                </dl>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">Endbetrag</span>
                  <span className="text-xl font-bold text-primary">{currency(selQ.data.settlement.final_amount)}</span>
                </div>
              </div>

              <div className="panel p-4">
                <div className="mb-2 text-sm font-medium">Aktionen</div>
                <div className="grid gap-2">
                  {selQ.data.settlement.status !== "paid" && selQ.data.settlement.status !== "approved" && (
                    <button
                      onClick={() => statusMut.mutate({ id: selId, status: "approved" })}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                    >
                      <CheckCircle2 className="size-4" />
                      Freigeben
                    </button>
                  )}
                  <button
                    onClick={() => setEditOpen(true)}
                    disabled={selQ.data.settlement.status === "paid"}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3 disabled:opacity-50"
                  >
                    <Edit3 className="size-4" />
                    Bearbeiten
                  </button>
                  {selQ.data.settlement.status !== "paid" && (
                    <button
                      onClick={() => {
                        if (confirm("Als ausgezahlt markieren?")) payMut.mutate(selId);
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                    >
                      <Wallet className="size-4" />
                      Als ausgezahlt markieren
                    </button>
                  )}
                  {selQ.data.settlement.status !== "archived" && selQ.data.settlement.status !== "paid" && (
                    <button
                      onClick={() => statusMut.mutate({ id: selId, status: "archived" })}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3"
                    >
                      <Trash2 className="size-4" />
                      Archivieren
                    </button>
                  )}
                </div>
              </div>

              {/* Disputes */}
              <div className="panel p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-medium">Beanstandungen</div>
                  <span className="text-xs text-muted-foreground">{selQ.data.disputes.length}</span>
                </div>
                {selQ.data.disputes.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Keine Beanstandungen.</div>
                ) : (
                  <ul className="space-y-2">
                    {selQ.data.disputes.map((d) => (
                      <li key={d.id} className="rounded-md border border-border bg-surface-2/50 p-2 text-xs">
                        <div className="mb-1 flex items-center justify-between">
                          <StatusPill status={(d.status === "resolved" ? "approved" : d.status === "answered" ? "ready" : "disputed") as PillStatus} />
                          <span className="text-muted-foreground">{new Date(d.created_at).toLocaleDateString("de-DE")}</span>
                        </div>
                        <div className="whitespace-pre-wrap">{d.message}</div>
                        {d.response && (
                          <div className="mt-2 rounded bg-surface-3 p-2 text-muted-foreground">
                            <span className="font-medium text-foreground">Antwort:</span> {d.response}
                          </div>
                        )}
                        {d.status !== "resolved" && (
                          <ReplyDispute
                            id={d.id}
                            value={disputeReply[d.id] ?? ""}
                            onChange={(v) => setDisputeReply((s) => ({ ...s, [d.id]: v }))}
                            onDone={() => {
                              setDisputeReply((s) => {
                                const { [d.id]: _omit, ...rest } = s;
                                return rest;
                              });
                              invalidateAll();
                            }}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Activity */}
              {selQ.data.activity.length > 0 && (
                <div className="panel p-4">
                  <div className="mb-2 text-sm font-medium">Verlauf</div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {selQ.data.activity.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex justify-between gap-3">
                        <span>{a.action}</span>
                        <span>{new Date(a.created_at).toLocaleString("de-DE")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="panel p-6 text-sm text-muted-foreground">
              Wähle eine Abrechnung aus, um Details zu sehen.
            </div>
          )}
        </aside>
      </div>

      {createOpen && (
        <CreateDialog
          vtcId={vtcId!}
          drivers={driversQ.data?.drivers ?? []}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            updateSearch({ sel: id });
            invalidateAll();
          }}
        />
      )}

      {editOpen && selQ.data && (
        <EditDialog
          settlement={selQ.data.settlement}
          adjustments={selQ.data.adjustments}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            invalidateAll();
          }}
        />
      )}
    </div>
  );
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Receipt;
  label: string;
  value: string | number;
  sub: string;
  tone: "primary" | "warning" | "success" | "destructive";
}) {
  const toneCls: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-bold">{value}</div>
        </div>
        <div className={`grid size-10 place-items-center rounded-lg ${toneCls[tone]}`}>
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function ReplyDispute({
  id,
  value,
  onChange,
  onDone,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onDone: () => void;
}) {
  const fn = useServerFn(respondDispute);
  const mut = useMutation({
    mutationFn: (v: { response: string; resolve: boolean }) => fn({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("Antwort gespeichert");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  return (
    <div className="mt-2 space-y-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder="Antwort…"
        className="input w-full"
      />
      <div className="flex gap-1">
        <button
          onClick={() => mut.mutate({ response: value, resolve: false })}
          disabled={!value.trim() || mut.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          <Send className="size-3" />
          Antworten
        </button>
        <button
          onClick={() => mut.mutate({ response: value || "Erledigt.", resolve: true })}
          disabled={mut.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3 disabled:opacity-50"
        >
          <CheckCircle2 className="size-3" />
          Abschließen
        </button>
      </div>
    </div>
  );
}

function CreateDialog({
  vtcId,
  drivers,
  onClose,
  onCreated,
}: {
  vtcId: string;
  drivers: { id: string; display_name: string; avatar_url: string | null }[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const fn = useServerFn(createSettlement);
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? "");
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [payModel, setPayModel] = useState<"per_km" | "per_job" | "fixed" | "manual">("per_km");
  const [basePay, setBasePay] = useState("0");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          vtcId,
          driverId,
          from,
          to,
          payModel,
          basePay: Number(basePay || "0"),
          note: note || undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Abrechnung ${res.number} erstellt`);
      onCreated(res.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  return (
    <Modal title="Neue Abrechnung" onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Fahrer</span>
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className="input">
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.display_name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Von</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Bis</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Lohnmodell</span>
          <select
            value={payModel}
            onChange={(e) => setPayModel(e.target.value as typeof payModel)}
            className="input"
          >
            <option value="per_km">Kilometerbasiert (0,50 €/km)</option>
            <option value="per_job">Pro Auftrag (250 €)</option>
            <option value="fixed">Festbetrag</option>
            <option value="manual">Manuell</option>
          </select>
        </label>
        {(payModel === "fixed" || payModel === "manual") && (
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Grundlohn (€)</span>
            <input value={basePay} onChange={(e) => setBasePay(e.target.value)} inputMode="decimal" className="input" />
          </label>
        )}
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Notiz</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input" />
        </label>
        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
            Abbrechen
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!driverId || mut.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Erstellen
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditDialog({
  settlement,
  adjustments,
  onClose,
  onSaved,
}: {
  settlement: { id: string; base_pay: number; note: string | null; pay_model: string };
  adjustments: { id: string; kind: "bonus" | "deduction"; category: string; amount: number; note: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(updateSettlement);
  const addFn = useServerFn(addAdjustment);
  const removeFn = useServerFn(removeAdjustment);
  const [basePay, setBasePay] = useState(String(settlement.base_pay));
  const [note, setNote] = useState(settlement.note ?? "");
  const [newKind, setNewKind] = useState<"bonus" | "deduction">("bonus");
  const [newCategory, setNewCategory] = useState("manual");
  const [newAmount, setNewAmount] = useState("");
  const [newNote, setNewNote] = useState("");

  const bonusCategories = ["safe_drive", "punctual", "eco", "long_haul", "convoy", "manual"];
  const dedCategories = ["damage_vehicle", "damage_cargo", "late", "violation", "manual"];

  const saveMut = useMutation({
    mutationFn: () =>
      updateFn({ data: { id: settlement.id, basePay: Number(basePay || "0"), note } }),
    onSuccess: () => {
      toast.success("Gespeichert");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  const addMut = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          settlementId: settlement.id,
          kind: newKind,
          category: newCategory,
          amount: Number(newAmount || "0"),
          note: newNote || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Position hinzugefügt");
      setNewAmount("");
      setNewNote("");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Entfernt");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  return (
    <Modal title={`Abrechnung bearbeiten`} onClose={onClose} wide>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Grundlohn (€)</span>
            <input value={basePay} onChange={(e) => setBasePay(e.target.value)} inputMode="decimal" className="input" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Notiz</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="input" />
          </label>
        </div>
        <div>
          <div className="mb-2 text-sm font-medium">Bonus- & Abzugs-Positionen</div>
          {adjustments.length === 0 ? (
            <div className="mb-2 text-xs text-muted-foreground">Noch keine Positionen.</div>
          ) : (
            <ul className="mb-2 divide-y divide-border rounded-md border border-border">
              {adjustments.map((a) => (
                <li key={a.id} className="flex items-center justify-between p-2 text-sm">
                  <div>
                    <span className={a.kind === "bonus" ? "text-success" : "text-destructive"}>
                      {a.kind === "bonus" ? "+" : "−"}
                      {currency(a.amount)}
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {a.category}
                      {a.note ? ` · ${a.note}` : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => removeMut.mutate(a.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-surface-2 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-[auto_1fr_auto_auto] items-end gap-2 rounded-md border border-border p-2">
            <select
              value={newKind}
              onChange={(e) => {
                const k = e.target.value as "bonus" | "deduction";
                setNewKind(k);
                setNewCategory(k === "bonus" ? "manual" : "manual");
              }}
              className="input"
            >
              <option value="bonus">Bonus</option>
              <option value="deduction">Abzug</option>
            </select>
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="input">
              {(newKind === "bonus" ? bonusCategories : dedCategories).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Betrag €"
              inputMode="decimal"
              className="input w-28"
            />
            <button
              onClick={() => addMut.mutate()}
              disabled={!newAmount || addMut.isPending}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Hinzufügen
            </button>
            <input
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Notiz (optional)"
              className="input col-span-4"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
            Schließen
          </button>
          <button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`panel w-full ${wide ? "max-w-2xl" : "max-w-md"} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
