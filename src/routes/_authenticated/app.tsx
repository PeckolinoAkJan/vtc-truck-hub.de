import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Truck, LogOut, Plus } from "lucide-react";
import { listMyVtcs } from "@/lib/vtcs.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppHome,
});

function AppHome() {
  const fetchList = useServerFn(listMyVtcs);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["my-vtcs"],
    queryFn: () => fetchList(),
    retry: 1,
  });

  useEffect(() => {
    if (data && data.length === 1) {
      const slug = data[0].vtc?.slug;
      if (slug) navigate({ to: `/vtc/${slug}`, replace: true });
    } else if (data && data.length === 0) {
      navigate({ to: "/profile", replace: true });
    }
  }, [data, navigate]);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  if (isLoading) return <CenteredLoader />;

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <div className="panel border-destructive/40 p-6">
          <h1 className="text-lg font-semibold">Deine VTCs konnten nicht geladen werden</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bitte lade die Seite neu. Falls der Fehler bestehen bleibt, melde dich einmal ab und
            wieder an.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Seite neu laden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Truck className="size-4" />
          </div>
          <span className="text-lg font-semibold">Deine VTCs</span>
        </div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="size-4" /> Abmelden
        </button>
      </div>

      <div className="grid gap-3">
        {(data ?? []).map((m) =>
          m.vtc ? (
            <Link
              key={m.vtc.id}
              to={`/vtc/${m.vtc.slug}`}
              className="panel flex items-center justify-between p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-md bg-surface-2 text-xs font-semibold text-primary">
                  [{m.vtc.tag}]
                </div>
                <div>
                  <div className="font-medium">{m.vtc.name}</div>
                  <div className="text-xs text-muted-foreground">Rolle: {m.role}</div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">Öffnen →</span>
            </Link>
          ) : null,
        )}
        <Link
          to="/profile"
          className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface/40 p-4 text-sm text-muted-foreground hover:bg-surface"
        >
          <Plus className="size-4" /> Eigene Spedition gründen
        </Link>
      </div>
    </div>
  );
}

function CenteredLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
