import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Trash2,
  Plus,
  Check,
  X,
  UserPlus,
  Search,
  Filter,
  Users,
  Radio,
  Truck,
  Zap,
  Wifi,
  Mail,
  Eye,
  Pencil,
  MessageSquare,
  MoreHorizontal,
  ShieldCheck,
  Clock,
} from "lucide-react";
import {
  getVtcContext,
  listAllVtcJoinRequests,
  acceptJoinRequest,
  rejectJoinRequest,
} from "@/lib/vtcs.functions";
import {
  listMembers,
  updateMemberRole,
  removeMember,
  listInvites,
  createInvite,
  revokeInvite,
} from "@/lib/members.functions";
import { listLiveTelemetry } from "@/lib/telemetry.functions";
import { km, dt } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROLES = ["owner", "admin", "dispatcher", "driver"] as const;
type Role = (typeof ROLES)[number];

const ROLE_LABEL: Record<Role, string> = {
  owner: "VTC Inhaber",
  admin: "VTC Administrator",
  dispatcher: "Disponent",
  driver: "Fahrer",
};

const ROLE_TONE: Record<Role, string> = {
  owner: "border-purple-500/30 bg-purple-500/15 text-purple-300",
  admin: "border-purple-500/30 bg-purple-500/15 text-purple-300",
  dispatcher: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  driver: "border-sky-500/30 bg-sky-500/15 text-sky-300",
};

const TABS = [
  { id: "overview", label: "Fahrerübersicht" },
  { id: "users", label: "Benutzer" },
  { id: "applications", label: "Bewerbungen" },
  { id: "invites", label: "Einladungscodes" },
  { id: "roles", label: "Rollen & Rechte" },
  { id: "profiles", label: "Fahrerprofile" },
  { id: "activity", label: "Aktivitätsverlauf" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/_authenticated/vtc/$slug/drivers")({
  component: DriversPage,
});

