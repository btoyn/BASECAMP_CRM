import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMicrosoftConfig, tokenUrl, type MicrosoftConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { expiryFromSeconds, isConsentLost, needsRefresh } from "./expiry";

/**
 * The stored Microsoft connection, and keeping its access token fresh.
 *
 * Every read goes through `getAccessToken`, which refreshes before handing
 * anything back. Callers never see a token that is about to expire, and never
 * have to think about it.
 */

export interface MicrosoftConnection {
  accountEmail: string | null;
  scopes: string[];
  connectedAt: string;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
}

/** What the connection looks like from Settings. Never includes a token. */
export async function getConnection(): Promise<MicrosoftConnection | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("microsoft_connections")
    .select("account_email, scopes, connected_at, invalidated_at, invalidated_reason")
    .maybeSingle();
  if (!data) return null;

  return {
    accountEmail: data.account_email,
    scopes: data.scopes ?? [],
    connectedAt: data.connected_at,
    invalidatedAt: data.invalidated_at,
    invalidatedReason: data.invalidated_reason,
  };
}

export type AccessTokenResult =
  | { token: string; scopes: string[] }
  | { error: "not_configured" | "not_connected" | "reconnect_needed" | "unavailable" };

/**
 * A usable access token, refreshing first if it is close to expiring.
 *
 * The four failures are kept apart because they need different words on
 * screen: nobody has registered the app, this user hasn't connected, the
 * consent died and they must connect again, or Microsoft is simply having a
 * bad minute and it is worth trying later.
 */
export async function getAccessToken(): Promise<AccessTokenResult> {
  const config = getMicrosoftConfig();
  if (!config) return { error: "not_configured" };

  const supabase = await createClient();
  const { data } = await supabase
    .from("microsoft_connections")
    .select(
      "user_id, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, scopes, invalidated_at",
    )
    .maybeSingle();

  if (!data) return { error: "not_connected" };
  if (data.invalidated_at) return { error: "reconnect_needed" };

  if (!needsRefresh(data.access_token_expires_at)) {
    return {
      token: decryptToken(data.access_token_encrypted, config.encryptionKey),
      scopes: data.scopes ?? [],
    };
  }

  const refreshed = await refreshAccessToken(
    config,
    decryptToken(data.refresh_token_encrypted, config.encryptionKey),
  );

  if ("error" in refreshed) {
    if (refreshed.consentLost) {
      await markInvalidated(refreshed.reason);
      return { error: "reconnect_needed" };
    }
    return { error: "unavailable" };
  }

  await storeTokens(refreshed.tokens);
  return { token: refreshed.tokens.accessToken, scopes: refreshed.tokens.scopes };
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/**
 * Swaps a refresh token for a new pair.
 *
 * Microsoft rotates refresh tokens, so the new one is kept — storing only the
 * access token would work for an hour and then quietly stop.
 */
async function refreshAccessToken(
  config: MicrosoftConfig,
  refreshToken: string,
): Promise<{ tokens: TokenSet } | { error: true; consentLost: boolean; reason: string }> {
  let body: TokenResponse;
  try {
    const res = await fetch(tokenUrl(config), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    });
    body = (await res.json()) as TokenResponse;
    if (!res.ok || !body.access_token) {
      const consentLost = isConsentLost({ error: body.error, status: res.status });
      return {
        error: true,
        consentLost,
        reason: body.error_description ?? body.error ?? `HTTP ${res.status}`,
      };
    }
  } catch (cause) {
    // A network blip is not a revoked consent. Say "try later" and leave the
    // connection alone.
    return { error: true, consentLost: false, reason: String(cause) };
  }

  return {
    tokens: {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? refreshToken,
      expiresAt: expiryFromSeconds(body.expires_in ?? 3600),
      scopes: body.scope?.split(" ").filter(Boolean) ?? [],
    },
  };
}

/** Exchanges the authorization code for the first token pair. */
export async function exchangeCodeForTokens(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ tokens: TokenSet } | { error: string }> {
  const config = getMicrosoftConfig();
  if (!config) return { error: "Microsoft is not configured on this deployment." };

  try {
    const res = await fetch(tokenUrl(config), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
        code_verifier: input.codeVerifier,
      }),
      cache: "no-store",
    });
    const body = (await res.json()) as TokenResponse;
    if (!res.ok || !body.access_token || !body.refresh_token) {
      return {
        error: body.error_description ?? body.error ?? `Microsoft returned HTTP ${res.status}`,
      };
    }
    return {
      tokens: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt: expiryFromSeconds(body.expires_in ?? 3600),
        scopes: body.scope?.split(" ").filter(Boolean) ?? [],
      },
    };
  } catch (cause) {
    return { error: `Could not reach Microsoft: ${cause}` };
  }
}

/** Writes the tokens, replacing whatever was there. */
export async function storeTokens(
  tokens: TokenSet,
  profile?: { email: string | null; id: string | null },
): Promise<{ error?: string }> {
  const config = getMicrosoftConfig();
  if (!config) return { error: "Microsoft is not configured on this deployment." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const row: Record<string, unknown> = {
    user_id: user.id,
    access_token_encrypted: encryptToken(tokens.accessToken, config.encryptionKey),
    refresh_token_encrypted: encryptToken(tokens.refreshToken, config.encryptionKey),
    access_token_expires_at: tokens.expiresAt.toISOString(),
    scopes: tokens.scopes,
    invalidated_at: null,
    invalidated_reason: null,
    updated_at: new Date().toISOString(),
  };
  if (profile) {
    row.account_email = profile.email;
    row.microsoft_user_id = profile.id;
    row.connected_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("microsoft_connections")
    .upsert(row, { onConflict: "user_id" });
  return error ? { error: error.message } : {};
}

/**
 * Records that the consent died, without deleting the row.
 *
 * Settings can then say "reconnect, and here's why" rather than looking like
 * it was never connected — which would leave him wondering whether he ever
 * set it up.
 */
export async function markInvalidated(reason: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("microsoft_connections")
    .update({
      invalidated_at: new Date().toISOString(),
      invalidated_reason: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
}

export async function disconnect(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("microsoft_connections")
    .delete()
    .eq("user_id", user.id);
  return error ? { error: error.message } : {};
}
