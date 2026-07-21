import { describe, it, expect } from "vitest";
import { brl, fmtDate, fmtDateTime, fmtTime, initials, isOverdue } from "@/lib/format";

describe("brl", () => {
  it("formats a positive number as BRL currency", () => {
    expect(brl(1234.5)).toBe("R$\u00A01.234,50");
  });

  it("treats null/undefined as zero instead of throwing", () => {
    expect(brl(null)).toBe("R$\u00A00,00");
    expect(brl(undefined)).toBe("R$\u00A00,00");
  });

  it("formats zero correctly", () => {
    expect(brl(0)).toBe("R$\u00A00,00");
  });
});

describe("fmtDate / fmtDateTime / fmtTime", () => {
  it("returns an em dash for null/undefined instead of a bogus date", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDateTime(null)).toBe("—");
    expect(fmtTime(null)).toBe("—");
  });

  it("formats a known date in dd/mm/yyyy", () => {
    // Noon UTC avoids the date shifting a day depending on the local
    // timezone the test runner happens to execute in.
    expect(fmtDate("2026-07-21T12:00:00Z")).toBe("21/07/2026");
  });

  it("includes hour and minute in fmtDateTime but not in fmtDate", () => {
    const withTime = fmtDateTime("2026-07-21T15:30:00");
    expect(withTime).toContain("21/07/2026");
    expect(withTime).toMatch(/15:30|3:30/); // 24h or 12h locale rendering
  });
});

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Ana Beatriz Souza")).toBe("AB");
  });

  it("handles a single name", () => {
    expect(initials("Madonna")).toBe("M");
  });

  it("falls back to '?' for empty/null input", () => {
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
    expect(initials("")).toBe("?");
  });

  it("ignores extra whitespace between names", () => {
    expect(initials("  Ana   Souza  ")).toBe("AS");
  });
});

describe("isOverdue", () => {
  it("is never overdue if status isn't pending", () => {
    expect(isOverdue("paid", "2000-01-01")).toBe(false);
    expect(isOverdue("cancelled", "2000-01-01")).toBe(false);
  });

  it("is overdue when pending and due_date is in the past", () => {
    expect(isOverdue("pending", "2000-01-01")).toBe(true);
  });

  it("is not overdue when pending and due_date is far in the future", () => {
    expect(isOverdue("pending", "2999-01-01")).toBe(false);
  });
});