function DriversPage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const canManage = !!ctx && (ctx.role === "owner" || ctx.role === "admin");

  const fetchMembers = useServerFn(listMembers);
  const fetchLive = useServerFn(listLiveTelemetry);
  const fetchReqs = useServerFn(listAllVtcJoinRequests);

  const { data: members } = useQuery({
    queryKey: ["members", vtcId],
    queryFn: () => fetchMembers({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });
  const { data: live } = useQuery({
    queryKey: ["live-telemetry", vtcId],
    queryFn: () => fetchLive({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
    refetchInterval: 15_000,
  });
  const { data: requests } = useQuery({
    queryKey: ["join-requests", vtcId],
    queryFn: () => fetchReqs({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId && !!canManage,
  });

  const [tab, setTab] = useState<TabId>("overview");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");

  const liveByDriver = useMemo(() => {
    const m = new Map<string, any>();
    (live ?? []).forEach((r) => m.set(r.driver_id, r));
    return m;
  }, [live]);

  const enrichedMembers = useMemo(() => {
    return (members ?? []).map((m) => {
      const t = liveByDriver.get(m.user_id);
      const fresh = t?.updated_at
        ? Date.now() - new Date(t.updated_at).getTime() < 5 * 60_000
        : false;
      const online = fresh;
      const inJob = fresh && !!t?.job_id;
      return { ...m, telemetry: t, online, inJob };
    });
  }, [members, liveByDriver]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enrichedMembers.filter((m) => {
      if (roleFilter !== "all" && m.role !== roleFilter) return false;
      if (!q) return true;
      return (
        m.profile.display_name?.toLowerCase().includes(q) ||
        m.profile.steam_id?.toLowerCase().includes(q) ||
        m.user_id.toLowerCase().includes(q)
      );
    });
  }, [enrichedMembers, query, roleFilter]);

  const kpis = useMemo(() => {
    const total = enrichedMembers.length;
    const online = enrichedMembers.filter((m) => m.online).length;
    const inJob = enrichedMembers.filter((m) => m.inJob).length;
    const clientConnected = online; // proxy: live telemetry within 5 min
    const newApps = (requests ?? []).filter((r) => r.status === "pending").length;
    return { total, online, inJob, clientConnected, newApps };
  }, [enrichedMembers, requests]);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fahrerverwaltung</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Verwalte deine Fahrer, Benutzer und Berechtigungen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suche nach Fahrer, Benutzer, Steam-ID…"
              className="h-10 w-80 rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground hover:text-foreground">
            <Filter className="size-4" /> Filter
          </button>
          {canManage && (
            <button
              onClick={() => setTab("invites")}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" /> Fahrer einladen
            </button>
          )}
        </div>
      </div>

      {/* Tab strip */}
      <div className="mb-6 border-b border-border">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "relative -mb-px px-4 py-2.5 text-sm font-medium transition-colors",
                tab === t.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {tab === t.id && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Users} label="Gesamt Fahrer" value={kpis.total} />
        <Kpi
          icon={Radio}
          label="Online"
          value={kpis.online}
          hint={pct(kpis.online, kpis.total)}
          tone="emerald"
        />
        <Kpi
          icon={Truck}
          label="Unterwegs"
          value={kpis.inJob}
          hint={pct(kpis.inJob, kpis.total)}
          tone="amber"
        />
        <Kpi icon={Zap} label="Im Konvoi" value={0} hint="0%" />
        <Kpi
          icon={Wifi}
          label="Client verbunden"
          value={kpis.clientConnected}
          hint={pct(kpis.clientConnected, kpis.total)}
          tone="emerald"
        />
        <Kpi
          icon={Mail}
          label="Neue Bewerbungen"
          value={kpis.newApps}
          hint="Heute"
          tone="amber"
        />
      </div>

      {tab === "overview" && (
        <OverviewTable rows={filtered} totalCount={enrichedMembers.length} slug={slug} />
      )}
      {tab === "users" && (
        <UsersTable rows={filtered} vtcId={vtcId} canManage={canManage} isOwner={ctx?.role === "owner"} />
      )}
      {tab === "applications" && (
        <ApplicationsPanel vtcId={vtcId} canManage={canManage} />
      )}
      {tab === "invites" && <InvitesPanel vtcId={vtcId} canManage={canManage} />}
      {tab === "roles" && <RolesMatrix />}
      {tab === "profiles" && <ProfilesGrid rows={filtered} slug={slug} />}
      {tab === "activity" && <ActivityPlaceholder />}

      {tab === "overview" && (
        <div className="mt-6">
          <ApplicationsPanel vtcId={vtcId} canManage={canManage} embedded />
        </div>
      )}
    </div>
  );
}

/* ---------- KPI ---------- */
function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint?: string;
  tone?: "muted" | "emerald" | "amber";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-primary"
      : tone === "amber"
        ? "text-amber-400"
        : "text-muted-foreground";
  return (
    <div className="panel px-4 py-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </div>
        {hint && <div className={cn("text-xs font-semibold", toneCls)}>{hint}</div>}
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

/* ---------- Overview table ---------- */
type EnrichedMember = ReturnType<
  Extract<
    Parameters<typeof useMemo<Array<{ user_id: string }>>>[0],
    () => Array<{ user_id: string }>
  >
> extends never
  ? never
  : any;

function StatusBadge({ online, inJob }: { online: boolean; inJob: boolean }) {
  if (inJob) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
        <span className="size-1.5 rounded-full bg-amber-400" /> Unterwegs
      </span>
    );
  }
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
        <span className="size-1.5 rounded-full bg-primary" /> Online
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full bg-muted-foreground/60" /> Offline
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        ROLE_TONE[role],
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  const initials = name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  if (url) {
    return <img src={url} alt="" className="size-9 rounded-full object-cover" />;
  }
  return (
    <div className="grid size-9 place-items-center rounded-full bg-surface-2 text-xs font-bold text-muted-foreground">
      {initials || "?"}
    </div>
  );
}

function OverviewTable({
  rows,
  totalCount,
  slug,
}: {
  rows: any[];
  totalCount: number;
  slug: string;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Fahrer ({rows.length})</h2>
        <div className="text-xs text-muted-foreground">
          Zeige {rows.length} von {totalCount} Fahrern
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Fahrer</th>
              <th className="px-5 py-3 font-medium">Rolle</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Fahrzeug</th>
              <th className="px-5 py-3 font-medium">Kilometer</th>
              <th className="px-5 py-3 font-medium">Aktuelle Tour</th>
              <th className="px-5 py-3 font-medium">Beigetreten</th>
              <th className="px-5 py-3 text-right font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const t = m.telemetry;
              const truckName = t?.truck_brand
                ? `${t.truck_brand}${t.truck_model ? " " + t.truck_model : ""}`
                : "—";
              const tour =
                t?.job_source_city && t?.job_dest_city
                  ? `${t.job_source_city} → ${t.job_dest_city}`
                  : "—";
              return (
                <tr
                  key={m.user_id}
                  className="border-t border-border/60 transition-colors hover:bg-surface-2/40"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.profile.display_name} url={m.profile.avatar_url} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {m.profile.display_name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.profile.steam_id ?? "keine Steam-ID"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <RoleBadge role={m.role} />
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge online={m.online} inJob={m.inJob} />
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{truckName}</td>
                  <td className="num px-5 py-3">{km(m.stats.km)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{tour}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    {dt(m.joined_at)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconBtn title="Profil anzeigen">
                        <Eye className="size-4" />
                      </IconBtn>
                      <IconBtn title="Bearbeiten">
                        <Pencil className="size-4" />
                      </IconBtn>
                      <IconBtn title="Nachricht senden">
                        <MessageSquare className="size-4" />
                      </IconBtn>
                      <IconBtn title="Weitere">
                        <MoreHorizontal className="size-4" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Keine Fahrer gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IconBtn({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <button
      title={title}
      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
    >
      {children}
    </button>
  );
}

/* ---------- Users tab ---------- */
function UsersTable({
  rows,
  vtcId,
  canManage,
  isOwner,
}: {
  rows: any[];
  vtcId?: string;
  canManage: boolean;
  isOwner: boolean;
}) {
  const qc = useQueryClient();
  const updRole = useServerFn(updateMemberRole);
  const rmMember = useServerFn(removeMember);

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Benutzer</th>
              <th className="px-5 py-3 font-medium">Steam-ID</th>
              <th className="px-5 py-3 font-medium">Benutzer-ID</th>
              <th className="px-5 py-3 font-medium">Rolle</th>
              <th className="px-5 py-3 font-medium">Beigetreten</th>
              <th className="px-5 py-3 text-right font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.user_id} className="border-t border-border/60 hover:bg-surface-2/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.profile.display_name} url={m.profile.avatar_url} />
                    <div className="font-medium">{m.profile.display_name}</div>
                  </div>
                </td>
                <td className="num px-5 py-3 text-xs text-muted-foreground">
                  {m.profile.steam_id ?? "—"}
                </td>
                <td className="num px-5 py-3 text-xs text-muted-foreground">
                  {m.user_id.slice(0, 8)}…
                </td>
                <td className="px-5 py-3">
                  {canManage && isOwner ? (
                    <select
                      value={m.role}
                      onChange={async (e) => {
                        try {
                          await updRole({
                            data: {
                              vtcId: vtcId!,
                              userId: m.user_id,
                              role: e.target.value as Role,
                            },
                          });
                          toast.success("Rolle aktualisiert");
                          qc.invalidateQueries({ queryKey: ["members", vtcId] });
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Fehler");
                        }
                      }}
                      className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">{dt(m.joined_at)}</td>
                <td className="px-5 py-3 text-right">
                  {canManage && m.role !== "owner" && (
                    <button
                      onClick={async () => {
                        if (!confirm(`${m.profile.display_name} wirklich aus der VTC entfernen?`)) return;
                        try {
                          await rmMember({ data: { vtcId: vtcId!, userId: m.user_id } });
                          qc.invalidateQueries({ queryKey: ["members", vtcId] });
                          toast.success("Fahrer entfernt");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Fehler");
                        }
                      }}
                      className="rounded-md p-2 text-muted-foreground hover:bg-surface hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Applications ---------- */
function ApplicationsPanel({
  vtcId,
  canManage,
  embedded,
}: {
  vtcId?: string;
  canManage: boolean;
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const fetchReqs = useServerFn(listAllVtcJoinRequests);
  const doAccept = useServerFn(acceptJoinRequest);
  const doReject = useServerFn(rejectJoinRequest);

  const { data: requests } = useQuery({
    queryKey: ["join-requests", vtcId],
    queryFn: () => fetchReqs({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId && !!canManage,
  });

  const [status, setStatus] = useState<"pending" | "accepted" | "rejected" | "all">(
    "pending",
  );

  const accept = useMutation({
    mutationFn: (id: string) => doAccept({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Bewerbung angenommen");
      qc.invalidateQueries({ queryKey: ["join-requests", vtcId] });
      qc.invalidateQueries({ queryKey: ["members", vtcId] });
      qc.invalidateQueries({ queryKey: ["pending-applications", vtcId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Fehler"),
  });
  const reject = useMutation({
    mutationFn: (id: string) => doReject({ data: { requestId: id } }),
    onSuccess: () => {
      toast.success("Bewerbung abgelehnt");
      qc.invalidateQueries({ queryKey: ["join-requests", vtcId] });
      qc.invalidateQueries({ queryKey: ["pending-applications", vtcId] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Fehler"),
  });

  if (!canManage) {
    return (
      <div className="panel p-8 text-sm text-muted-foreground">
        Du hast keine Berechtigung, Bewerbungen zu verwalten.
      </div>
    );
  }

  const all = requests ?? [];
  const counts = {
    pending: all.filter((r) => r.status === "pending").length,
    accepted: all.filter((r) => r.status === "accepted").length,
    rejected: all.filter((r) => r.status === "rejected").length,
    all: all.length,
  };
  const filtered = status === "all" ? all : all.filter((r) => r.status === status);

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold">Bewerbungen</h2>
      </div>
      <div className="flex items-center gap-1 border-b border-border px-3">
        {(
          [
            ["pending", `Offen (${counts.pending})`],
            ["accepted", `Angenommen (${counts.accepted})`],
            ["rejected", `Abgelehnt (${counts.rejected})`],
            ["all", `Alle (${counts.all})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setStatus(id)}
            className={cn(
              "relative -mb-px px-3 py-2 text-xs font-medium transition-colors",
              status === id ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {status === id && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Bewerber</th>
              <th className="px-5 py-3 font-medium">Steam-ID</th>
              <th className="px-5 py-3 font-medium">Nachricht</th>
              <th className="px-5 py-3 font-medium">Datum</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 text-right font-medium">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border/60 hover:bg-surface-2/40">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={r.profile?.display_name ?? "?"}
                      url={r.profile?.avatar_url ?? null}
                    />
                    <div className="font-medium">
                      {r.profile?.display_name ?? "Unbekannt"}
                    </div>
                  </div>
                </td>
                <td className="num px-5 py-3 text-xs text-muted-foreground">
                  —
                </td>
                <td className="px-5 py-3 max-w-xs">
                  <div className="line-clamp-1 text-xs text-muted-foreground">
                    {r.message || "—"}
                  </div>
                </td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {dt(r.created_at)}
                </td>
                <td className="px-5 py-3">
                  <AppStatusPill status={r.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {r.status === "pending" ? (
                      <>
                        <button
                          onClick={() => accept.mutate(r.id)}
                          disabled={accept.isPending}
                          title="Annehmen"
                          className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50"
                        >
                          <Check className="size-4" />
                        </button>
                        <button
                          onClick={() => reject.mutate(r.id)}
                          disabled={reject.isPending}
                          title="Ablehnen"
                          className="grid size-8 place-items-center rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50"
                        >
                          <X className="size-4" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.decided_at ? dt(r.decided_at) : ""}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Keine Bewerbungen in dieser Ansicht.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {embedded && (
        <div className="border-t border-border px-5 py-3 text-right">
          <button
            onClick={() => {}}
            className="text-xs font-medium text-primary hover:underline"
          >
            Zeige {filtered.length} von {counts.all} Bewerbungen
          </button>
        </div>
      )}
    </div>
  );
}

function AppStatusPill({ status }: { status: string }) {
  if (status === "accepted")
    return (
      <span className="rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
        Angenommen
      </span>
    );
  if (status === "rejected")
    return (
      <span className="rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
        Abgelehnt
      </span>
    );
  if (status === "cancelled")
    return (
      <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        Zurückgezogen
      </span>
    );
  return (
    <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
      Offen
    </span>
  );
}

/* ---------- Invites tab ---------- */
function InvitesPanel({ vtcId, canManage }: { vtcId?: string; canManage: boolean }) {
  const qc = useQueryClient();
  const fetchInvites = useServerFn(listInvites);
  const mkInvite = useServerFn(createInvite);
  const rmInvite = useServerFn(revokeInvite);

  const { data: invites } = useQuery({
    queryKey: ["invites", vtcId],
    queryFn: () => fetchInvites({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId && !!canManage,
  });

  const [inviteRole, setInviteRole] = useState<Role>("driver");
  const [days, setDays] = useState(7);

  if (!canManage) {
    return (
      <div className="panel p-8 text-sm text-muted-foreground">
        Nur Owner oder Admins können Einladungscodes verwalten.
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Einladungscodes</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Erstelle Codes, die Fahrer bei der Registrierung eingeben können.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="h-9 rounded-md border border-border bg-surface-2 px-2 text-xs"
          >
            {ROLES.filter((r) => r !== "owner").map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-surface-2 px-2 text-xs"
          >
            {[1, 3, 7, 14, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d} Tage
              </option>
            ))}
          </select>
          <button
            onClick={async () => {
              try {
                await mkInvite({ data: { vtcId: vtcId!, role: inviteRole, expiresInDays: days } });
                toast.success("Einladung erstellt");
                qc.invalidateQueries({ queryKey: ["invites", vtcId] });
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Fehler");
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-3.5" /> Erstellen
          </button>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
        {(invites ?? []).map((i) => {
          const expired = i.expires_at ? new Date(i.expires_at).getTime() < Date.now() : false;
          return (
            <div
              key={i.id}
              className="flex items-center justify-between bg-surface-2/40 px-4 py-3"
            >
              <div>
                <div className="num text-sm font-semibold tracking-wider">{i.code}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <RoleBadge role={i.role as Role} />
                  <span>·</span>
                  <span>
                    {expired ? "Abgelaufen am " : "Läuft ab "}
                    {dt(i.expires_at ?? "")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(i.code);
                    toast.success("Code kopiert");
                  }}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("Einladungscode wirklich löschen?")) return;
                    await rmInvite({ data: { inviteId: i.id } });
                    qc.invalidateQueries({ queryKey: ["invites", vtcId] });
                  }}
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
        {invites && invites.length === 0 && (
          <div className="bg-surface-2/40 px-4 py-8 text-center text-xs text-muted-foreground">
            Keine offenen Einladungscodes.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Roles matrix ---------- */
function RolesMatrix() {
  const permissions: { key: string; label: string; roles: Role[] }[] = [
    { key: "view_drivers", label: "Fahrer ansehen", roles: ["owner", "admin", "dispatcher", "driver"] },
    { key: "edit_drivers", label: "Fahrer bearbeiten", roles: ["owner", "admin"] },
    { key: "assign_roles", label: "Rollen vergeben", roles: ["owner"] },
    { key: "remove_drivers", label: "Fahrer entfernen", roles: ["owner", "admin"] },
    { key: "read_applications", label: "Bewerbungen lesen", roles: ["owner", "admin"] },
    { key: "decide_applications", label: "Bewerbungen entscheiden", roles: ["owner", "admin"] },
    { key: "create_invites", label: "Einladungscodes erstellen", roles: ["owner", "admin"] },
    { key: "revoke_invites", label: "Einladungscodes deaktivieren", roles: ["owner", "admin"] },
    { key: "assign_jobs", label: "Aufträge zuweisen", roles: ["owner", "admin", "dispatcher"] },
    { key: "pay_drivers", label: "Lohnauszahlung", roles: ["owner", "admin", "dispatcher"] },
    { key: "view_finance", label: "Finanzen einsehen", roles: ["owner", "admin"] },
    { key: "manage_vtc", label: "VTC-Einstellungen", roles: ["owner"] },
  ];

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <ShieldCheck className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Rollen & Rechte</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          Standard-Berechtigungsmatrix pro Rolle
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-5 py-3 font-medium">Berechtigung</th>
              {ROLES.map((r) => (
                <th key={r} className="px-5 py-3 text-center font-medium">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.map((p) => (
              <tr key={p.key} className="border-t border-border/60">
                <td className="px-5 py-3 font-medium">{p.label}</td>
                {ROLES.map((r) => (
                  <td key={r} className="px-5 py-3 text-center">
                    {p.roles.includes(r) ? (
                      <Check className="mx-auto size-4 text-primary" />
                    ) : (
                      <X className="mx-auto size-4 text-muted-foreground/40" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Profiles grid ---------- */
function ProfilesGrid({ rows, slug }: { rows: any[]; slug: string }) {
  void slug;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((m) => (
        <div key={m.user_id} className="panel p-4">
          <div className="flex items-center gap-3">
            <Avatar name={m.profile.display_name} url={m.profile.avatar_url} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{m.profile.display_name}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <RoleBadge role={m.role} />
                <StatusBadge online={m.online} inJob={m.inJob} />
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Touren" value={m.stats.jobs} />
            <Stat label="Kilometer" value={km(m.stats.km)} />
            <Stat label="Beigetreten" value={dt(m.joined_at)} small />
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="panel col-span-full p-8 text-center text-sm text-muted-foreground">
          Keine Fahrer gefunden.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-surface-2/40 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 font-semibold tabular-nums", small && "text-xs")}>{value}</div>
    </div>
  );
}

/* ---------- Activity placeholder ---------- */
function ActivityPlaceholder() {
  return (
    <div className="panel p-8">
      <div className="flex items-start gap-3">
        <div className="grid size-10 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
          <Clock className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Aktivitätsverlauf</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Sobald das Audit-Log aktiviert ist, findest du hier alle relevanten administrativen
            Aktionen: Rollenwechsel, Bewerbungsentscheidungen, erstellte Einladungscodes und mehr.
            Dieses Modul folgt in einem der nächsten Updates.
          </p>
        </div>
      </div>
    </div>
  );
}
