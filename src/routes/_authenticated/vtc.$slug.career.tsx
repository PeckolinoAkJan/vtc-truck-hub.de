import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Trophy, Star, Crown, Shield, Award, Route as RouteIcon, Map, HardHat, Truck,
  Package, Boxes, Milestone, Fuel, Users, Moon, Handshake, Leaf,
  Sparkles, Target, Flame, TrendingUp, Clock, Calendar, Gauge, Lock, CheckCircle2,
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { getCareerOverview, getCareerLeaderboard, getCareerConfig } from "@/lib/career.functions";
import { getVtcContext } from "@/lib/vtcs.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/career")({
  component: CareerPage,
});

const ICONS: Record<string, typeof Trophy> = {
  shield: Shield, truck: Truck, "hard-hat": HardHat, route: RouteIcon, map: Map,
  star: Star, award: Award, crown: Crown, trophy: Trophy,
  package: Package, boxes: Boxes, milestone: Milestone, fuel: Fuel, users: Users,
  moon: Moon, handshake: Handshake, leaf: Leaf,
};
const RARITY_STYLE: Record<string, string> = {
  common: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  rare: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  epic: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10",
  legendary: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  mythic: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
};

function Icon({ name, className, style }: { name: string | null | undefined; className?: string; style?: React.CSSProperties }) {
  const C = (name && ICONS[name]) || Trophy;
  return <C className={className} style={style} />;
}

