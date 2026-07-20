import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Truck,
  Users,
  ClipboardList,
  Wallet,
  BarChart3,
  MapPin,
  FileText,
  CalendarDays,
  Car,
  Trophy,
  Lock,
  ArrowLeft,
  Info,
} from "lucide-react";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "VTC Hub – Demo-VTC (Lesemodus)" },
      {
        name: "description",
        content:
          "Öffentliche Demo einer VTC-Hub-Umgebung. Alle Module ansehen – ohne Registrierung, ausschließlich im Lesemodus.",
      },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: DemoPage,
});

const demoDrivers = [
  { name: "Max Fahrer", km: 12_450, tours: 84, revenue: 42_800 },
  { name: "Lisa Trucker", km: 9_820, tours: 61, revenue: 33_500 },
  { name: "Sven Roadmaster", km: 7_640, tours: 48, revenue: 25_100 },
  { name: "Julia Highway", km: 6_310, tours: 42, revenue: 22_400 },
];

const demoJobs = [
  { id: "DEMO-1042", cargo: "Kühlware", from: "Berlin", to: "Hamburg", km: 289, status: "Unterwegs" },
  { id: "DEMO-1041", cargo: "Baustoffe", from: "München", to: "Stuttgart", km: 224, status: "Genehmigt" },
  { id: "DEMO-1040", cargo: "Elektronik", from: "Köln", to: "Frankfurt", km: 195, status: "Bezahlt" },
  { id: "DEMO-1039", cargo: "Getränke", from: "Leipzig", to: "Dresden", km: 118, status: "Genehmigt" },
];

const demoModules = [
  { icon: Users, title: "Fahrer & Community", desc: "12 Fahrer, 3 offene Bewerbungen (Beispieldaten)." },
  { icon: ClipboardList, title: "Aufträge & Touren", desc: "84 Touren im aktuellen Monat (Beispieldaten)." },
  { icon: Wallet, title: "Abrechnungen", desc: "Beispielhafte Auszahlungen und Boni." },
  { icon: BarChart3, title: "Statistiken & Analysen", desc: "Beispielhafte KPIs und Trends." },
  { icon: MapPin, title: "Live-Tracking", desc: "Demo-Route mit simulierter Telemetrie." },
  { icon: FileText, title: "Dokumente & Nachrichten", desc: "Beispielordner mit Team-Dateien." },
  { icon: CalendarDays, title: "Events & Konvois", desc: "Beispiel-Konvoi am kommenden Wochenende." },
  { icon: Car, title: "Fuhrpark", desc: "8 Beispiel-Fahrzeuge inklusive Wartungsplan." },
  { icon: Trophy, title: "Fahrerkarriere", desc: "XP, Ränge und Erfolge – Beispiel-Profil." },
];

function DemoBanner() {
  return (
    <div className="border-b border-primary/30 bg-primary/10">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-3 text-sm text-primary">
        <Info className="size-4 shrink-0" />
        <span className="min-w-0">
          Du befindest dich in der öffentlichen VTC-Hub-Demo. <span className="text-primary/80">Änderungen sind deaktiviert.</span>
        </span>
        <span className="ml-auto hidden items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:inline-flex">
          <Lock className="size-3" /> Nur Lesemodus
        </span>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-surface/50 p-5">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-black">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-primary/80">Demo</div>
    </div>
  );
}

function DemoPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoBanner />

      <header className="border-b border-border/60 bg-background/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Zurück
          </Link>
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg border border-primary/40 bg-primary/10 text-primary">
              <Truck className="size-4" />
            </div>
            <div>
              <div className="text-sm font-bold">Demo Logistics VTC</div>
              <div className="text-[11px] text-muted-foreground">[DEMO] · öffentliche Demo</div>
            </div>
          </div>
          <Link
            to="/auth"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            Eigene VTC erstellen
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        <section>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Dashboard (Beispieldaten)</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Diese Ansicht zeigt beispielhaft, wie eine echte VTC-Hub-Umgebung aussieht. Alle Werte sind statisch und dienen nur zur Illustration.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KPI label="Aktive Fahrer" value="12" />
            <KPI label="Touren (Monat)" value="84" />
            <KPI label="Kilometer" value="36.220 km" />
            <KPI label="Umsatz" value="€ 128.400" />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-6 lg:col-span-2">
            <h2 className="text-lg font-bold">Aktuelle Touren</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="pb-2">ID</th>
                    <th className="pb-2">Fracht</th>
                    <th className="pb-2">Route</th>
                    <th className="pb-2 text-right">km</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {demoJobs.map((j) => (
                    <tr key={j.id}>
                      <td className="py-2 font-mono text-xs">{j.id}</td>
                      <td className="py-2">{j.cargo}</td>
                      <td className="py-2 text-muted-foreground">{j.from} → {j.to}</td>
                      <td className="py-2 text-right">{j.km}</td>
                      <td className="py-2 text-right">
                        <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          {j.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-surface/50 p-6">
            <h2 className="text-lg font-bold">Top-Fahrer</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {demoDrivers.map((d, i) => (
                <li key={d.name} className="flex items-center gap-3">
                  <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.km.toLocaleString("de-DE")} km · {d.tours} Touren</div>
                  </div>
                  <div className="text-sm font-semibold">€ {d.revenue.toLocaleString("de-DE")}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-black tracking-tight">Alle Module (Vorschau)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Alle Bereiche sind in der Demo im Lesemodus. Schreibaktionen sind serverseitig gesperrt.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demoModules.map((m) => (
              <div key={m.title} className="rounded-2xl border border-border/60 bg-surface/50 p-5 opacity-95">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <m.icon className="size-5" />
                  </div>
                  <h3 className="text-sm font-semibold">{m.title}</h3>
                  <Lock className="ml-auto size-3.5 text-muted-foreground" />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-black tracking-tight">Bereit für deine eigene VTC?</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            Erstelle deine eigene Spedition und teste VTC Hub 14 Tage kostenlos – keine Kreditkarte nötig.
          </p>
          <Link
            to="/auth"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:brightness-110"
          >
            VTC erstellen
          </Link>
        </section>
      </main>
    </div>
  );
}
