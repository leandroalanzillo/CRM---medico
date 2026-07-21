// Validators inspired by ClinicCare's CPF/CRM validation layer
// (https://github.com/nathadriele/cliniccare-medical-clinic-management-system)
// Adapted to TypeScript for use in forms across the app.

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

/** Formats a string of digits as a Brazilian CPF: 000.000.000-00 */
export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/**
 * Validates a Brazilian CPF using the official check-digit algorithm.
 * Returns true for empty strings (CPF is optional in the patient form) —
 * callers should check length separately if the field is required.
 */
export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (!cpf) return true;
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all same digit, e.g. 111.111.111-11

  const calcCheckDigit = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * (factor - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const digit1 = calcCheckDigit(cpf.slice(0, 9), 10);
  const digit2 = calcCheckDigit(cpf.slice(0, 10), 11);
  return digit1 === parseInt(cpf[9], 10) && digit2 === parseInt(cpf[10], 10);
}

/**
 * Validates a Brazilian medical/professional council registration
 * (CRM, CRO, CRP, COREN, etc.) in formats like "123456/SP", "CRM/SP 123456"
 * or plain "123456 SP". Returns true for empty strings (optional field).
 */
export function isValidRegistration(value: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  // UF can appear right after the council prefix ("CRM/SP 123456") or at
  // the end ("123456/SP", "123456 SP") — both are common in the wild, so
  // both capture groups are checked; at least one must match.
  const pattern = /^(?:[A-Z]{2,6}\/?)?\s?(?:([A-Z]{2})[\s/])?\d{3,7}(?:[\s/-]?([A-Z]{2}))?$/i;
  const m = v.match(pattern);
  return !!m && !!(m[1] || m[2]);
}

/** Normalizes a registration string to "CRM/UF 000000" style for display. */
export function formatRegistration(value: string): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const match = v.match(
    /^(?:([A-Z]{2,6})\/?\s?)?(?:([A-Z]{2})[\s/])?(\d{3,7})(?:[\s/-]?([A-Z]{2}))?$/i,
  );
  if (!match) return v;
  const [, council, ufBefore, number, ufAfter] = match;
  const uf = ufBefore ?? ufAfter;
  if (!uf) return v;
  return `${(council || "CRM").toUpperCase()}/${uf.toUpperCase()} ${number}`;
}

export function isValidEmail(value: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Formats a string of digits as a Brazilian phone: (00) 00000-0000 */
export function formatPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}
