const REDVEG_TIME_ZONE = "Asia/Kolkata";

export function getISTDateInputValue(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REDVEG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getISTHour(date = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: REDVEG_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
}

/**
 * SQLite CURRENT_TIMESTAMP values are UTC strings without a timezone suffix.
 * JavaScript treats those as browser-local time, so attach Z before parsing.
 * ISO timestamps that already carry a timezone are left untouched.
 */
export function parseBackendDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const isSqliteTimestamp = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(normalized);
  const date = new Date(isSqliteTimestamp && !hasTimezone
    ? `${normalized.replace(" ", "T")}Z`
    : normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatISTDateTime(
  value?: string | null,
  options: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  },
): string {
  const date = parseBackendDateTime(value);
  return date
    ? new Intl.DateTimeFormat("en-IN", { ...options, timeZone: REDVEG_TIME_ZONE }).format(date)
    : "Time unavailable";
}

export function formatISTDate(value?: string | null): string {
  const date = parseBackendDateTime(value);
  return date
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: REDVEG_TIME_ZONE,
      }).format(date)
    : value || "—";
}
