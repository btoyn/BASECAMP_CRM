/**
 * Tiers — how often each kind of relationship is worth touching.
 *
 * A tier is the answer to "how much of me does this lender get". The A list is
 * short and gets a fortnight; B is the steady middle at a month; C is everyone
 * worth staying in front of, quarterly. One rolling window per tier, never a
 * calendar reset — same rule the flat 30-day goal always followed, just three
 * of them.
 *
 * The cadence lives here rather than in a column because it is a rule about
 * tiers, not a fact about a lender. Changing what B means should change every
 * B lender at once.
 */

export type Tier = "A" | "B" | "C" | "unassigned";

/** Display order: the short list first, the unsorted pile last. */
export const TIERS: Tier[] = ["A", "B", "C", "unassigned"];

export const TIER_LABEL: Record<Tier, string> = {
  A: "Tier A",
  B: "Tier B",
  C: "Tier C",
  unassigned: "No tier",
};

export const TIER_MEANING: Record<Tier, string> = {
  A: "Best lenders",
  B: "Good lenders",
  C: "Stay in front",
  unassigned: "Not sorted yet",
};

/**
 * Contact goal in days, per tier.
 *
 * `unassigned` has no cadence of its own and falls back to the workspace goal
 * from Settings — an untiered lender is an unanswered question, not a quarterly
 * one, and quietly filing them at 90 days would hide that.
 */
export const TIER_GOAL_DAYS: Record<Tier, number | null> = {
  A: 14,
  B: 30,
  C: 90,
  unassigned: null,
};

export const TIER_CADENCE: Record<Tier, string> = {
  A: "Every two weeks",
  B: "Monthly",
  C: "Quarterly",
  unassigned: "Workspace default",
};

export function isTier(value: string): value is Tier {
  return value === "A" || value === "B" || value === "C" || value === "unassigned";
}

/** The tier as stored, with anything unrecognised treated as untiered. */
export function readTier(value: string | null | undefined): Tier {
  return value && isTier(value) ? value : "unassigned";
}

/** How many days this lender's tier allows between touches. */
export function tierGoalDays(tier: string | null | undefined, workspaceGoalDays: number): number {
  return TIER_GOAL_DAYS[readTier(tier)] ?? workspaceGoalDays;
}

export interface TierSummary {
  tier: Tier;
  label: string;
  meaning: string;
  cadence: string;
  /** Lenders in this tier. */
  total: number;
  /** Of those, how many are inside their own tier's window. */
  covered: number;
  /** Rounded percentage, 0 when the tier is empty. */
  pct: number;
}

/**
 * Counts and coverage per tier, for the top row of Spheres.
 *
 * Coverage is measured against each tier's own cadence, so an A lender touched
 * three weeks ago reads as behind while a C lender touched the same day reads
 * as fine. That difference is the entire point of tiering them.
 */
export function summarizeTiers(
  lenders: { tier: string | null; covered: boolean }[],
): TierSummary[] {
  const tally = new Map<Tier, { total: number; covered: number }>(
    TIERS.map((t) => [t, { total: 0, covered: 0 }]),
  );

  for (const lender of lenders) {
    const entry = tally.get(readTier(lender.tier))!;
    entry.total += 1;
    if (lender.covered) entry.covered += 1;
  }

  return TIERS.map((tier) => {
    const { total, covered } = tally.get(tier)!;
    return {
      tier,
      label: TIER_LABEL[tier],
      meaning: TIER_MEANING[tier],
      cadence: TIER_CADENCE[tier],
      total,
      covered,
      pct: total === 0 ? 0 : Math.round((covered / total) * 100),
    };
  });
}
