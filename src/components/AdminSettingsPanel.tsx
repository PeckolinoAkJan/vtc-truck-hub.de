import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSetting, useIsSuperAdmin } from "@/hooks/use-app-settings";

export function AdminSettingsPanel() {
  const isAdmin = useIsSuperAdmin();
  const { value, loading, reload } = useAppSetting("client_download_url", "");
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isAdmin) return null;

  const current = draft ?? value;

  async function save() {
    if (!current || !/^https?:\/\//i.test(current)) {
      toast.error("Bitte eine gültige URL eingeben (http/https).");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "client_download_url", value: current }, { onConflict: "key" });
    setSaving(false);
    if (error) {
      const code = (error as { code?: string }).code;
      const msg = error.message?.toLowerCase() ?? "";
      if (code === "42501" || msg.includes("permission denied") || msg.includes("row-level security")) {
        toast.error("Du hast keine Berechtigung, den Desktop-Download zu bearbeiten.");
      } else {
        toast.error("Speichern fehlgeschlagen. Bitte später erneut versuchen.");
      }
      console.error("[AdminSettingsPanel] save failed", error);
      return;
    }
    toast.success("Download-Link aktualisiert.");
    setDraft(null);
    reload();
  }

  return (
    <section className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-lg font-semibold">Admin Einstellungen</h2>
      </div>
      <label className="mb-2 block text-sm font-medium text-muted-foreground">
        Aktueller Download-Link
      </label>
      <input
        type="url"
        value={current}
        placeholder={loading ? "Lade…" : "https://…"}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Speichere…" : "Link aktualisieren"}
        </button>
        {draft !== null && (
          <button
            onClick={() => setDraft(null)}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Zurücksetzen
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Diese Einstellung ist nur für dich sichtbar. Der Link wird sofort für alle Fahrer im
        Navigationsmenü aktiv.
      </p>
    </section>
  );
}
