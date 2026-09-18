import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizeUrl, getMicrosoftConfig, redirectUriFor } from "@/lib/microsoft/config";
import { createPkcePair, randomState } from "@/lib/microsoft/crypto";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts the Microsoft connection.
 *
 * The state and the PKCE verifier go into short-lived httpOnly cookies rather
 * than a table: they are worthless five minutes from now, and a round trip to
 * the database for something that dies with the redirect is a table nobody
 * would ever clean up.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const config = getMicrosoftConfig();
  if (!config) {
    return NextResponse.redirect(`${origin}/settings?microsoft=not_configured`);
  }

  const state = randomState();
  const { verifier, challenge } = createPkcePair();

  const jar = await cookies();
  const options = {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/api/microsoft",
    maxAge: 600, // ten minutes is longer than anyone takes to pick an account
  };
  jar.set("ms_oauth_state", state, options);
  jar.set("ms_oauth_verifier", verifier, options);

  return NextResponse.redirect(
    authorizeUrl({
      config,
      redirectUri: redirectUriFor(origin),
      state,
      codeChallenge: challenge,
    }),
  );
}
