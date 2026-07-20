import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Activity, Gauge, MapPin, Truck } from "lucide-react";
import { getVtcContext } from "@/lib/vtcs.functions";
import { listLiveTelemetry, getLiveMap } from "@/lib/telemetry.functions";
import { supabase } from "@/integrations/supabase/client";
import { dt } from "@/lib/format";
import { LiveMap, LiveMapModal, type MapDriver } from "@/components/LiveMap";

export const Route = createFileRoute("/_authenticated/vtc/$slug/live")({
  component: Live,
});

function Live() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;

  const fetchLive = useServerFn(listLiveTelemetry);
  const { data: rows, isLoading } = useQuery({
    queryKey: ["live-telemetry", vtcId],
    queryFn: () => fetchLive({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
    refetchOnWindowFocus: false,
  });

  const fetchMap = useServerFn(getLiveMap);
  const { data: mapData } = useQuery({
    queryKey: ["live-map", vtcId],
    queryFn: () => fetchMap({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
  const [expand, setExpand] = useState(false);


  useEffect(() => {
    if (!vtcId) return;
    const channel = supabase
      .channel(`telemetry-${vtcId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telemetry_data", filter: `vtc_id=eq.${vtcId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["live-telemetry", vtcId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vtcId, qc]);

  const now = Date.now();
  const drivers = useMemo(() => rows ?? [], [rows]);
  const activeCount = drivers.filter(
    (d) => now - new Date(d.updated_at).getTime() < 60_000 && d.status !== "offline",
  ).length;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Live-Telemetrie</div>
          <h1 className="mt-1 text-2xl font-semibold">Aktive Fahrer</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Realtime — {activeCount} online
        </div>
      </div>

      {isLoading && <div className="panel p-6 text-sm text-muted-foreground">Lade Telemetrie…</div>}

      {!isLoading && drivers.length === 0 && (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          Noch keine Live-Daten. Starte den Desktop-Client und aktiviere Auto-Polling im ETS2/ATS.
        </div>
      )}

      <div className="panel mb-6 p-3" style={{ height: 420 }}>
        <LiveMap
          drivers={(mapData?.drivers ?? []) as MapDriver[]}
          updatedAt={mapData?.updatedAt}
          role={(mapData as { role?: string | null } | undefined)?.role ?? null}
          onExpand={() => setExpand(true)}
        />
      </div>
      {expand && (
        <LiveMapModal
          drivers={(mapData?.drivers ?? []) as MapDriver[]}
          updatedAt={mapData?.updatedAt}
          role={(mapData as { role?: string | null } | undefined)?.role ?? null}
          onClose={() => setExpand(false)}
        />
      )}



      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {drivers.map((d) => {
          const ageSec = Math.round((now - new Date(d.updated_at).getTime()) / 1000);
          const stale = ageSec > 60 || d.status === "offline";
          const speed = Number(d.speed_kmh ?? 0);
          const fuelPct =
            d.fuel != null && d.fuel_capacity != null && Number(d.fuel_capacity) > 0
              ? Math.round((Number(d.fuel) / Number(d.fuel_capacity)) * 100)
              : null;
          return (
            <div key={d.id} className={`panel p-5 ${stale ? "opacity-60" : "glow-ring"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">{d.driver_name}</div>
                  <div className="text-xs text-muted-foreground">
                    <Truck className="mr-1 inline size-3" />
                    {d.truck_model ?? "—"} · {(d.game ?? "").toUpperCase()}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                    stale
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/15 text-primary"
                  }`}
                >
                  {stale ? "offline" : d.status ?? "driving"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Stat
                  icon={Gauge}
                  label="Speed"
                  value={`${speed.toFixed(0)} km/h`}
                />
                <Stat
                  icon={Activity}
                  label="Schaden"
                  value={d.damage_pct != null ? `${Number(d.damage_pct).toFixed(1)} %` : "—"}
                />
                <Stat
                  icon={MapPin}
                  label="Von"
                  value={d.source_city ?? "—"}
                />
                <Stat
                  icon={MapPin}
                  label="Nach"
                  value={d.dest_city ?? "—"}
                />
              </div>

              {d.cargo && (
                <div className="mt-3 rounded-md bg-surface-2/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Fracht: </span>
                  <span className="font-medium">{d.cargo}</span>
                </div>
              )}

              {fuelPct != null && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Kraftstoff</span>
                    <span>{fuelPct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, Math.max(0, fuelPct))}%` }}
                    />
                  </div>
                </div>
              )}

              {d.job_distance_km != null && d.job_remaining_km != null && Number(d.job_distance_km) > 0 && (
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Route</span>
                    <span>
                      {Math.max(0, Number(d.job_distance_km) - Number(d.job_remaining_km)).toFixed(0)} /{" "}
                      {Number(d.job_distance_km).toFixed(0)} km
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-primary/70"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            ((Number(d.job_distance_km) - Number(d.job_remaining_km)) /
                              Number(d.job_distance_km)) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 text-[10px] text-muted-foreground">
                Update: {dt(d.updated_at)} ({ageSec}s)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <div className="num mt-0.5 font-medium">{value}</div>
    </div>
  );
}
