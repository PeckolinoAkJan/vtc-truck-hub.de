export const currency = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v || 0);
};

export const km = (n: number | string | null | undefined) => {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(v || 0)} km`;
};

export const dt = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function randomCode(len = 8) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Cryptographically secure token generation. Rejection sampling avoids
  // modulo bias so codes are uniformly distributed across the alphabet.
  const bytes = new Uint8Array(len * 2);
  let out = "";
  const max = 256 - (256 % alphabet.length);
  while (out.length < len) {
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && out.length < len; i++) {
      const b = bytes[i];
      if (b < max) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}
