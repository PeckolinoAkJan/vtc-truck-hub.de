import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Truck,
  LayoutDashboard,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  Radio,
  Activity,
  Receipt,
  Car,
  Wallet,
  BarChart3,
  FileText,
  
  Search,
  Bell,
  ChevronDown,
  User,
  CalendarDays,
  UserPlus,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { countPendingJoinRequests } from "@/lib/vtcs.functions";
import { cn } from "@/lib/utils";
import { ClientDownloadButton } from "@/components/ClientDownloadButton";

interface Props {
  slug: string;
  vtc: { id: string; name: string; tag: string };
  role: "owner" | "admin" | "dispatcher" | "driver";
  displayName?: string;
  children: ReactNode;
}

export function VtcShell({ slug, vtc, role, displayName, children }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const canManage = role === "owner" || role === "admin";

  const fetchPending = useServerFn(countPendingJoinRequests);
  const { data: pending } = useQuery({
    queryKey: ["pending-applications", vtc.id],
    queryFn: () => fetchPending({ data: { vtcId: vtc.id } }),
    enabled: !!canManage,
    refetchOnWindowFocus: true,
  });
  const pendingCount = canManage ? (pending?.count ?? 0) : 0;

  // Realtime: refresh badge when applications change
  useEffect(() => {
    if (!canManage) return;
    const channel = supabase
      .channel(`shell-applications:${vtc.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vtc_join_requests", filter: `vtc_id=eq.${vtc.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["pending-applications", vtc.id] });
          qc.invalidateQueries({ queryKey: ["applications", vtc.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vtc.id, canManage, qc]);

  const nav = [
    { to: `/vtc/${slug}`, label: "Dashboard", icon: LayoutDashboard, exact: true, badge: 0 },
    { to: `/vtc/${slug}/drivers`, label: "Fahrer", icon: Users, exact: false, badge: 0 },
    { to: `/vtc/${slug}/jobs`, label: "Aufträge", icon: ClipboardList, exact: false, badge: 0 },
    { to: `/vtc/${slug}/billing`, label: "Abrechnungen", icon: Receipt, exact: false, badge: 0 },
    ...(canManage
      ? [{ to: `/vtc/${slug}/applications`, label: "Bewerbungen", icon: UserPlus, exact: false, badge: pendingCount }]
      : []),
    { to: `/vtc/${slug}/stats`, label: "Statistiken", icon: BarChart3, exact: false, badge: 0 },
    { to: `/vtc/${slug}/live`, label: "Live-Karte", icon: Radio, exact: false, badge: 0 },
    { to: `/vtc/${slug}/telemetry`, label: "Telemetry", icon: Activity, exact: false, badge: 0, newBadge: true },
    { to: `/vtc/${slug}/documents`, label: "Dokumente & Nachrichten", icon: FileText, exact: false, badge: 0, newBadge: true },
    { to: `/vtc/${slug}/events`, label: "Events / Konvois", icon: CalendarDays, exact: false, badge: 0 },
    { to: `/vtc/${slug}/costs`, label: "Kosten & Service", icon: Wallet, exact: false, badge: 0 },
    { to: `/vtc/${slug}/fleet`, label: "Fuhrpark", icon: Car, exact: false, badge: 0, newBadge: true },
    { to: `/vtc/${slug}/career`, label: "Karriere", icon: Trophy, exact: false, badge: 0 },
    { to: `/vtc/${slug}/finance`, label: "Finanzen", icon: TrendingUp, exact: false, badge: 0 },
    ...(canManage
      ? [{ to: `/vtc/${slug}/settings`, label: "Einstellungen", icon: Settings, exact: false, badge: 0 }]
      : []),
  ];

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const initials = (displayName ?? vtc.name).slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
            <Truck className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-bold tracking-tight">{vtc.name}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Logistik
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <n.icon className="size-[18px] shrink-0" />
                <span className="truncate">{n.label}</span>
                {n.badge > 0 && (
                  <span
                    className={cn(
                      "ml-auto grid h-5 min-w-[20px] place-items-center rounded-full px-1.5 text-[10px] font-bold",
                      active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-destructive text-white",
                    )}
                  >
                    {n.badge}
                  </span>
                )}
                {"newBadge" in n && n.newBadge && (
                  <span className="ml-auto rounded-md bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    Neu
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/20 text-sm font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{displayName ?? vtc.name}</div>
              <div className="truncate text-[11px] capitalize text-muted-foreground">
                {role} · [{vtc.tag}]
              </div>
            </div>
            <button
              onClick={signOut}
              title="Abmelden"
              className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="hidden flex-1 items-center gap-2 md:flex">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                placeholder="Suchen…"
                className="h-10 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canManage ? (
              <Link
                to={`/vtc/${slug}/applications`}
                className="relative grid size-10 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground"
                title={pendingCount > 0 ? `${pendingCount} offene Bewerbung(en)` : "Bewerbungen"}
              >
                <Bell className="size-[18px]" />
                {pendingCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 grid min-w-4 h-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>
            ) : (
              <button
                className="relative grid size-10 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground"
                title="Benachrichtigungen"
              >
                <Bell className="size-[18px]" />
              </button>
            )}
            <ClientDownloadButton />
            <Link
              to={`/vtc/${slug}/settings`}
              className="grid size-10 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground"
              title="Einstellungen"
            >
              <Settings className="size-[18px]" />
            </Link>
            <Link
              to="/profile"
              className="grid size-10 place-items-center rounded-lg border border-border bg-surface text-muted-foreground hover:text-foreground"
              title="Mein Profil"
            >
              <User className="size-[18px]" />
            </Link>
            <button className="ml-1 hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground md:flex">
              {displayName ?? vtc.name}
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
