import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Truck,
  ShieldCheck,
  Gamepad2,
  Rocket,
  Headphones,
  Globe2,
  Users,
  ClipboardList,
  Wallet,
  BarChart3,
  MapPin,
  FileText,
  CalendarDays,
  Receipt,
  Car,
  Trophy,
  ArrowRight,
  PlayCircle,
  CheckCircle2,
  Menu,
  X,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { listNews } from "@/lib/news.functions";
import { listPublicVtcs } from "@/lib/public.functions";
import { getGlobalStats } from "@/lib/stats.functions";
import { currency, km } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import heroTruck from "@/assets/hero-truck.jpg";

function useIsAuthenticated() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return authed;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VTC Hub – Die All-in-One Plattform für virtuelle Speditionen" },
      {
        name: "description",
        content:
          "VTC Hub verbindet Community, Organisation und Performance in einer modernen Plattform für ETS2 & ATS. Fahrer, Aufträge, Abrechnungen, Events, Fahrzeuge und Statistiken an einem Ort.",
      },
      { property: "og:title", content: "VTC Hub – Die All-in-One Plattform für virtuelle Speditionen" },
      {
        property: "og:description",
        content:
          "Verwalte Fahrer, Aufträge, Abrechnungen, Events und Fahrzeuge zentral. Kostenlos starten – 14 Tage testen.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

const modules = [
  { icon: Users, title: "Fahrer & Community", desc: "Verwalte deine Fahrer, Rollen, Bewerbungen und fördere deine Community." },
  { icon: ClipboardList, title: "Aufträge & Touren", desc: "Erstelle, verwalte und überwache Aufträge in Echtzeit mit Smart Resume." },
  { icon: Wallet, title: "Abrechnungen", desc: "Transparente Abrechnungen, manuelle Lohnfestlegung, Boni und Abzüge." },
  { icon: BarChart3, title: "Statistiken & Analysen", desc: "Detaillierte Statistiken und Analysen für bessere Entscheidungen." },
  { icon: MapPin, title: "Live-Tracking", desc: "Verfolge deine Fahrer in Echtzeit auf der Live-Karte mit Telemetrie-Daten." },
  { icon: FileText, title: "Dokumente & mehr", desc: "Dokumentenverwaltung, Events, Nachrichten, Fuhrpark und vieles mehr." },
  { icon: CalendarDays, title: "Events & Konvois", desc: "Plane Konvois, verwalte Teilnehmer und dokumentiere jedes Event." },
  { icon: Receipt, title: "Kosten & Service", desc: "Erfasse Kraftstoff, Wartung und Reparaturen für jede Tour und jedes Fahrzeug." },
  { icon: Car, title: "Fuhrpark", desc: "Behalte deinen kompletten Fahrzeugbestand samt Wartungsplan im Blick." },
  { icon: Trophy, title: "Fahrerkarriere", desc: "XP, Ränge, Erfolge und Badges – ein Karrieresystem, das motiviert." },
];

const benefits = [
  { icon: ShieldCheck, title: "Datenschutzorientiert entwickelt", desc: "Deine Daten liegen in sicheren europäischen Rechenzentren." },
  { icon: Gamepad2, title: "Entwickelt für Gamer", desc: "Speziell für ETS2 & ATS – mit nativem Telemetrie-Client." },
  { icon: Rocket, title: "Regelmäßige Updates", desc: "Neue Features und Verbesserungen werden ständig ergänzt." },
  { icon: Headphones, title: "Starker Support", desc: "Unser Team ist da, wenn du Hilfe brauchst." },
  { icon: Globe2, title: "Global & Mehrsprachig", desc: "Verfügbar für VTCs weltweit." },
];


function Header() {
  const authed = useIsAuthenticated();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function handleLogout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
            <Truck className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight">VTC Hub</div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">
              Deine Spedition. Deine Community. Deine Werte.
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground lg:flex">
          <a href="#funktionen" className="hover:text-foreground">Funktionen</a>
          <a href="#vorteile" className="hover:text-foreground">Vorteile</a>
          <a href="#module" className="hover:text-foreground">Module</a>
          <a href="#vtcs" className="hover:text-foreground">VTCs</a>
          <a href="#support" className="hover:text-foreground">Support</a>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            to="/demo"
            className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm font-medium hover:border-primary/50 hover:text-primary"
          >
            Demo-VTC
          </Link>
          {authed ? (
            <>
              <Link
                to="/app"
                className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm font-medium hover:border-primary/50"
              >
                Zum Dashboard
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm font-medium hover:border-destructive/50 hover:text-destructive"
              >
                <LogOut className="size-4" /> Ausloggen
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                search={{ mode: "signin" }}
                className="rounded-lg border border-border bg-surface/60 px-4 py-2 text-sm font-medium hover:border-primary/50"
              >
                Anmelden
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_hsl(var(--primary)/0.6)] hover:brightness-110"
              >
                Registrieren
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid size-10 place-items-center rounded-lg border border-border md:hidden"
          aria-label="Menü"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/40 bg-background/95 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-4 text-sm">
            <a href="#module" onClick={() => setOpen(false)}>Module</a>
            <a href="#vtcs" onClick={() => setOpen(false)}>VTCs</a>
            <a href="#vorteile" onClick={() => setOpen(false)}>Vorteile</a>
            <div className="mt-2 flex flex-col gap-2">
              <Link to="/demo" className="rounded-lg border border-border px-4 py-2 text-center">Demo-VTC</Link>
              {authed ? (
                <>
                  <Link to="/app" className="rounded-lg border border-border px-4 py-2 text-center">Zum Dashboard</Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg border border-border px-4 py-2 text-center"
                  >
                    Ausloggen
                  </button>
                </>
              ) : (
                <>
                  <Link to="/auth" search={{ mode: "signin" }} className="rounded-lg border border-border px-4 py-2 text-center">Anmelden</Link>
                  <Link to="/auth" search={{ mode: "signup" }} className="rounded-lg bg-primary px-4 py-2 text-center font-semibold text-primary-foreground">Registrieren</Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const authed = useIsAuthenticated();
  const fetchStats = useServerFn(getGlobalStats);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["landing-stats"],
    queryFn: () => fetchStats(),
    staleTime: 60_000,
  });

  const items = [
    { label: "Aktive Fahrer", value: isLoading ? "0" : String(stats?.activeDrivers ?? 0) },
    { label: "Aktive Aufträge", value: isLoading ? "0" : String(stats?.activeJobs ?? 0) },
    { label: "Gefahrene Kilometer", value: isLoading ? "0" : km(stats?.totalKm ?? 0) },
    { label: "Umsatz", value: isLoading ? "0" : currency(stats?.totalRevenue ?? 0) },
    { label: "Gewinn", value: isLoading ? "0" : currency(stats?.totalProfit ?? 0) },
  ];

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(1200px 500px at 80% 10%, hsl(var(--primary)/0.18), transparent 60%), radial-gradient(800px 400px at 10% 90%, hsl(var(--primary)/0.10), transparent 60%)",
        }}
      />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <h1 className="text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Die All-in-One Plattform
            <br /> für <span className="text-primary">deine VTC</span>
          </h1>
          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Verwalte deine Fahrer, Aufträge, Abrechnungen, Events, Fahrzeuge und Statistiken zentral an einem Ort. VTC Hub verbindet Community, Organisation und Performance in einer modernen Plattform.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {authed ? (
              <Link
                to="/profile"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-6px_hsl(var(--primary)/0.7)] transition hover:brightness-110"
              >
                VTC erstellen <ArrowRight className="size-4" />
              </Link>
            ) : (
              <Link
                to="/auth"
                search={{ mode: "signup", redirect: "/profile" }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_0_30px_-6px_hsl(var(--primary)/0.7)] transition hover:brightness-110"
              >
                VTC erstellen <ArrowRight className="size-4" />
              </Link>
            )}
            <Link
              to="/demo"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/60 px-6 py-3.5 text-sm font-semibold hover:border-primary/50 hover:text-primary"
            >
              <PlayCircle className="size-4" /> Demo-VTC betreten
            </Link>
          </div>


          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> Für alle VTCs</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> Sicher &amp; Zuverlässig</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" /> Entwickelt für ETS2 &amp; ATS</span>
          </div>

          <p className="mt-4 text-xs text-muted-foreground max-w-lg">
            Du möchtest die Plattform erstmal ausprobieren? Kein Problem! Nutze unseren 14-tägigen Demo-Zugang und entdecke alle Features unserer virtuellen Speditionssoftware völlig risikofrei.
          </p>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/20 via-transparent to-transparent blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/40 shadow-2xl">
            <img
              src={heroTruck}
              alt="Schwarzer Sattelzug mit VTC-Hub-Branding, nachts auf einer Straße vor einer Weltkarte aus grünen Verbindungspunkten"
              width={1600}
              height={1200}
              fetchPriority="high"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* KPI bar */}
      <div className="mx-auto max-w-7xl px-6 pb-16">
        <div className="panel grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((k) => (
            <div key={k.label} className="min-w-0 rounded-xl border border-border/40 bg-surface-2/40 p-4">
              <div className="truncate text-xs uppercase tracking-widest text-muted-foreground">{k.label}</div>
              <div className="mt-2 truncate text-lg font-bold text-foreground">{k.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VtcSlider() {
  const authed = useIsAuthenticated();
  const fetchVtcs = useServerFn(listPublicVtcs);
  const { data, isLoading } = useQuery({
    queryKey: ["public-vtcs-landing"],
    queryFn: () => fetchVtcs(),
    staleTime: 60_000,
  });
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  useEffect(() => {
    if (prefersReducedMotion || paused) return;
    const el = trackRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (el.scrollWidth > el.clientWidth) {
        el.scrollLeft += (dt / 1000) * 40; // 40px/s
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1) el.scrollLeft = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, prefersReducedMotion, data]);

  const items = data ?? [];

  function applyHref(slug: string) {
    if (authed) return { to: `/discover/${slug}` } as const;
    return { to: "/auth", search: { mode: "signup", redirect: `/discover/${slug}` } } as const;
  }

  return (
    <section id="vtcs" className="border-t border-border/60 bg-surface/20">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex items-end justify-between gap-6">
          <div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Entdecke aktive VTCs</h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              Öffentlich gelistete Speditionen auf VTC Hub – finde deine Community und bewirb dich direkt.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="mt-8 h-56 animate-pulse rounded-2xl border border-border/60 bg-surface/40" />
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aktuell sind noch keine öffentlichen VTCs gelistet.
            </p>
            <p className="mt-2 text-sm">
              Registriere dich und gründe die erste Community auf VTC Hub.
            </p>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
            >
              Jetzt registrieren
            </Link>
          </div>
        ) : (
          <div
            ref={trackRef}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            className="mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:thin]"
          >
            {items.map((v) => {
              const href = applyHref(v.slug);
              return (
                <article
                  key={v.id}
                  className="group relative flex w-[85%] shrink-0 snap-start flex-col rounded-2xl border border-border/60 bg-surface/60 p-5 transition-colors hover:border-primary/40 sm:w-[48%] lg:w-[32%]"
                >
                  <div className="flex items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border/60 bg-surface-2 text-xs font-semibold text-primary">
                      {v.logo_url ? (
                        <img src={v.logo_url} alt={`${v.name} Logo`} className="h-full w-full object-cover" />
                      ) : (
                        <span>[{v.tag}]</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{v.name}</div>
                      <div className="truncate text-[11px] uppercase tracking-widest text-muted-foreground">[{v.tag}]</div>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-3 min-h-[3.75rem] text-sm text-muted-foreground">
                    {v.description || "Keine Beschreibung angegeben."}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      to="/s/$slug"
                      params={{ slug: v.slug }}
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border bg-surface/60 px-3 py-2 text-xs font-medium hover:border-primary/50 hover:text-primary"
                    >
                      <ExternalLink className="size-3.5" /> VTC ansehen
                    </Link>
                    <Link
                      {...(href as any)}
                      className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
                    >
                      Bei dieser VTC bewerben
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Modules() {
  return (
    <section id="module" className="mx-auto max-w-7xl px-6 py-16">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Alle Module auf einen Blick</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          VTC Hub bietet dir alle Werkzeuge, die du für eine erfolgreiche Spedition brauchst.
        </p>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => (
          <div
            key={m.title}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-surface/50 p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <m.icon className="size-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">{m.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{m.desc}</p>
            <a href="#module" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-80 group-hover:opacity-100">
              Mehr erfahren <ArrowRight className="size-3" />
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

function Benefits() {
  return (
    <section id="vorteile" className="border-t border-border/60 bg-surface/30">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {benefits.map((b) => (
            <div key={b.title} className="rounded-2xl border border-border/60 bg-surface/50 p-5">
              <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="size-5" />
              </div>
              <h3 className="mt-3 text-sm font-semibold">{b.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NewsFeed() {
  const fetchNews = useServerFn(listNews);
  const { data } = useQuery({
    queryKey: ["public-news"],
    queryFn: () => fetchNews(),
    staleTime: 60_000,
  });
  const items = (data ?? []).slice(0, 3);
  if (!items.length) return null;
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Neuigkeiten</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {items.map((n) => (
          <article key={n.id} className="rounded-2xl border border-border/60 bg-surface/50 p-6">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {new Date(n.created_at).toLocaleDateString("de-DE")}
            </div>
            <h3 className="mt-2 text-base font-semibold">{n.title}</h3>
            <p className="mt-2 line-clamp-4 text-sm text-muted-foreground whitespace-pre-line">{n.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Footer() {
  const [visitors, setVisitors] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = "vtc_hub_visit_counted";
    const alreadyCounted = typeof window !== "undefined" && sessionStorage.getItem(key);
    const load = async () => {
      if (alreadyCounted) {
        const { data } = await supabase.from("site_visits").select("count").eq("id", 1).maybeSingle();
        if (!cancelled && data) setVisitors(Number(data.count));
        return;
      }
      const { data, error } = await supabase.rpc("increment_site_visits");
      if (!cancelled && !error && typeof data === "number") {
        setVisitors(data);
        try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
            <Truck className="size-4" />
          </div>
          <div className="text-sm">
            <div className="font-semibold">VTC Hub</div>
            <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} VTC Hub. Alle Rechte vorbehalten.</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <a href="#module" className="hover:text-foreground">Module</a>
          <a href="#vorteile" className="hover:text-foreground">Vorteile</a>
          <a href="#support" className="hover:text-foreground">Support</a>
          <Link to="/demo" className="hover:text-foreground">Demo</Link>
          <span className="text-muted-foreground/80">Besucher: {visitors != null ? visitors.toLocaleString("de-DE") : "…"}</span>
        </div>
      </div>
    </footer>
  );
}


function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <VtcSlider />
      <Modules />
      <Benefits />
      <NewsFeed />
      <Footer />
    </div>
  );
}
