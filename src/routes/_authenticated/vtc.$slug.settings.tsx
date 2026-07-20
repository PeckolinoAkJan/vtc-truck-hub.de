import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, RefreshCw, Eye, EyeOff, Upload, Trash2, AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getVtcContext,
  getVtcSettings,
  rotateApiKey,
  updateVtc,
  deleteVtc,
} from "@/lib/vtcs.functions";

export const Route = createFileRoute("/_authenticated/vtc/$slug/settings")({
  component: Settings,
});

function Settings() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchCtx = useServerFn(getVtcContext);
  const fetchSettings = useServerFn(getVtcSettings);
  const doRotate = useServerFn(rotateApiKey);
  const doUpdate = useServerFn(updateVtc);
  const doDelete = useServerFn(deleteVtc);

  const { data: ctx } = useQuery({
    queryKey: ["vtc-ctx", slug],
    queryFn: () => fetchCtx({ data: { slug } }),
  });
  const canManage = ctx && (ctx.role === "owner" || ctx.role === "admin");
  const isOwner = ctx?.role === "owner";
  const { data: settings } = useQuery({
    queryKey: ["vtc-settings", slug],
    queryFn: () => fetchSettings({ data: { slug } }),
    enabled: !!canManage,
  });

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [discordUrl, setDiscordUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [reveal, setReveal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (settings) {
      setName(settings.name);
      setTag(settings.tag);
      setDescription(settings.description ?? "");
      setLogoUrl(settings.logo_url ?? null);
      setDiscordUrl(settings.discord_url ?? "");
      setWebsiteUrl(settings.website_url ?? "");
      setInstagramUrl(settings.instagram_url ?? "");
    }
  }, [settings]);

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">Nur Owner und Admins können Einstellungen ändern.</p>;
  }

  async function handleLogoPick(file: File | null) {
    if (!file || !settings) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei auswählen");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 4 MB)");
      return;
    }
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Nicht angemeldet");
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("vtc-logos")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (upErr) throw new Error(upErr.message);
      const { data: signed, error: urlErr } = await supabase.storage
        .from("vtc-logos")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (urlErr || !signed?.signedUrl) throw new Error(urlErr?.message ?? "Signed URL Fehler");
      setLogoUrl(signed.signedUrl);
      toast.success("Logo hochgeladen – jetzt Speichern klicken");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setLoading(true);
    try {
      await doUpdate({
        data: {
          vtcId: settings.id,
          name,
          tag,
          description,
          logoUrl: logoUrl ?? null,
          discordUrl: discordUrl.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
          instagramUrl: instagramUrl.trim() || null,
        },
      });
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["vtc-settings", slug] });
      qc.invalidateQueries({ queryKey: ["vtc-ctx", slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleRotate() {
    if (!settings) return;
    if (!confirm("Der bisherige API-Key wird ungültig. Fortfahren?")) return;
    try {
      await doRotate({ data: { vtcId: settings.id } });
      toast.success("Neuer API-Key generiert");
      qc.invalidateQueries({ queryKey: ["vtc-settings", slug] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  async function handleDelete() {
    if (!settings) return;
    setDeleting(true);
    try {
      await doDelete({ data: { vtcId: settings.id } });
      toast.success("Spedition aufgelöst");
      await qc.cancelQueries();
      qc.clear();
      navigate({ to: "/profile", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Löschen");
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Verwaltung</div>
        <h1 className="mt-1 text-2xl font-semibold">Einstellungen</h1>
      </div>

      <form onSubmit={handleSave} className="panel space-y-4 p-6">
        <h2 className="text-sm font-semibold">Speditions-Profil</h2>

        <div className="flex items-start gap-4">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-2">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="size-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">Kein Logo</span>
            )}
          </div>
          <div className="flex-1">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoPick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-accent disabled:opacity-60"
            >
              <Upload className="size-4" />
              {uploading ? "Lädt hoch…" : logoUrl ? "Logo ersetzen" : "Logo hochladen"}
            </button>
            {logoUrl && (
              <button
                type="button"
                onClick={() => setLogoUrl(null)}
                className="ml-2 text-xs text-destructive hover:underline"
              >
                entfernen
              </button>
            )}
            <p className="mt-2 text-xs text-muted-foreground">PNG, JPG oder WEBP. Max. 4 MB.</p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Name</span>
          <input
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Tag</span>
          <input
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            required
            maxLength={8}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Beschreibung</span>
          <textarea
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
          />
        </label>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Social Media</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Diese Links werden auf der öffentlichen Speditions-Seite angezeigt.
          </p>
          <div className="mt-3 space-y-3">
            <SocialField label="Discord" placeholder="https://discord.gg/…" value={discordUrl} onChange={setDiscordUrl} />
            <SocialField label="Website" placeholder="https://…" value={websiteUrl} onChange={setWebsiteUrl} />
            <SocialField label="Instagram" placeholder="https://instagram.com/…" value={instagramUrl} onChange={setInstagramUrl} />
          </div>
        </div>

        <button
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Speichert…" : "Speichern"}
        </button>
      </form>

      <div className="panel p-6">
        <h2 className="text-sm font-semibold">Telemetrie-API-Key</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Nutze diesen Key im <code className="text-foreground">Authorization: Bearer &lt;key&gt;</code>{" "}
          Header, wenn ein externer Client Events an <code className="text-foreground">/api/public/telemetry/ingest</code> sendet.
        </p>
        <div className="mt-4 flex items-stretch gap-2">
          <div className="num flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm">
            {reveal ? settings?.api_key : "•".repeat(24)}
          </div>
          <button
            onClick={() => setReveal((v) => !v)}
            className="rounded-md border border-border bg-surface-2 px-3 hover:bg-accent"
            aria-label="Toggle"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
          <button
            onClick={() => {
              if (settings?.api_key) {
                navigator.clipboard.writeText(settings.api_key);
                toast.success("Kopiert");
              }
            }}
            className="rounded-md border border-border bg-surface-2 px-3 hover:bg-accent"
          >
            <Copy className="size-4" />
          </button>
        </div>
        <button
          onClick={handleRotate}
          className="mt-4 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20"
        >
          <RefreshCw className="size-3.5" /> API-Key rotieren
        </button>
      </div>

      {isOwner && (
        <div className="panel border-destructive/40 p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Gefahrenzone
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Die Auflösung deiner Spedition kann nicht rückgängig gemacht werden. Alle Fahrer, Fahrzeuge, Aufträge und Bewerbungen werden unwiderruflich gelöscht.
          </p>
          <button
            onClick={() => setDeleteOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Trash2 className="size-4" /> Spedition auflösen
          </button>
        </div>
      )}

      {deleteOpen && settings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteOpen(false)}
        >
          <div
            className="panel w-full max-w-md overflow-hidden border border-destructive/40 bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="size-5" />
                <h3 className="text-base font-semibold">Spedition wirklich auflösen?</h3>
              </div>
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-6">
              <p className="text-sm text-muted-foreground">
                Bist du sicher? Alle Daten dieser Spedition (<span className="font-semibold text-foreground">{settings.name}</span>) werden{" "}
                <span className="font-semibold text-destructive">unwiderruflich gelöscht</span>. Du und alle Mitglieder werden auf den Status „freier Fahrer" zurückgesetzt.
              </p>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  Gib zur Bestätigung den Speditions-Namen ein:
                </span>
                <input
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-destructive focus:ring-2 focus:ring-destructive/40"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={settings.name}
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                  className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting || confirmText !== settings.name}
                  className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                  {deleting ? "Wird gelöscht…" : "Endgültig löschen"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SocialField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="url"
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm focus:border-primary focus:ring-2 focus:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={300}
      />
    </label>
  );
}
