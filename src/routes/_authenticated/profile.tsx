import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Check,
  ArrowLeft,
  LogOut,
  Truck,
  KeyRound,
  Building2,
  Wallet,
  ExternalLink,
  User as UserIcon,
  Landmark,
  Settings as SettingsIcon,
  Camera,
  Plus,
  X,
  Upload,
  Sparkles,
} from "lucide-react";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";
import { createVtc, listVtcDirectory, listMyJoinRequests, cancelJoinRequest } from "@/lib/vtcs.functions";
import { supabase } from "@/integrations/supabase/client";
import { Building2 as BuildingIcon, Compass } from "lucide-react";
import { AdminSettingsPanel } from "@/components/AdminSettingsPanel";
import { AdminNewsPanel } from "@/components/AdminNewsPanel";
import { ClientDownloadButton } from "@/components/ClientDownloadButton";

export const Route = createFileRoute("/_authenticated/profile")({
  component: Profile,
});

type Tab = "profile" | "bank" | "settings";

function Profile() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const saveProfile = useServerFn(updateMyProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const [tab, setTab] = useState<Tab>("profile");
  const [copied, setCopied] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [realName, setRealName] = useState("");
  const [discordId, setDiscordId] = useState("");
  const [steamId, setSteamId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [vtcModalOpen, setVtcModalOpen] = useState(false);

  useEffect(() => {
    if (data) {
      setDisplayName(data.display_name);
      setRealName(data.real_name ?? "");
      setDiscordId(data.discord_id ?? "");
      setSteamId(data.steam_id ?? "");
      setAvatarUrl(data.avatar_url ?? "");
    }
  }, [data]);

  async function copy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success("Kopiert");
    setTimeout(() => setCopied(null), 1500);
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveProfile({
        data: {
          displayName,
          realName: realName || null,
          discordId: discordId || null,
          steamId: steamId || null,
          avatarUrl: avatarUrl || null,
        },
      });
      toast.success("Profil gespeichert");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="p-8 text-sm text-muted-foreground">Lade…</div>;
  if (!data) return <div className="p-8 text-sm text-muted-foreground">Profil nicht gefunden.</div>;

  const balanceStr = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(data.balance ?? 0));

  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/u/${data.user_id}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
        <Link to="/" className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Truck className="size-5" />
          </div>
          <span className="font-bold tracking-tight">VTC Hub</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ClientDownloadButton />
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Zurück
          </Link>
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-4" /> Abmelden
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Mein Workspace</div>
          <h1 className="mt-1 text-3xl font-semibold">
            Hallo, {data.display_name}
          </h1>
        </div>

        {!data.isOwner && (
          <div className="mb-6 panel relative overflow-hidden p-6 md:p-7 border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg">
                  <Sparkles className="size-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Eigene Spedition (VTC) gründen</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    Starte deine eigene Spedition, lade Fahrer ein und verwalte Touren, Fahrzeuge & Abrechnungen in deinem eigenen Workspace.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setVtcModalOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
              >
                <Plus className="size-4" />
                Spedition gründen
              </button>
            </div>
          </div>
        )}

        {!data.vtc && <VtcDirectorySection />}
        {!data.vtc && <MyApplicationsSection />}




        {/* Info-Karten */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            icon={KeyRound}
            label="Client Schlüssel"
            value={data.client_key ? `${data.client_key.slice(0, 6)}…${data.client_key.slice(-4)}` : "—"}
            action={
              data.client_key ? (
                <button
                  onClick={() => copy(data.client_key!, "ck")}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  {copied === "ck" ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied === "ck" ? "Kopiert" : "Kopieren"}
                </button>
              ) : null
            }
          />
          <InfoCard
            icon={Building2}
            label="Spedition"
            value={data.vtc?.name ?? "Keine zugewiesen"}
            action={
              data.vtc ? (
                <Link
                  to="/vtc/$slug"
                  params={{ slug: data.vtc.slug }}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Öffnen <ExternalLink className="size-3" />
                </Link>
              ) : null
            }
          />
          <InfoCard
            icon={Wallet}
            label="Kontostand"
            value={balanceStr}
            valueClass="text-emerald-400"
          />
          <InfoCard
            icon={ExternalLink}
            label="Öffentliches Profil"
            value="Ansicht teilen"
            action={
              <button
                onClick={() => copy(publicUrl, "pub")}
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                {copied === "pub" ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied === "pub" ? "Link kopiert" : "Link kopieren"}
              </button>
            }
          />
        </div>

        {/* Tabs */}
        <div className="mt-8">
          <div className="flex items-center gap-1 border-b border-border">
            <TabButton active={tab === "profile"} onClick={() => setTab("profile")} icon={UserIcon}>
              Profil
            </TabButton>
            <TabButton active={tab === "bank"} onClick={() => setTab("bank")} icon={Landmark}>
              Bankkonto
            </TabButton>
            <TabButton active={tab === "settings"} onClick={() => setTab("settings")} icon={SettingsIcon}>
              Einstellungen
            </TabButton>
          </div>

          <div className="mt-6">
            {tab === "profile" && (
              <form onSubmit={handleSave} className="panel grid gap-8 p-6 md:grid-cols-[1fr_260px]">
                <div className="space-y-4">
                  <Field label="Nickname">
                    <input
                      className="input"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      required
                      minLength={2}
                      maxLength={60}
                    />
                  </Field>
                  <Field label="Realname">
                    <input
                      className="input"
                      value={realName}
                      onChange={(e) => setRealName(e.target.value)}
                      maxLength={100}
                      placeholder="Vor- und Nachname"
                    />
                  </Field>
                  <Field label="E-Mail">
                    <input
                      className="input opacity-70"
                      value={data.email ?? ""}
                      readOnly
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      E-Mail-Adresse wird über die Kontoverwaltung geändert.
                    </p>
                  </Field>
                  <Field label="Discord-ID">
                    <input
                      className="input"
                      value={discordId}
                      onChange={(e) => setDiscordId(e.target.value)}
                      maxLength={64}
                      placeholder="username oder 123456789012345678"
                    />
                  </Field>
                  <Field label="Steam-ID (17 Stellen, optional)">
                    <input
                      className="input"
                      value={steamId}
                      onChange={(e) => setSteamId(e.target.value)}
                      maxLength={17}
                      placeholder="76561198000000000"
                    />
                  </Field>
                  <div className="flex gap-2">
                    <button
                      disabled={saving}
                      className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? "Speichert…" : "Speichern"}
                    </button>
                  </div>
                </div>

                <aside className="space-y-3">
                  <div className="text-xs font-medium text-muted-foreground">Profilbild</div>
                  <div className="grid size-40 place-items-center overflow-hidden rounded-2xl border border-border bg-surface-2">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="size-full object-cover"
                        onError={() => setAvatarUrl("")}
                      />
                    ) : (
                      <div className="text-4xl font-bold text-primary">
                        {(displayName || "?").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Avatar-URL
                    </span>
                    <div className="flex items-center gap-2">
                      <Camera className="size-4 text-muted-foreground" />
                      <input
                        className="input"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                        placeholder="https://…"
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Direkter Bild-Link (Datei-Upload folgt später).
                    </p>
                  </label>
                </aside>
              </form>
            )}

            {tab === "bank" && (
              <div className="panel p-6">
                <h3 className="text-sm font-semibold">Bankkonto</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Aktueller Kontostand: <span className="font-semibold text-emerald-400">{balanceStr}</span>
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  Kontodaten (IBAN, Name des Kontoinhabers) für Auszahlungen folgen in einem späteren Update.
                </p>
              </div>
            )}

            {tab === "settings" && (
              <div className="panel space-y-4 p-6">
                <h3 className="text-sm font-semibold">Konto & IDs</h3>
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Benutzer-ID (UUID)
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 break-all text-sm">{data.user_id}</code>
                    <button
                      onClick={() => copy(data.user_id, "uid")}
                      className="grid size-8 place-items-center rounded-md border border-border bg-surface hover:bg-accent"
                    >
                      {copied === "uid" ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Client Schlüssel
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="flex-1 break-all text-sm">{data.client_key ?? "—"}</code>
                    {data.client_key && (
                      <button
                        onClick={() => copy(data.client_key!, "ck2")}
                        className="grid size-8 place-items-center rounded-md border border-border bg-surface hover:bg-accent"
                      >
                        {copied === "ck2" ? <Check className="size-4" /> : <Copy className="size-4" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <AdminSettingsPanel />
            <AdminNewsPanel />
          </div>
        </div>
      </main>

      {vtcModalOpen && (
        <CreateVtcModal
          userId={data.user_id}
          onClose={() => setVtcModalOpen(false)}
          onCreated={(slug) => {
            setVtcModalOpen(false);
            qc.invalidateQueries({ queryKey: ["my-profile"] });
            navigate({ to: "/vtc/$slug", params: { slug } });
          }}
        />
      )}
    </div>
  );
}

function CreateVtcModal({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const submitCreate = useServerFn(createVtc);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    if (!f) {
      setLogoFile(null);
      setLogoPreview("");
      return;
    }
    if (!f.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei auswählen");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 4 MB)");
      return;
    }
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Bitte einen Speditionsnamen eingeben");
      return;
    }
    setBusy(true);
    try {
      let logoUrl: string | null = null;
      if (logoFile) {
        const ext = (logoFile.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
        const path = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("vtc-logos")
          .upload(path, logoFile, { cacheControl: "3600", upsert: false, contentType: logoFile.type });
        if (upErr) throw new Error("Logo-Upload fehlgeschlagen: " + upErr.message);
        const { data: signed, error: urlErr } = await supabase.storage
          .from("vtc-logos")
          .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
        if (urlErr || !signed?.signedUrl) throw new Error(urlErr?.message ?? "Signed URL Fehler");
        logoUrl = signed.signedUrl;
      }
      const res = await submitCreate({
        data: {
          name: name.trim(),
          description: description.trim() || null,
          logoUrl,
        },
      });
      toast.success("Spedition gegründet");
      if (res.slug) onCreated(res.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-lg overflow-hidden border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
              <Building2 className="size-5" />
            </div>
            <h3 className="text-base font-semibold">Neue Spedition gründen</h3>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Name der Spedition <span className="text-primary">*</span>
            </span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={60}
              placeholder="z. B. VTC Hub"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Beschreibung</span>
            <textarea
              className="input min-h-24 resize-y py-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              placeholder="Was macht deine Spedition besonders?"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Logo / Profilbild</span>
            <div className="flex items-center gap-4">
              <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-2">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo Vorschau" className="size-full object-cover" />
                ) : (
                  <Building2 className="size-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-accent"
                >
                  <Upload className="size-4" />
                  {logoFile ? "Anderes Bild wählen" : "Bild hochladen"}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">PNG, JPG oder WEBP. Max. 4 MB.</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Wird erstellt…" : "Spedition gründen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  valueClass,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueClass?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
          <Icon className="size-4" />
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      </div>
      <div className={`mt-4 truncate text-lg font-semibold ${valueClass ?? ""}`}>{value}</div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function VtcDirectorySection() {
  const fetchDir = useServerFn(listVtcDirectory);
  const { data, isLoading } = useQuery({
    queryKey: ["vtc-directory"],
    queryFn: () => fetchDir(),
    staleTime: 30_000,
  });

  return (
    <div className="mb-6 panel p-6">
      <div className="flex items-center gap-2">
        <Compass className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Speditionen entdecken
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Als freier Fahrer kannst du dich bei einer bestehenden Spedition bewerben. Klick auf eine Spedition, um dir das Profil anzusehen.
      </p>

      {isLoading ? (
        <div className="mt-4 text-sm text-muted-foreground">Lade…</div>
      ) : !data || data.length === 0 ? (
        <div className="mt-4 text-sm text-muted-foreground">Aktuell gibt es noch keine Speditionen.</div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((v) => (
            <Link
              key={v.id ?? v.slug!}
              to="/discover/$slug"
              params={{ slug: v.slug! }}
              className="group flex items-center gap-3 rounded-lg border border-border bg-surface-2/40 p-3 transition hover:border-primary hover:bg-surface-2"
            >
              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background">
                {v.logo_url ? (
                  <img src={v.logo_url} alt={v.name ?? ""} className="size-full object-cover" />
                ) : (
                  <BuildingIcon className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold group-hover:text-primary">{v.name}</div>
                <div className="truncate text-xs text-muted-foreground">[{v.tag}]</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MyApplicationsSection() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(listMyJoinRequests);
  const cancelReq = useServerFn(cancelJoinRequest);

  const { data, isLoading } = useQuery({
    queryKey: ["my-applications"],
    queryFn: () => fetchMine(),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const channel = supabase
      .channel("my-applications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vtc_join_requests" },
        () => qc.invalidateQueries({ queryKey: ["my-applications"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  if (isLoading || !data || data.length === 0) return null;

  const dtFmt = (s: string) =>
    new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  async function handleCancel(id: string) {
    if (!confirm("Bewerbung wirklich zurückziehen?")) return;
    try {
      await cancelReq({ data: { requestId: id } });
      toast.success("Bewerbung zurückgezogen");
      qc.invalidateQueries({ queryKey: ["my-applications"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    }
  }

  return (
    <div className="mb-6 panel p-6">
      <div className="flex items-center gap-2">
        <BuildingIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Meine Bewerbungen
        </h2>
      </div>
      <div className="mt-4 divide-y divide-border overflow-hidden rounded-md border border-border">
        {data.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-4 bg-surface-2/40 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background">
                {r.vtc?.logo_url ? (
                  <img src={r.vtc.logo_url} alt={r.vtc.name} className="size-full object-cover" />
                ) : (
                  <BuildingIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {r.vtc?.name ?? "Unbekannte Spedition"}
                  {r.vtc?.tag ? <span className="ml-2 text-xs text-muted-foreground">[{r.vtc.tag}]</span> : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Eingereicht {dtFmt(r.created_at)}
                  {r.decided_at ? ` · Entschieden ${dtFmt(r.decided_at)}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {r.status === "pending" && (
                <span className="rounded-full border border-primary/30 bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                  Offen
                </span>
              )}
              {r.status === "accepted" && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
                  Angenommen
                </span>
              )}
              {r.status === "rejected" && (
                <span className="rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5 text-xs font-medium text-destructive">
                  Abgelehnt
                </span>
              )}
              {r.status === "cancelled" && (
                <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted-foreground">
                  Zurückgezogen
                </span>
              )}
              {r.status === "pending" && (
                <button
                  onClick={() => handleCancel(r.id)}
                  className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground hover:border-destructive hover:text-destructive"
                >
                  Zurückziehen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

