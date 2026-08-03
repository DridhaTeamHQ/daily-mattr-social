import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1240 → "1,240". Indian grouping reads oddly for point totals, so keep it plain. */
export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Signed display for ledger rows: +50 / −20. */
export function formatDelta(n: number) {
  return n < 0 ? `−${formatNumber(Math.abs(n))}` : `+${formatNumber(n)}`;
}

export function formatDate(value: string | Date, withTime = false) {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

/** "3 days left" / "Ended" — for campaign deadlines. */
export function timeRemaining(endsAt: string | Date | null): string {
  if (!endsAt) return "No deadline";
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const ms = end.getTime() - Date.now();
  if (ms <= 0) return "Ended";

  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day left" : `${days} days left`;
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Human-readable referral / survey codes.
 *
 * Crockford-ish alphabet: no 0/O/1/I/L/U. Students read these off a screen and
 * type them into a phone, and we do not want "DMTR-0O1I" support tickets.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function randomCode(length: number, bytes?: Uint8Array) {
  const src = bytes ?? crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[src[i] % CODE_ALPHABET.length];
  }
  return out;
}
