/**
 * When to go and get a fresh access token.
 *
 * Its own file, and pure, because the failure it prevents is the quiet kind:
 * a token that expires mid-request produces a 401 that looks like a revoked
 * consent, and the user gets told to reconnect when nothing was wrong.
 */

/** Refresh this long before expiry, so a slow request can't cross the line. */
export const REFRESH_SKEW_SECONDS = 300;

export function needsRefresh(
  expiresAt: Date | string,
  now: Date = new Date(),
  skewSeconds: number = REFRESH_SKEW_SECONDS,
): boolean {
  const expiry = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  // An unreadable expiry is treated as expired: refreshing needlessly costs one
  // request, while trusting a bad date costs a failed send.
  if (Number.isNaN(expiry.getTime())) return true;
  return expiry.getTime() - now.getTime() <= skewSeconds * 1000;
}

/** Microsoft returns `expires_in` seconds; this is the instant it lands on. */
export function expiryFromSeconds(expiresIn: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + Math.max(0, expiresIn) * 1000);
}

/**
 * Which of these errors means "the user must connect again" rather than
 * "try later".
 *
 * `invalid_grant` is Microsoft's way of saying the refresh token is dead —
 * consent withdrawn, password changed, a conditional-access policy. Anything
 * else (a 500, a timeout) is worth retrying and must not wipe the connection.
 */
export function isConsentLost(error: { error?: string; status?: number }): boolean {
  if (error.error === "invalid_grant") return true;
  if (error.error === "interaction_required") return true;
  if (error.error === "consent_required") return true;
  return false;
}
