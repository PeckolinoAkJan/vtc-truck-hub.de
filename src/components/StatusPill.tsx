import { cn } from "@/lib/utils";

const map = {
  // Job statuses
  in_progress: { label: "Unterwegs", cls: "bg-primary/15 text-primary border-primary/30" },
  submitted: { label: "Eingereicht", cls: "bg-warning/15 text-warning border-warning/30" },
  approved: { label: "Genehmigt", cls: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Abgelehnt", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  cancelled: { label: "Abgebrochen", cls: "bg-muted text-muted-foreground border-border" },
  // Settlement statuses
  draft: { label: "Entwurf", cls: "bg-muted text-muted-foreground border-border" },
  pending: { label: "Ausstehend", cls: "bg-warning/15 text-warning border-warning/30" },
  ready: { label: "Bereit", cls: "bg-primary/15 text-primary border-primary/30" },
  paid: { label: "Ausgezahlt", cls: "bg-success/15 text-success border-success/30" },
  disputed: { label: "Beanstandet", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  archived: { label: "Archiv", cls: "bg-muted text-muted-foreground border-border" },
} as const;

export type PillStatus = keyof typeof map;

export function StatusPill({ status }: { status: PillStatus }) {
  const m = map[status] ?? map.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        m.cls,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {m.label}
    </span>
  );
}
