// Shared helpers for public API endpoints — safe, generic error responses.
// Never leak database internals, Supabase error details, or exception text.

export type PublicErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "server_error"
  | "service_unavailable";

const PUBLIC_MESSAGES: Record<PublicErrorCode, string> = {
  bad_request: "Ungültige Anfrage.",
  unauthorized: "Authentifizierung erforderlich.",
  forbidden: "Keine Berechtigung für diese Aktion.",
  not_found: "Die angeforderte Ressource wurde nicht gefunden.",
  conflict: "Die Anfrage konnte aufgrund eines Konflikts nicht verarbeitet werden.",
  rate_limited: "Zu viele Anfragen. Bitte später erneut versuchen.",
  server_error: "Die Anfrage konnte nicht verarbeitet werden.",
  service_unavailable: "Der Dienst ist vorübergehend nicht verfügbar.",
};

const CODE_TO_STATUS: Record<PublicErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  server_error: 500,
  service_unavailable: 503,
};

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Build a safe public error response. The response body only contains the
 * generic, pre-approved message plus a requestId that can be correlated with
 * server logs. Full error details are logged server-side by the caller.
 */
export function publicError(
  code: PublicErrorCode,
  opts: { requestId?: string; status?: number } = {},
): Response {
  const requestId = opts.requestId ?? newRequestId();
  const status = opts.status ?? CODE_TO_STATUS[code];
  const message = PUBLIC_MESSAGES[code];
  return new Response(
    JSON.stringify({
      ok: false,
      error: message,
      code: code.toUpperCase(),
      requestId,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

/**
 * Log an internal error with request context. Sensitive header values
 * (Authorization, api keys, tokens) are never included.
 */
export function logInternalError(
  requestId: string,
  endpoint: string,
  method: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  const payload: Record<string, unknown> = {
    requestId,
    endpoint,
    method,
    ts: new Date().toISOString(),
  };
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      stack?: unknown;
      name?: unknown;
    };
    payload.errName = typeof e.name === "string" ? e.name : undefined;
    payload.errMessage = typeof e.message === "string" ? e.message : undefined;
    payload.errCode = typeof e.code === "string" ? e.code : undefined;
    payload.errDetails = typeof e.details === "string" ? e.details : undefined;
    payload.errHint = typeof e.hint === "string" ? e.hint : undefined;
    payload.errStack = typeof e.stack === "string" ? e.stack : undefined;
  } else {
    payload.err = String(err);
  }
  if (extra) Object.assign(payload, extra);
  // Single-line, machine-parseable log entry. No secrets are ever included.
  console.error(`[public-api-error] ${JSON.stringify(payload)}`);
}
