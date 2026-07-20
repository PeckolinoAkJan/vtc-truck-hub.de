import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/vtc/$slug/jobs")({
  component: () => <Outlet />,
});
