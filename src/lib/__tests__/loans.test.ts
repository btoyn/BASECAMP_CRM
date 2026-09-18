import { describe, expect, it } from "vitest";
import { approvedTotal, isLoanOutcome, parseAmount, splitLoanBook } from "../loans";

const row = (
  active: boolean,
  closingOutcome: string | null,
  approvedAmount: number | null = null,
) => ({ active, closingOutcome, approvedAmount });

describe("splitLoanBook", () => {
  it("splits the three states", () => {
    const book = splitLoanBook([
      row(true, null),
      row(false, "sba_approved", 1_250_000),
      row(false, "did_not_happen"),
      row(true, null),
    ]);
    expect(book.active).toHaveLength(2);
    expect(book.approved).toHaveLength(1);
    expect(book.dead).toHaveLength(1);
  });

  it("counts an unexplained stop as dead, not as a win", () => {
    // Inflating the approval count is the one dishonest direction to fail in.
    const book = splitLoanBook([row(false, null)]);
    expect(book.approved).toHaveLength(0);
    expect(book.dead).toHaveLength(1);
  });

  it("ignores an outcome left on a loan that is active again", () => {
    // Reopening clears the outcome, but a stale value must not move the row.
    const book = splitLoanBook([row(true, "sba_approved")]);
    expect(book.active).toHaveLength(1);
    expect(book.approved).toHaveLength(0);
  });

  it("handles an empty book", () => {
    expect(splitLoanBook([])).toEqual({ active: [], approved: [], dead: [] });
  });
});

describe("approvedTotal", () => {
  it("adds up only the approved loans", () => {
    const total = approvedTotal([
      row(false, "sba_approved", 1_000_000),
      row(false, "sba_approved", 250_000),
      row(false, "did_not_happen", 999),
      row(true, null, 999),
    ]);
    expect(total).toEqual({ count: 2, amount: 1_250_000, missingAmount: 0 });
  });

  it("says how many amounts it doesn't have", () => {
    // A total covering two of three reads as the whole book unless it says so.
    const total = approvedTotal([
      row(false, "sba_approved", 500_000),
      row(false, "sba_approved", null),
      row(false, "sba_approved", null),
    ]);
    expect(total).toEqual({ count: 3, amount: 500_000, missingAmount: 2 });
  });

  it("is zero on an empty book", () => {
    expect(approvedTotal([])).toEqual({ count: 0, amount: 0, missingAmount: 0 });
  });
});

describe("parseAmount", () => {
  it("takes money the way it gets typed", () => {
    expect(parseAmount("1250000")).toBe(1_250_000);
    expect(parseAmount("1,250,000")).toBe(1_250_000);
    expect(parseAmount("$1,250,000")).toBe(1_250_000);
    expect(parseAmount(" 900000 ")).toBe(900_000);
  });

  it("returns null for nothing typed", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });

  it("refuses rubbish rather than storing a zero", () => {
    // A zero here would show as an approval worth nothing.
    expect(parseAmount("about a million")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("-5000")).toBeNull();
  });
});

describe("isLoanOutcome", () => {
  it("knows the two endings and nothing else", () => {
    expect(isLoanOutcome("sba_approved")).toBe(true);
    expect(isLoanOutcome("did_not_happen")).toBe(true);
    // The old value, retired: approval is the finish line, closing isn't.
    expect(isLoanOutcome("sent_to_closing")).toBe(false);
    expect(isLoanOutcome(null)).toBe(false);
  });
});
