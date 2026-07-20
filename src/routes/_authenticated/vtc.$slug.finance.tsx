import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Wallet, TrendingUp, Coins, PiggyBank } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { getVtcContext } from "@/lib/vtcs.functions";
import { getFinanceOverview } from "@/lib/finance.functions";
import { currency, km } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/vtc/$slug/finance")({
  component: FinancePage,
});

function FinancePage() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const fetchFin = useServerFn(getFinanceOverview);
  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const vtcId = ctx?.vtc.id;
  const { data, isLoading } = useQuery({
    queryKey: ["finance", vtcId],
    queryFn: () => fetchFin({ data: { vtcId: vtcId! } }),
    enabled: !!vtcId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzen"
        subtitle="Einnahmen, Lohnkosten und Gewinn deiner Spedition."
        icon={Wallet}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={TrendingUp} label="Gesamt-Einnahmen" value={currency(data?.totals.revenue ?? 0)} tone="emerald" />
        <StatCard icon={Coins} label="Lohnkosten" value={currency(data?.totals.wages ?? 0)} tone="rose" />
        <StatCard icon={PiggyBank} label="Netto-Gewinn" value={currency(data?.totals.profit ?? 0)} tone="blue" />
      </div>

      <div className="panel p-5">
        <h3 className="mb-4 text-lg font-semibold">Einnahmen & Gewinn pro Monat</h3>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <LineChart data={data?.months ?? []}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                formatter={(v: number) => currency(v)}
              />
              <Legend />
              <Line type="monotone" name="Einnahmen" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} dot={false} />
              <Line type="monotone" name="Gewinn" dataKey="profit" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <h3 className="mb-4 text-lg font-semibold">Umsatz pro Fahrer</h3>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Lade…</div>
          ) : (data?.perDriver ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Noch keine Daten.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2 text-left">Fahrer</th>
                  <th className="pb-2 text-right">Touren</th>
                  <th className="pb-2 text-right">Kilometer</th>
                  <th className="pb-2 text-right">Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {data!.perDriver.slice(0, 15).map((d, i) => (
                  <tr key={d.driver_id} className="border-t border-border/60">
                    <td className="py-2">
                      <span className="mr-2 text-xs text-muted-foreground">#{i + 1}</span>
                      {d.display_name}
                    </td>
                    <td className="py-2 text-right num">{d.jobs}</td>
                    <td className="py-2 text-right num">{km(d.km)}</td>
                    <td className="py-2 text-right num font-semibold text-emerald-400">{currency(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel p-5">
          <h3 className="mb-4 text-lg font-semibold">Umsatz pro Fracht</h3>
          {(data?.perCargo ?? []).length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Noch keine Daten.</div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={(data?.perCargo ?? []).slice(0, 8)} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <YAxis type="category" dataKey="cargo" stroke="var(--muted-foreground)" fontSize={12} width={120} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                    formatter={(v: number) => currency(v)}
                  />
                  <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone: "emerald" | "rose" | "blue";
}) {
  const tint =
    tone === "emerald" ? "bg-emerald-500/15 text-emerald-400" :
    tone === "rose" ? "bg-rose-500/15 text-rose-400" :
    "bg-primary/20 text-primary";
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="num mt-2 text-3xl font-bold">{value}</div>
        </div>
        <div className={`grid size-12 place-items-center rounded-full ${tint}`}>
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}