function Panel({ title, children, className = "" }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel p-5 ${className}`}>
      {title && <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>}
      {children}
    </section>
  );
}

function fmtNum(n: number) { return new Intl.NumberFormat("de-DE").format(Math.round(n)); }
function fmtDate(s: string | null) { return s ? new Date(s).toLocaleDateString("de-DE") : "—"; }

function CareerPage() {
  const { slug } = useParams({ from: "/_authenticated/vtc/$slug/career" });
  const ctxFn = useServerFn(getVtcContext);
  const overviewFn = useServerFn(getCareerOverview);
  const leaderboardFn = useServerFn(getCareerLeaderboard);
  const configFn = useServerFn(getCareerConfig);

  const ctxQ = useQuery({ queryKey: ["vtc-ctx", slug], queryFn: () => ctxFn({ data: { slug } }) });
  const vtcId = ctxQ.data?.vtc.id;
  const isAdmin = ctxQ.data?.role === "owner" || ctxQ.data?.role === "admin";

  const overviewQ = useQuery({
    queryKey: ["career-overview", vtcId], enabled: !!vtcId,
    queryFn: () => overviewFn({ data: { vtcId: vtcId! } }),
  });
  const configQ = useQuery({
    queryKey: ["career-config", vtcId], enabled: !!vtcId,
    queryFn: () => configFn({ data: { vtcId: vtcId! } }),
  });

  const [lbMetric, setLbMetric] = useState<"xp" | "level" | "km" | "jobs" | "economy" | "convoys">("xp");
  const [lbPeriod, setLbPeriod] = useState<"week" | "month" | "year" | "all">("week");
  const lbQ = useQuery({
    queryKey: ["career-lb", vtcId, lbMetric, lbPeriod], enabled: !!vtcId,
    queryFn: () => leaderboardFn({ data: { vtcId: vtcId!, metric: lbMetric, period: lbPeriod } }),
  });

  const [achFilter, setAchFilter] = useState<string>("all");
  const [seasonTab, setSeasonTab] = useState<"daily" | "weekly" | "monthly" | "season">("daily");

  const overview = overviewQ.data;
  const config = configQ.data;

  const rarityCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, common: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 };
    (overview?.achievements ?? []).forEach((a) => { c.all += 1; c[a.rarity] = (c[a.rarity] ?? 0) + 1; });
    return c;
  }, [overview?.achievements]);

  const filteredAch = useMemo(() => {
    const list = overview?.achievements ?? [];
    return achFilter === "all" ? list : list.filter((a) => a.rarity === achFilter);
  }, [overview?.achievements, achFilter]);

  if (ctxQ.isLoading || overviewQ.isLoading) {
    return <div className="p-8 text-muted-foreground">Karriere wird geladen…</div>;
  }
  if (!overview) return <div className="p-8 text-destructive">Karriere-Daten nicht verfügbar.</div>;

  const { profile, xp, kpis, badges, goals, history, charts, rating, achievements } = overview;
  const xpToNext = xp.remaining;
  const unlockedAch = achievements.filter((a) => a.unlocked).length;
  const totalAch = achievements.length;
  const activeBadges = badges.filter((b) => b.unlocked);

  const goalsForTab = goals.filter((g) => g.period === seasonTab);
  const dailyDone = goalsForTab.filter((g) => g.progress >= 1).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Karriere" subtitle="Level, Ränge, Erfolge & Ziele – dein Fortschritt auf einen Blick." icon={Trophy} />

      {/* Row 1: profile / level / achievements teaser */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 1. KARRIERE ÜBERSICHT */}
        <Panel title="1. Karriere Übersicht (Fahrerprofil)" className="xl:col-span-1">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="grid size-20 place-items-center rounded-full border-2 border-primary/60 bg-primary/10 text-2xl font-bold text-primary">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="size-full rounded-full object-cover" /> : profile.displayName.slice(0, 1)}
              </div>
              <span className="absolute bottom-0 right-0 grid size-5 place-items-center rounded-full bg-emerald-500 text-[10px] text-white ring-2 ring-background">●</span>
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold">{profile.displayName}</div>
              <div className="text-sm text-primary">{xp.rank.name}</div>
              <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
                <span>Mitglied seit</span><span className="text-right text-foreground">{fmtDate(profile.memberSince)}</span>
                <span>Fahrer ID</span><span className="text-right text-foreground">{profile.driverId}</span>
                <span>Status</span><span className="text-right text-emerald-400">● Online</span>
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-2 text-center">
            <Kpi label="Gesamt km" value={fmtNum(kpis.totalKm)} />
            <Kpi label="Aufträge" value={fmtNum(kpis.totalJobs)} />
            <Kpi label="Spielzeit" value={`${fmtNum(kpis.playtimeH)} h`} />
            <Kpi label="Aktive Tage" value={fmtNum(kpis.activeDays)} />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Aktueller Rang</div>
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Icon name={xp.rank.icon} className="size-8" style={{ color: xp.rank.color ?? "#22c55e" } as React.CSSProperties} />
              <div className="flex-1">
                <div className="text-sm font-semibold">{xp.rank.name}</div>
                <div className="text-xs text-muted-foreground">{fmtNum(xp.total)} / {xp.nextRank ? fmtNum(xp.nextRank.min_xp) : "MAX"} XP</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Rang-Fortschritt</span><span>{Math.round(xp.rankProgress * 100)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${xp.rankProgress * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Karriere Bewertung</div>
              <div className="mt-1 flex items-center gap-2 text-2xl font-bold text-amber-400">
                {rating.toFixed(1)} <span className="text-sm text-muted-foreground">/ 5.0</span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Karriere Übersicht</div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 text-xs">
                <span>Erfolge</span><span className="text-right">{unlockedAch}/{totalAch}</span>
                <span>Badges</span><span className="text-right">{activeBadges.length}</span>
                <span>Konvois</span><span className="text-right">{kpis.convoys}</span>
              </div>
            </div>
          </div>
        </Panel>

        {/* 2. LEVEL & RANGSYSTEM */}
        <Panel title="2. Level & Rangsystem">
          <div className="flex items-center gap-4">
            <div className="relative grid size-28 place-items-center rounded-full border-4 border-primary/40 bg-primary/10">
              <div className="absolute inset-0 rounded-full" style={{
                background: `conic-gradient(rgb(34 197 94) ${xp.rankProgress * 360}deg, rgb(30 41 59) 0)`,
                mask: "radial-gradient(farthest-side, transparent 55%, black 56%)",
                WebkitMask: "radial-gradient(farthest-side, transparent 55%, black 56%)",
              }} />
              <div className="text-3xl font-bold text-primary">{xp.level}</div>
            </div>
            <div className="flex-1 text-sm">
              <div className="text-muted-foreground">{fmtNum(xp.total)} XP</div>
              <div className="font-semibold">Noch {fmtNum(xpToNext)} XP bis {xp.nextRank?.name ?? "Max Level"}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">XP Verteilung</div>
            <div className="space-y-1.5 text-sm">
              <XpRow label="Aufträge" v={xp.breakdown.jobs} max={xp.total} />
              <XpRow label="Kilometer" v={xp.breakdown.km} max={xp.total} />
              <XpRow label="Wirtschaftlich" v={xp.breakdown.economic} max={xp.total} />
              <XpRow label="Konvois" v={xp.breakdown.convoys} max={xp.total} />
              <XpRow label="Aktivität" v={xp.breakdown.activity} max={xp.total} />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Rangsystem</div>
            <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
              {(config?.ranks ?? []).map((r) => {
                const active = r.name === xp.rank.name;
                const passed = xp.total > (r.max_xp ?? Infinity);
                return (
                  <div key={r.sort} className={`flex items-center gap-3 rounded-lg border p-2 text-sm ${active ? "border-primary bg-primary/10" : "border-border/60 bg-muted/20"}`}>
                    <Icon name={r.icon} className="size-5" style={{ color: r.color ?? undefined } as React.CSSProperties} />
                    <div className="flex-1">
                      <div className={`font-medium ${active ? "text-primary" : ""}`}>{r.name}</div>
                      <div className="text-xs text-muted-foreground">{fmtNum(r.min_xp)} – {r.max_xp ? fmtNum(r.max_xp) : "∞"} XP</div>
                    </div>
                    {passed && <CheckCircle2 className="size-4 text-emerald-400" />}
                    {!active && !passed && r.min_xp > xp.total && <Lock className="size-4 text-muted-foreground" />}
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        {/* 3. ERFOLGE */}
        <Panel title="3. Erfolge (Achievements)">
          <div className="mb-3 flex flex-wrap gap-1 text-xs">
            {(["all", "common", "rare", "epic", "legendary", "mythic"] as const).map((r) => (
              <button key={r}
                onClick={() => setAchFilter(r)}
                className={`rounded-full border px-2 py-0.5 ${achFilter === r ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {r === "all" ? "Alle" : r.charAt(0).toUpperCase() + r.slice(1)} ({rarityCounts[r] ?? 0})
              </button>
            ))}
          </div>
          <div className="grid max-h-96 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {filteredAch.map((a) => (
              <div key={a.key} className={`relative rounded-lg border p-3 ${RARITY_STYLE[a.rarity] ?? ""} ${!a.unlocked ? "opacity-60 grayscale" : ""}`}>
                <Icon name={a.icon} className="mb-1 size-6" />
                <div className="text-xs font-semibold">{a.name}</div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{a.description}</div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full bg-primary" style={{ width: `${a.progress * 100}%` }} />
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider">{a.rarity}</div>
                {!a.unlocked && <Lock className="absolute right-2 top-2 size-3 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Fortschritt</span>
            <span>{unlockedAch} / {totalAch} freigeschaltet ({Math.round((unlockedAch / Math.max(1, totalAch)) * 100)}%)</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${(unlockedAch / Math.max(1, totalAch)) * 100}%` }} />
          </div>
        </Panel>
      </div>

      {/* Row 2: leaderboard / stats / badges */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 4. RANGLISTEN */}
        <Panel title="4. Ranglisten">
          <div className="mb-3 flex flex-wrap gap-1 text-xs">
            {(["xp", "level", "km", "jobs", "economy", "convoys"] as const).map((m) => (
              <button key={m} onClick={() => setLbMetric(m)}
                className={`rounded-full border px-2 py-0.5 ${lbMetric === m ? "border-primary bg-primary/20 text-primary" : "border-border text-muted-foreground"}`}>
                {m === "xp" ? "XP" : m === "level" ? "Level" : m === "km" ? "Kilometer" : m === "jobs" ? "Aufträge" : m === "economy" ? "Wirtschaftlichkeit" : "Konvois"}
              </button>
            ))}
          </div>
          <div className="mb-3 flex gap-1 text-xs">
            {(["week", "month", "year", "all"] as const).map((p) => (
              <button key={p} onClick={() => setLbPeriod(p)}
                className={`rounded-md border px-2 py-1 ${lbPeriod === p ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {p === "week" ? "Diese Woche" : p === "month" ? "Monat" : p === "year" ? "Jahr" : "Gesamt"}
              </button>
            ))}
          </div>
          <div className="max-h-80 overflow-y-auto text-sm">
            <table className="w-full">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="text-left">#</th><th className="text-left">Fahrer</th><th className="text-left">Rang</th><th className="text-right">Wert</th></tr>
              </thead>
              <tbody>
                {(lbQ.data ?? []).map((r, i) => {
                  const val = lbMetric === "xp" ? `${fmtNum(r.xp)} XP`
                    : lbMetric === "level" ? r.level
                    : lbMetric === "km" ? `${fmtNum(r.km)} km`
                    : lbMetric === "jobs" ? r.jobs
                    : lbMetric === "economy" ? `${r.economy} l/100`
                    : r.convoys;
                  const isMe = r.userId === overview.profile.userId;
                  return (
                    <tr key={r.userId} className={`border-t border-border/50 ${isMe ? "bg-primary/5 text-primary" : ""}`}>
                      <td className="py-1.5">{i + 1}</td>
                      <td className="py-1.5">{r.displayName}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{r.rankName}</td>
                      <td className="py-1.5 text-right font-mono">{val}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* 5. KARRIERE STATISTIKEN */}
        <Panel title="5. Karriere Statistiken">
          <div className="grid grid-cols-2 gap-3">
            <MiniKpi icon={Sparkles} label="Gesamt XP" value={fmtNum(xp.total)} />
            <MiniKpi icon={TrendingUp} label="Level" value={String(xp.level)} />
            <MiniKpi icon={Package} label="Aufträge" value={fmtNum(kpis.totalJobs)} />
            <MiniKpi icon={RouteIcon} label="Kilometer" value={`${fmtNum(kpis.totalKm)} km`} />
            <MiniKpi icon={Clock} label="Spielzeit" value={`${fmtNum(kpis.playtimeH)} h`} />
            <MiniKpi icon={Gauge} label="Ø Verbrauch" value={`${kpis.avgFuelPer100} l/100`} />
          </div>

          <div className="mt-4 h-40">
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">XP Entwicklung</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.xpSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Line type="monotone" dataKey="xp" stroke="#22c55e" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 h-40">
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Aktivität</div>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.activity}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="jobs" name="Aufträge" fill="#22c55e" />
                <Bar dataKey="km" name="km (×1k)" fill="#a78bfa" />
                <Bar dataKey="playtime" name="Spielzeit (h)" fill="#38bdf8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* 6. BADGES */}
        <Panel title="6. Badges & Auszeichnungen">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Aktive Badges ({activeBadges.length})</div>
          <div className="grid grid-cols-3 gap-2">
            {activeBadges.slice(0, 6).map((b) => (
              <div key={b.key} className={`rounded-lg border p-2 text-center ${RARITY_STYLE[b.rarity] ?? ""}`}>
                <Icon name={b.icon} className="mx-auto mb-1 size-6" />
                <div className="text-[11px] font-semibold">{b.name}</div>
              </div>
            ))}
            {activeBadges.length === 0 && <div className="col-span-3 py-4 text-center text-xs text-muted-foreground">Noch keine Badges freigeschaltet.</div>}
          </div>

          <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Badge Fortschritt</div>
          <div className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
            {badges.filter((b) => !b.unlocked).slice(0, 6).map((b) => (
              <div key={b.key} className="rounded-lg border border-border/60 bg-muted/20 p-2">
                <div className="flex items-center gap-2 text-sm">
                  <Icon name={b.icon} className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{Math.round(b.progress * 100)}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/30">
                  <div className="h-full bg-primary" style={{ width: `${b.progress * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* Row 3: history / goals / admin */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* 7. HISTORIE */}
        <Panel title="7. Karriere Historie">
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {history.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Noch keine Ereignisse.</div>}
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/20 p-2 text-sm">
                <Flame className="mt-0.5 size-4 text-primary" />
                <div className="flex-1">
                  <div className="font-medium">{h.title}</div>
                  {h.description && <div className="text-xs text-muted-foreground">{h.description}</div>}
                </div>
                <span className="text-xs text-muted-foreground">{fmtDate(h.created_at)}</span>
              </div>
            ))}
          </div>
        </Panel>

        {/* 8. ZIELE & AUFGABEN */}
        <Panel title="8. Ziele & Aufgaben">
          <div className="mb-3 flex gap-1 text-xs">
            {(["daily", "weekly", "monthly", "season"] as const).map((p) => (
              <button key={p} onClick={() => setSeasonTab(p)}
                className={`rounded-md border px-2 py-1 ${seasonTab === p ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {p === "daily" ? "Tagesziele" : p === "weekly" ? "Wochenziele" : p === "monthly" ? "Monatsziele" : "Saisonziele"}
              </button>
            ))}
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {goalsForTab.map((g, i) => (
              <div key={i} className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 size-4 text-primary" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{g.name}</div>
                    <div className="text-xs text-muted-foreground">{g.description}</div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{fmtNum(g.current)} / {fmtNum(g.target)}</span>
                      <span className="text-primary">+{g.xp_reward} XP</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/30">
                      <div className="h-full bg-primary" style={{ width: `${g.progress * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {goalsForTab.length === 0 && <div className="py-6 text-center text-xs text-muted-foreground">Keine Ziele in dieser Periode.</div>}
          </div>
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-center gap-2 text-amber-400"><Sparkles className="size-4" /> Tagesbonus</div>
            <div className="mt-1 text-xs text-muted-foreground">Alle Ziele abschließen und <b className="text-amber-300">+1.000 XP Bonus</b> erhalten!</div>
            <div className="mt-2 text-xs">Fortschritt: {dailyDone} / {goalsForTab.length}</div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div className="h-full bg-amber-400" style={{ width: `${goalsForTab.length ? (dailyDone / goalsForTab.length) * 100 : 0}%` }} />
            </div>
          </div>
        </Panel>

        {/* 9. ADMIN */}
        <Panel title="9. Karriereverwaltung">
          {!isAdmin ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <Lock className="size-8" />
              <div>Nur für Owner & Admins.</div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">XP Regeln</div>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {(config?.rules ?? []).map((r) => (
                    <div key={r.rule_key} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                      <span className="truncate">{r.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-primary">+{r.xp_amount} XP</span>
                        <span className={`size-2 rounded-full ${r.active ? "bg-emerald-500" : "bg-slate-500"}`} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Ränge</div>
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                  {(config?.ranks ?? []).map((r) => (
                    <div key={r.sort} className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2 py-1.5">
                      <span className="flex items-center gap-2"><Icon name={r.icon} className="size-4" style={{ color: r.color ?? undefined } as React.CSSProperties} /> {r.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{fmtNum(r.min_xp)}+</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-muted-foreground">
                <Calendar className="mr-1 inline size-3 text-primary" />
                Erweiterte Verwaltung (Ranks, XP-Regeln, Ziele) läuft rein additiv über <code>vtc_career_*</code>. Default-Konfiguration greift automatisch, wenn keine Einträge existieren.
              </p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function MiniKpi({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" /> {label}
      </div>
      <div className="text-lg font-bold text-primary">{value}</div>
    </div>
  );
}

function XpRow({ label, v, max }: { label: string; v: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (v / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">+{fmtNum(v)} XP</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
