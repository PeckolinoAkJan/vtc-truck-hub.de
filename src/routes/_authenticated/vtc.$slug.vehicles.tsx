import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Car, Plus } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import { listVehicles } from "@/lib/vehicles.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/vehicles")({
  component: VehiclesPage,
});

function VehiclesPage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const fetchVehicles = useServerFn(listVehicles);
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", vtcId],
    queryFn: () => fetchVehicles({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  return (
    <div>
      <PageHeader title="Fahrzeuge" subtitle="Alle LKW deiner Flotte." icon={Car}>
        <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 hover:opacity-90">
          <Plus className="size-4" /> Fahrzeug hinzufügen
        </button>
      </PageHeader>

      {(vehicles ?? []).length === 0 ? (
        <EmptyState
          icon={Car}
          title="Noch keine Fahrzeuge"
          body="Fahrzeuge werden automatisch angelegt, sobald ein Fahrer über den Desktop-Client Live-Telemetrie sendet. Du kannst sie auch manuell erfassen."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {vehicles!.map((v) => (
            <div key={v.id} className="panel p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold">{v.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[v.brand, v.model].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                    v.status === "driving"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : v.status === "maintenance"
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {v.status}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Field label="Kennzeichen" value={v.plate ?? "—"} />
                <Field label="Aktueller Fahrer" value={v.driver_name ?? "—"} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}
