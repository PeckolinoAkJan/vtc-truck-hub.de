import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getVtcContext } from "@/lib/vtcs.functions";
import { VtcShell } from "@/components/VtcShell";

export const Route = createFileRoute("/_authenticated/vtc/$slug")({
  component: VtcLayout,
});

function VtcLayout() {
  const { slug } = Route.useParams();
  const fetchCtx = useServerFn(getVtcContext);
  const { data, isLoading, error } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-xl font-semibold">Kein Zugriff</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Diese VTC existiert nicht oder du bist kein Mitglied."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <VtcShell slug={slug} vtc={data.vtc} role={data.role} displayName={data.profile?.display_name ?? undefined}>
      <Outlet />
    </VtcShell>
  );
}
