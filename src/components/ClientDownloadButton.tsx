import { Download } from "lucide-react";
import { useClientDownloadUrl } from "@/hooks/use-app-settings";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/**
 * Global "VTC Hub Client herunterladen" button.
 * - Only rendered inside authenticated shells (import points guarantee this).
 * - Link is read exclusively from the platform setting `client_download_url`
 *   via useClientDownloadUrl(); no hardcoded fallback link is used at runtime.
 * - Disabled state when no link is configured.
 * - Responsive: full label on desktop, kurzer Text auf Tablet, Icon-only auf Mobile.
 */
export function ClientDownloadButton({ className }: Props) {
  const { value, loading } = useClientDownloadUrl();
  const url = (value ?? "").trim();
  const disabled = loading || !/^https?:\/\//i.test(url);

  const title = disabled
    ? "Desktop Client derzeit nicht verfügbar"
    : "VTC Hub Client herunterladen";

  const base = cn(
    "inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50",
    disabled && "cursor-not-allowed opacity-50 hover:bg-primary/10",
    className,
  );

  if (disabled) {
    return (
      <button type="button" disabled title={title} aria-label={title} className={base}>
        <Download className="size-4 shrink-0" />
        <span className="hidden lg:inline">VTC Hub Client herunterladen</span>
        <span className="hidden md:inline lg:hidden">Client herunterladen</span>
      </button>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      aria-label={title}
      className={base}
    >
      <Download className="size-4 shrink-0" />
      <span className="hidden lg:inline">VTC Hub Client herunterladen</span>
      <span className="hidden md:inline lg:hidden">Client herunterladen</span>
    </a>
  );
}
