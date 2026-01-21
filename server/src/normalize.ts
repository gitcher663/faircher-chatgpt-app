import { ValidationError } from "./errors.js";

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) {
    throw new ValidationError("Domain is required.");
  }

  // Strip protocol and trailing slash
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}
