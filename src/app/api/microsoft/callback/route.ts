import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { redirectUriFor } from "@/lib/microsoft/config";
import { getMicrosoftProfile } from "@/lib/microsoft/graph";
import { exchangeCodeForTokens, storeTokens } from "@/lib/microsoft/tokens";
import { createClient } from "@/lib/supabase/server";

/**
 * Where Microsoft sends them back.
 *
 * Every failure lands on Settings with a reason in the URL rather than a stack
 * trace: the likeliest outcome of a first attempt is an admin-consent refusal,
 * and that needs to read as "ask IT", not "something broke".
 */
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const settings = (reason: string) => `${origin}/settings?microsoft=${reason}`;

  const jar = await cookies();
  const expectedState = jar.get("ms_oauth_state")?.value;
  const verifier = jar.get("ms_oauth_verifier")?.value;
  // One shot each, whatever happens below.
  jar.delete("ms_oauth_state");
  jar.delete("ms_oauth_verifier");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  // Microsoft's own refusal — usually consent that an admin has to give.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    const description = searchParams.get("error_description") ?? oauthError;
    console.error("Microsoft consent failed:", description);
    return NextResponse.redirect(
      settings(oauthError === "access_denied" ? "consent_denied" : "failed"),
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state || !verifier || state !== expectedState) {
    // A mismatched state is either a stale tab or something forged. Same
    // answer either way: start again.
    return NextResponse.redirect(settings("state_mismatch"));
  }

  const exchanged = await exchangeCodeForTokens({
    code,
    codeVerifier: verifier,
    redirectUri: redirectUriFor(origin),
  });
  if ("error" in exchanged) {
    console.error("Microsoft token exchange failed:", exchanged.error);
    return NextResponse.redirect(settings("failed"));
  }

  const profile = await getMicrosoftProfile(exchanged.tokens.accessToken);
  const stored = await storeTokens(exchanged.tokens, profile);
  if (stored.error) {
    console.error("Could not store Microsoft tokens:", stored.error);
    return NextResponse.redirect(settings("failed"));
  }

  return NextResponse.redirect(settings("connected"));
}
