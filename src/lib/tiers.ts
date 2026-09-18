/**
 * Tiers — how often each kind of relationship is worth touching.
 *
 * A tier is the answer to "how much of me does this lender get". A and B both
 * get a month: A has sent something, B is the bet that they will. C is a good
 * relationship that has produced nothing in two and a half years, and gets a
 * quarter. D is cold and gets twice a year, purely so they remember he exists.
 * One rolling window per tier, never a calendar reset.
 *
 * A and B share a cadence but not a bar — see `countsAsTouch`. For those two,
 * an email he sent into silence does not restart the clock; for C and D it
 * does. That is the difference between a relationship and a mailing list.
 *
 * The cadence lives here rather than in a column because it is a rule about
 * tiers, not a fact about a lender. Changing what B means should change every
 * B lender at once.
 */

export type Tier = "A" | "B" | "C" | "D" | "unassigned";

/** Display order: the short list first, the unsorted pile last. */
export const TIERS: Tier[] = ["A", "B", "C", "D", "unassigned"];

export const TIER_LABEL: Record<Tier, string> = {
  A: "Tier A",
  B: "Tier B",
  C: "Tier C",
  D: "Tier D",
  unassigned: "No tier",
};

export const TIER_MEANING: Record<Tier, string> = {
  A: "Has sent me deals",
  B: "Real potential",
  C: "Good relationship, no deals",
  D: "Stay on the radar",
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
  A: 30,
  B: 30,
  C: 90,
  D: 180,
  unassigned: null,
};

export const TIER_CADENCE: Record<Tier, string> = {
  A: "Monthly",
  B: "Monthly",
  C: "Quarterly",
  D: "Twice a year",
  unassigned: "Workspace default",
};

/**
 * Tiers where a touch has to have been two-way to count.
 *
 * A and B are people he is actively working. Letting an unanswered email mark
 * them as covered would produce a green list of relationships that had gone
 * quiet, which is the one thing this app exists to prevent.
 */
export const TIERS_NEEDING_CONVERSATION: readonly Tier[] = ["A", "B"];

export function isTier(value: string): value is Tier {
  return (
    value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D" ||
    value === "unassigned"
  );
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

/**
 * Activity types that are two-way by their nature.
 *
 * Sitting down with someone, or them coming back to you, is evidence the
 * relationship is alive. A sent email is evidence only that you typed. The
 * split is about who spoke last, not about effort or formality: an incoming
 * email counts and a carefully written outgoing one does not.
 *
 * `text` counts. A text is a medium people answer, and treating a thread as
 * one-way would mean nagging him to re-contact someone he swapped messages
 * with yesterday.
 */
const CONVERSATION_TYPES: ReadonlySet<string> = new Set([
  "incoming_email",
  "text",
  "call",
  "lunch",
  "breakfast",
  "golf",
  "office_visit",
  "pop_in",
  "general_meeting",
  "deal_conversation",
  "sba_question",
]);

/**
 * Whether this activity restarts the clock for a lender in this tier.
 *
 * For A and B it has to be a real exchange. For everyone else any contact
 * counts — the point at C and D is that they heard from him, not that they
 * replied.
 *
 * A campaign email never counts, for anybody. Being one of two hundred names
 * on a blast is not being thought about, and letting it mark a whole tier as
 * covered would turn the send button into a way of clearing the list.
 */
export function countsAsTouch(activityType: string, tier: string | null | undefined): boolean {
  if (activityType === "campaign_email") return false;
  if (!TIERS_NEEDING_CONVERSATION.includes(readTier(tier))) return true;
  return CONVERSATION_TYPES.has(activityType);
}

/**
 * Which of the two clocks this lender's tier is judged against.
 *
 * The coverage view keeps both: the last contact of any kind, and the last one
 * somebody else took part in. A and B are held to the second, everyone else to
 * the first. Picking between them here rather than in the query means the rule
 * stays next to the tiers it belongs to.
 */
export function qualifyingTouchAt(
  tier: string | null | undefined,
  touches: { personal: string | null; conversation: string | null },
): string | null {
  return TIERS_NEEDING_CONVERSATION.includes(readTier(tier))
    ? touches.conversation
    : touches.personal;
}
