import { ValidationError } from "./errors.js";

const MAX_DOMAIN_LENGTH = 253;

function isValidLabel(label: string): boolean {
  if (!/^[a-z0-9-]+$/.test(label)) {
    return false;
  }

  if (label.startsWith("-") || label.endsWith("-")) {
    return false;
  }

  return label.length >= 1 && label.length <= 63;
}

function isValidDomain(domain: string): boolean {
  if (!domain || domain.length > MAX_DOMAIN_LENGTH) {
    return false;
  }

  if (/[\/\s]/.test(domain)) {
    return false;
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    return false;
  }

  if (!labels.every(isValidLabel)) {
    return false;
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld)) {
    return false;
  }

  return true;
}

export function normalizeDomain(input: string): string {
  let normalized = input.trim().toLowerCase();

  if (!normalized) {
    throw new ValidationError("Domain is required.");
  }

  normalized = normalized.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/^www\d*\./, "");
  normalized = normalized.replace(/:\d+(?=\/|$)/, "");
  normalized = normalized.split("/")[0];
  normalized = normalized.split("?")[0];
  normalized = normalized.split("#")[0];

  if (!isValidDomain(normalized)) {
    throw new ValidationError("Domain must be a valid apex domain.");
  }

  return normalized;
}
