import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getVtcContext } from "@/lib/vtcs.functions";
import { submitJob } from "@/lib/jobs.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/jobs/new")({
  component: NewJob,
});

function NewJob() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const fetchCtx = useServerFn(getVtcContext);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const submit = useServerFn(submitJob);

  const [form, setForm] = useState({
    source_city: "",
    dest_city: "",
    cargo: "",
    distance_km: "",
    revenue: "",
    fuel_cost: "",
    damage_pct: "0",
    game: "ets2" as "ets2" | "ats" | "other",
    truck: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    setLoading(true);
    try {
      await submit({
        data: {
          vtcId: ctx.vtc.id,
          source_city: form.source_city,
          dest_city: form.dest_city,
          cargo: form.cargo,
          distance_km: Number(form.distance_km),
          revenue: Number(form.revenue),
          fuel_cost: Number(form.fuel_cost || 0),
          damage_pct: Number(form.damage_pct || 0),
          game: form.game,
          truck: form.truck || undefined,
        },
      });
      toast.success("Tour eingereicht");
      navigate({ to: `/vtc/${slug}/jobs`, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Neue Tour</div>
        <h1 className="mt-1 text-2xl font-semibold">Tour einreichen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fülle die Angaben aus deiner abgeschlossenen Fracht ein. Ein Disponent prüft die Tour anschließend.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="panel space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Startstadt" value={form.source_city} onChange={set("source_city")} required />
          <Field label="Zielstadt" value={form.dest_city} onChange={set("dest_city")} required />
        </div>
        <Field label="Fracht" value={form.cargo} onChange={set("cargo")} required />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Distanz (km)" value={form.distance_km} onChange={set("distance_km")} type="number" required />
          <Field label="Umsatz (€)" value={form.revenue} onChange={set("revenue")} type="number" required />
          <Field label="Kraftstoff (€)" value={form.fuel_cost} onChange={set("fuel_cost")} type="number" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Schaden (%)" value={form.damage_pct} onChange={set("damage_pct")} type="number" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Spiel</span>
            <select
              value={form.game}
              onChange={(e) => set("game")(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
            >
              <option value="ets2">Euro Truck Simulator 2</option>
              <option value="ats">American Truck Simulator</option>
              <option value="other">Anderes</option>
            </select>
          </label>
          <Field label="Truck (optional)" value={form.truck} onChange={set("truck")} />
        </div>
        <button
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "…" : "Zur Prüfung einreichen"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring"
        type={type}
        step={type === "number" ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </label>
  );
}
