import { NextResponse } from "next/server";
import { disconnect } from "@/lib/microsoft/tokens";

/**
 * Forgets the connection.
 *
 * POST, not GET: disconnecting from a link a browser might prefetch is how
 * people lose a connection they never meant to touch. This does not revoke
 * consent at Microsoft — that is done in the account's own settings, and the
 * screen says so.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const result = await disconnect();
  return NextResponse.redirect(
    `${origin}/settings?microsoft=${result.error ? "failed" : "disconnected"}`,
    { status: 303 },
  );
}
