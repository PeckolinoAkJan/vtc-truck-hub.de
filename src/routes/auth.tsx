import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup", "forgot", "reset"]).optional(),
  redirect: z.string().optional(),
  role: z.enum(["founder", "driver"]).optional(),
});

function authErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as {
      message?: unknown;
      error_description?: unknown;
      code?: unknown;
      status?: unknown;
    };
    const message =
      typeof details.message === "string"
        ? details.message
        : typeof details.error_description === "string"
          ? details.error_description
          : "";
    const suffix = [
      typeof details.code === "string" ? `Code: ${details.code}` : "",
      typeof details.status === "number" ? `Status: ${details.status}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    if (message) return suffix ? `${message} (${suffix})` : message;
    if (suffix) return `Anmeldung fehlgeschlagen (${suffix})`;
  }

  return error instanceof Error && error.message
    ? error.message
    : "Fehler bei der Anmeldung";
}

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Anmelden — VTC Hub" },
      { name: "description", content: "Melde dich bei deiner VTC an oder erstelle ein Konto." },
    ],
  }),
});

function AuthPage() {
  const { mode: initialMode, redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();
  const googleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(
    initialMode ?? "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const safeRedirect =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : null;
  const nextTarget = safeRedirect ?? "/app";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && mode !== "reset") {
        navigate({ to: nextTarget, replace: true });
      }
    });
  }, [mode, navigate, nextTarget]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?mode=reset`,
        });
        if (error) throw error;
        toast.success("Wir haben dir einen Link zum Zurücksetzen geschickt.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Dein neues Passwort wurde gespeichert.");
        navigate({ to: nextTarget, replace: true });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Konto erstellt");
        navigate({ to: nextTarget, replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: nextTarget, replace: true });
      }
    } catch (err) {
      toast.error(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}${nextTarget}`,
      },
    });
    if (error) {
      toast.error(error.message || "Google-Anmeldung fehlgeschlagen");
      setLoading(false);
    }
  }

  return (
    <div className="hero-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Truck className="size-4" />
          </div>
          <span className="text-lg font-semibold">VTC Hub</span>
        </Link>
        <div className="panel p-6">
          <h1 className="text-xl font-semibold">
            {mode === "signup"
              ? "Konto erstellen"
              : mode === "forgot"
                ? "Passwort zurücksetzen"
                : mode === "reset"
                  ? "Neues Passwort"
                  : "Willkommen zurück"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signup"
              ? "Erstelle deine VTC oder tritt einer bestehenden bei."
              : mode === "forgot"
                ? "Wir senden dir einen sicheren Link per E-Mail."
                : mode === "reset"
                  ? "Lege ein neues Passwort mit mindestens 8 Zeichen fest."
                  : "Melde dich mit deinem Konto an."}
          </p>

          {googleAuthEnabled && (
            <>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
              >
                <GoogleIcon /> Mit Google fortfahren
              </button>

              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> ODER{" "}
                <div className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <Field
                label="Anzeigename"
                value={displayName}
                onChange={setDisplayName}
                placeholder="z. B. Max Mustermann"
              />
            )}
            {mode !== "reset" && (
              <Field label="E-Mail" type="email" value={email} onChange={setEmail} required />
            )}
            {mode !== "forgot" && (
              <Field
                label={mode === "reset" ? "Neues Passwort" : "Passwort"}
                type="password"
                value={password}
                onChange={setPassword}
                required
                minLength={8}
              />
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {loading
                ? "…"
                : mode === "signup"
                  ? "Registrieren"
                  : mode === "forgot"
                    ? "Link anfordern"
                    : mode === "reset"
                      ? "Passwort speichern"
                      : "Anmelden"}
            </button>
          </form>

          {mode === "signin" && (
            <button
              type="button"
              className="mt-4 w-full text-center text-sm text-primary hover:underline"
              onClick={() => setMode("forgot")}
            >
              Passwort vergessen?
            </button>
          )}

          <div className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "forgot" || mode === "reset" ? (
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setMode("signin")}
              >
                Zurück zur Anmeldung
              </button>
            ) : (
              <>
                {mode === "signup" ? "Schon Konto?" : "Neu hier?"}{" "}
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
                >
                  {mode === "signup" ? "Anmelden" : "Konto erstellen"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  minLength,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        placeholder={placeholder}
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
