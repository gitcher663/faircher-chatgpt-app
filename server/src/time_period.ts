const VALID_TIME_PERIODS = new Set([
  "today",
  "yesterday",
  "last_7_days",
  "last_30_days"
]);

const RANGE_REGEX = /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

function currentQuarterToDateRange(): string {
  const today = new Date();
  const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
  const quarterStart = new Date(today.getFullYear(), quarterStartMonth, 1);

  return `${formatDate(quarterStart)}..${formatDate(today)}`;
}

export function normalizeTimePeriod(input?: string | null): string {
  const trimmed = (input ?? "").trim();
  if (!trimmed) {
    return currentQuarterToDateRange();
  }

  const normalized = trimmed.toLowerCase();

  if (normalized === "last 7 days") {
    return "last_7_days";
  }

  if (normalized === "last 30 days") {
    return "last_30_days";
  }

  if (VALID_TIME_PERIODS.has(normalized)) {
    return normalized;
  }

  if (RANGE_REGEX.test(trimmed)) {
    return trimmed;
  }

  if (
    normalized === "last_365_days" ||
    normalized === "last year" ||
    normalized === "past year" ||
    normalized === "rolling 12 months"
  ) {
    return currentQuarterToDateRange();
  }

  return currentQuarterToDateRange();
}
