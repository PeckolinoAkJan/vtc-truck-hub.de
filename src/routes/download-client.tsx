import { createFileRoute } from "@tanstack/react-router";
import { Download, Truck } from "lucide-react";

export const Route = createFileRoute("/download-client")({
  head: () => ({
    meta: [
      { title: "Desktop-Client herunterladen – VTC Hub" },
      {
        name: "description",
        content:
          "Lade den VTC Hub Desktop-Client für Windows herunter – mit Live-Telemetrie, Fahrzeug-, Kraftstoff- und Schadensdaten.",
      },
    ],
  }),
  component: DownloadClient,
});

const SETUP_URL = "/downloads/VTC-Fleet-Forge-Setup.exe";

function DownloadClient() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
          <Truck className="size-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">VTC Hub – Desktop-Client</h1>
          <p className="text-sm text-muted-foreground">Windows 10/11 (64-bit) – Installer</p>
        </div>
      </div>
      <p className="mb-8 text-muted-foreground">
        Überträgt Live-Telemetrie aus ETS2/ATS an dein Dashboard: Position, Geschwindigkeit,
        Kraftstoff, Schäden, Lenkzeit und automatische Auftrags-Ereignisse.
      </p>

      <a
        href={SETUP_URL}
        download="VTC-Fleet-Forge-Setup.exe"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-90"
      >
        <Download className="size-4" />
        Setup.exe herunterladen (Windows Installer)
      </a>

      <section className="mt-10 space-y-3 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">Installation</h2>
        <ol className="list-inside list-decimal space-y-1">
          <li><code>VTC-Fleet-Forge-Setup.exe</code> ausführen.</li>
          <li>Installationspfad wählen (Standard: Programme).</li>
          <li>Der Installer legt Desktop-Icon und Startmenü-Eintrag automatisch an.</li>
          <li>In <strong>Einstellungen</strong> API-Schlüssel und Fahrer Steam-ID eintragen.</li>
          <li>Auf <strong>Auto-Polling</strong> gehen und starten – Live-Daten fließen automatisch.</li>
        </ol>
        <p className="pt-4">
          Voraussetzung für Auto-Polling: lokal laufender{" "}
          <a href="https://github.com/Funbit/ets2-telemetry-server" target="_blank" rel="noopener">
            ets2-telemetry-server
          </a>{" "}
          auf Port <code>25555</code>.
        </p>
      </section>
    </main>
  );
}
