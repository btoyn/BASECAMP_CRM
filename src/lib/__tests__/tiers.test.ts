import { describe, expect, it } from "vitest";
import { coverageStatus } from "../coverage";
import { TIER_GOAL_DAYS, readTier, summarizeTiers, tierGoalDays } from "../tiers";

const NOW = new Date("2026-09-17T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("tierGoalDays", () => {
  it("gives each tier its own window", () => {
    expect(tierGoalDays("A", 30)).toBe(14);
    expect(tierGoalDays("B", 30)).toBe(30);
    expect(tierGoalDays("C", 30)).toBe(90);
  });

  it("falls back to the workspace goal for an untiered lender", () => {
    // Not quarterly: nobody decided they were a C, and filing them there
    // would hide the decision for three months.
    expect(tierGoalDays("unassigned", 30)).toBe(30);
    expect(tierGoalDays(null, 45)).toBe(45);
    expect(tierGoalDays("nonsense", 21)).toBe(21);
  });
});

describe("readTier", () => {
  it("treats anything unrecognised as untiered", () => {
    expect(readTier("A")).toBe("A");
    expect(readTier(null)).toBe("unassigned");
    expect(readTier("D")).toBe("unassigned");
  });
});

describe("tier cadence through the coverage window", () => {
  it("holds an A lender to a fortnight", () => {
    const opts = { goalDays: TIER_GOAL_DAYS.A!, graceDays: 10 };
    expect(coverageStatus(daysAgo(14), false, opts, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(15), false, opts, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(25), false, opts, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(29), false, opts, NOW)).toBe("seriously_overdue");
  });

  it("lets a C lender go a quarter", () => {
    const opts = { goalDays: TIER_GOAL_DAYS.C!, graceDays: 10 };
    expect(coverageStatus(daysAgo(89), false, opts, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(95), false, opts, NOW)).toBe("grace");
    // Every boundary scales with the goal — a C lender is not "seriously
    // overdue" at 61 days the way the old fixed cut-off would have said.
    expect(coverageStatus(daysAgo(120), false, opts, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(200), false, opts, NOW)).toBe("seriously_overdue");
  });

  it("leaves the default 30-day window exactly where it was", () => {
    expect(coverageStatus(daysAgo(30), false, {}, NOW)).toBe("on_track");
    expect(coverageStatus(daysAgo(40), false, {}, NOW)).toBe("grace");
    expect(coverageStatus(daysAgo(60), false, {}, NOW)).toBe("overdue");
    expect(coverageStatus(daysAgo(61), false, {}, NOW)).toBe("seriously_overdue");
  });
});

describe("summarizeTiers", () => {
  it("counts and measures each tier against itself", () => {
    const summary = summarizeTiers([
      { tier: "A", covered: true },
      { tier: "A", covered: false },
      { tier: "A", covered: true },
      { tier: "B", covered: false },
      { tier: "C", covered: true },
      { tier: null, covered: false },
    ]);

    const byTier = Object.fromEntries(summary.map((s) => [s.tier, s]));
    expect(byTier.A).toMatchObject({ total: 3, covered: 2, pct: 67 });
    expect(byTier.B).toMatchObject({ total: 1, covered: 0, pct: 0 });
    expect(byTier.C).toMatchObject({ total: 1, covered: 1, pct: 100 });
    expect(byTier.unassigned).toMatchObject({ total: 1, covered: 0 });
  });

  it("always returns all four rows, in order, even when empty", () => {
    const summary = summarizeTiers([]);
    expect(summary.map((s) => s.tier)).toEqual(["A", "B", "C", "unassigned"]);
    expect(summary.every((s) => s.total === 0 && s.pct === 0)).toBe(true);
  });
});
