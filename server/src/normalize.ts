import { ValidationError } from "./errors";

export function normalizeDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed) {
    throw new ValidationError("Domain is required.");
  }

  // TODO: Add more robust domain parsing/validation.
  return trimmed.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
