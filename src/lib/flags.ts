/**
 * Feature flags (spec §39.9). Everything integration-shaped defaults off and
 * turns on via environment variables, so the core CRM always works with
 * nothing connected.
 */

export interface FeatureFlags {
  /** Microsoft Graph is configured on this deployment. A user still has to
   *  connect their own account in Settings before anything reads a calendar. */
  microsoft: boolean;
  /** AI drafting and extraction. */
  ai: boolean;
  /** Campaign queue → Outlook draft release. Depends on microsoft. */
  campaignQueue: boolean;
  /** Content intelligence (SBA news watchlist). Phase 2. */
  contentIntelligence: boolean;
  /** Expensify CSV import. */
  expenseImport: boolean;
  /** Outbound email (digest, reminders) via Resend. */
  outboundEmail: boolean;
  /** Whether anyone with the URL may create an account. Closed by default. */
  signupsOpen: boolean;
}

export function getFlags(): FeatureFlags {
  // All three, not just the client id: without the encryption key the OAuth
  // flow refuses to start rather than write refresh tokens in the clear.
  const microsoft = Boolean(
    process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY,
  );
  return {
    microsoft,
    ai: Boolean(process.env.ANTHROPIC_API_KEY) && process.env.AI_DISABLED !== "true",
    campaignQueue: microsoft,
    contentIntelligence: process.env.CONTENT_INTELLIGENCE_ENABLED === "true",
    expenseImport: true, // CSV import has no external dependency
    outboundEmail: Boolean(process.env.RESEND_API_KEY),
    // Private workspace: accounts are created deliberately, not by anyone
    // who finds the URL. Set NEXT_PUBLIC_SIGNUPS_OPEN=true to reopen.
    signupsOpen: process.env.NEXT_PUBLIC_SIGNUPS_OPEN === "true",
  };
}
