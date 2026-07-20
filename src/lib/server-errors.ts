// Shared helpers for authenticated server functions.
// Never leak raw Postgres/PostgREST error text (constraint names, columns,
// RLS policy text, …) to the client. Log the full details server-side with
// a correlation id and throw a small, safe message instead.

import { logInternalError, newRequestId } from "./public-api-errors";

const GENERIC_DB_MESSAGE =
  "Ein Datenbankfehler ist aufgetreten. Bitte versuche es später erneut.";

/**
 * Log a Postgres/PostgREST (or any thrown) error with a fresh request id and
 * return an `Error` carrying only a generic, user-safe message. Throw the
 * returned error from the caller so TanStack serializes the sanitized text.
 *
 *   const { error } = await supabase.from("x").select();
 *   if (error) throw dbError(error, "listX");
 */
export function dbError(err: unknown, endpoint = "server-fn"): Error {
  const requestId = newRequestId();
  logInternalError(requestId, endpoint, "SERVER_FN", err);
  return new Error(`${GENERIC_DB_MESSAGE} (Ref: ${requestId})`);
}

/**
 * Variant that lets the caller supply a specific user-safe message
 * (e.g. "Dokument nicht gefunden") while still logging the raw error only
 * on the server.
 */
export function safeError(
  err: unknown,
  userMessage: string,
  endpoint = "server-fn",
): Error {
  const requestId = newRequestId();
  logInternalError(requestId, endpoint, "SERVER_FN", err);
  return new Error(userMessage);
}
