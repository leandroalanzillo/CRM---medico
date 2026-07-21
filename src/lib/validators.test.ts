import { describe, it, expect } from "vitest";
import {
  onlyDigits,
  formatCPF,
  isValidCPF,
  isValidRegistration,
  formatRegistration,
  isValidEmail,
  formatPhone,
} from "@/lib/validators";

describe("onlyDigits", () => {
  it("strips everything but digits", () => {
    expect(onlyDigits("(11) 98765-4321")).toBe("11987654321");
    expect(onlyDigits("123.456.789-09")).toBe("12345678909");
  });

  it("handles empty/undefined gracefully", () => {
    expect(onlyDigits("")).toBe("");
    // @ts-expect-error deliberately testing the null-safety guard
    expect(onlyDigits(null)).toBe("");
  });
});

describe("formatCPF", () => {
  it("formats 11 digits as 000.000.000-00", () => {
    expect(formatCPF("11144477735")).toBe("111.444.777-35");
  });

  it("truncates extra digits beyond 11", () => {
    expect(formatCPF("111444777359999")).toBe("111.444.777-35");
  });
});

describe("isValidCPF", () => {
  it("accepts a real, valid CPF (known-good check digits)", () => {
    expect(isValidCPF("111.444.777-35")).toBe(true);
    expect(isValidCPF("11144477735")).toBe(true);
  });

  it("rejects a CPF with a wrong check digit", () => {
    expect(isValidCPF("111.444.777-36")).toBe(false);
  });

  it("rejects all-same-digit CPFs (a common fake-data pattern)", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
    expect(isValidCPF("000.000.000-00")).toBe(false);
  });

  it("rejects the wrong number of digits", () => {
    expect(isValidCPF("123456789")).toBe(false);
    expect(isValidCPF("123456789012")).toBe(false);
  });

  it("treats an empty CPF as valid (the field is optional in the patient form)", () => {
    expect(isValidCPF("")).toBe(true);
  });
});

describe("isValidRegistration", () => {
  it("accepts common CRM/CRO formats", () => {
    expect(isValidRegistration("CRM/SP 123456")).toBe(true);
    expect(isValidRegistration("123456/SP")).toBe(true);
    expect(isValidRegistration("123456 SP")).toBe(true);
  });

  it("rejects garbage input", () => {
    expect(isValidRegistration("not-a-registration")).toBe(false);
  });

  it("treats empty as valid (optional field)", () => {
    expect(isValidRegistration("")).toBe(true);
  });
});

describe("formatRegistration", () => {
  it("normalizes to CRM/UF 000000 style", () => {
    expect(formatRegistration("123456/SP")).toBe("CRM/SP 123456");
    expect(formatRegistration("CRO/RJ 654321")).toBe("CRO/RJ 654321");
  });

  it("normalizes UF-before-number input too (e.g. typed as CRM/SP 123456)", () => {
    // Different spacing than the canonical output, so this only passes if
    // the function actually re-derives the format instead of returning the
    // input unchanged.
    expect(formatRegistration("crm/sp 123456")).toBe("CRM/SP 123456");
  });

  it("returns the original string unchanged if it doesn't match the pattern", () => {
    expect(formatRegistration("garbage")).toBe("garbage");
  });
});

describe("isValidEmail", () => {
  it("accepts a normal email", () => {
    expect(isValidEmail("ana@example.com")).toBe(true);
  });

  it("rejects missing @ or domain", () => {
    expect(isValidEmail("ana@")).toBe(false);
    expect(isValidEmail("anaexample.com")).toBe(false);
  });

  it("treats empty as valid (optional field)", () => {
    expect(isValidEmail("")).toBe(true);
  });
});

describe("formatPhone", () => {
  it("formats a landline-length number (10 digits)", () => {
    expect(formatPhone("1133334444")).toBe("(11) 3333-4444");
  });

  it("formats a mobile-length number (11 digits)", () => {
    expect(formatPhone("11987654321")).toBe("(11) 98765-4321");
  });

  it("truncates beyond 11 digits", () => {
    expect(formatPhone("119876543219999")).toBe("(11) 98765-4321");
  });
});
