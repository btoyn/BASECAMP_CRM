import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SCOPE_FOR, describeMissingConfig, scopeSatisfied } from "@/lib/microsoft/config";
import { getConnection } from "@/lib/microsoft/tokens";
import { formatDate } from "@/lib/utils";

/**
 * The Microsoft 365 connection, in the one place it can be turned on.
 *
 * It says which half works rather than one on/off light, because a partial
 * grant is the likely outcome: an admin approves the calendar and holds back
 * mail, and "connected" on its own would then be a lie about half the
 * features.
 */

const RESULT_MESSAGE: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Connected. Proposed dates now check your real calendar." },
  disconnected: {
    tone: "good",
    text: "Disconnected. Basecamp has forgotten the tokens — revoke its access in your Microsoft account too if you want it gone entirely.",
  },
  consent_denied: {
    tone: "bad",
    text: "Microsoft refused the request. On a work account this usually means an administrator has to approve Basecamp for your organisation first.",
  },
  state_mismatch: {
    tone: "bad",
    text: "That sign-in didn't match the one this browser started. Try Connect again.",
  },
  not_configured: {
    tone: "bad",
    text: "No app registration is configured on this deployment yet.",
  },
  failed: { tone: "bad", text: "That didn't work. Try again — the details are in the server log." },
};

export async function MicrosoftCard({ result }: { result?: string }) {
  const missingConfig = describeMissingConfig();
  const connection = missingConfig ? null : await getConnection();
  const message = result ? RESULT_MESSAGE[result] : undefined;

  const has = (scope: string) => scopeSatisfied(connection?.scopes ?? [], scope);
  const live = Boolean(connection && !connection.invalidatedAt);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" />
              Microsoft 365
            </CardTitle>
            <CardDescription>
              Lets Basecamp read your calendar so the dates it offers are ones you&apos;re
              actually free for, and put the confirmed meeting on your calendar.
            </CardDescription>
          </div>
          <Badge variant={live ? "success" : "muted"}>{live ? "Connected" : "Not connected"}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {message && (
          <p
            className={
              message.tone === "good"
                ? "rounded-lg border border-teal-border bg-teal-soft px-3 py-2 text-[13px] text-[#1f6b60]"
                : "rounded-lg border border-gold-border bg-gold-soft px-3 py-2 text-[13px] text-[#6d5210]"
            }
          >
            {message.text}
          </p>
        )}

        {missingConfig ? (
          <>
            <p className="text-muted">
              Nothing to connect to yet. This deployment needs an app registration in Microsoft
              Entra before the button appears.
            </p>
            <p className="text-[12.5px] text-muted">
              Missing: <code className="text-foreground">{missingConfig}</code>
            </p>
            <p className="text-[12.5px] text-muted">
              Everything else in Basecamp works without it — dates are suggested from your
              availability windows and the meetings it already knows about.
            </p>
          </>
        ) : connection?.invalidatedAt ? (
          <>
            <p className="text-muted">
              The connection to{" "}
              <span className="font-medium text-foreground">{connection.accountEmail}</span> stopped
              working{connection.invalidatedReason ? ` — ${connection.invalidatedReason}` : ""}.
              Reconnecting fixes it.
            </p>
            <Link
              href="/api/microsoft/connect"
              className={buttonVariants({ variant: "primary", size: "md" })}
            >
              Reconnect
            </Link>
          </>
        ) : connection ? (
          <>
            <p className="text-muted">
              Connected as{" "}
              <span className="font-medium text-foreground">
                {connection.accountEmail ?? "your Microsoft account"}
              </span>{" "}
              since {formatDate(connection.connectedAt)}.
            </p>

            <ul className="space-y-1.5">
              <ScopeLine
                granted={has(SCOPE_FOR.freeBusy)}
                on="Proposed dates avoid what's already on your calendar"
                off="Calendar reading wasn't granted — dates are suggested from the app's own records only"
              />
              <ScopeLine
                granted={has(SCOPE_FOR.createEvent)}
                on="Confirming a meeting puts it on your calendar and invites them"
                off="Calendar writing wasn't granted — confirmed meetings stay in Basecamp only"
              />
              <ScopeLine
                granted={has(SCOPE_FOR.draftMail)}
                on="The ask can be left as a draft in your Outlook"
                off="Mail access wasn't granted — the ask still opens in your mail client"
              />
            </ul>

            <form action="/api/microsoft/disconnect" method="post">
              <button
                type="submit"
                className={buttonVariants({ variant: "secondary", size: "md" })}
              >
                Disconnect
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="text-muted">
              Basecamp asks for your calendar and the ability to draft mail. It never sends
              anything on its own — you still press send, and you still press Confirm.
            </p>
            <Link
              href="/api/microsoft/connect"
              className={buttonVariants({ variant: "primary", size: "md" })}
            >
              Connect Microsoft 365
            </Link>
            <p className="text-[12.5px] text-muted">
              On a work account an administrator may need to approve Basecamp for your
              organisation the first time.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScopeLine({ granted, on, off }: { granted: boolean; on: string; off: string }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${granted ? "bg-teal" : "bg-[#c9cfdd]"}`}
      />
      <span className={granted ? "text-foreground" : "text-muted"}>{granted ? on : off}</span>
    </li>
  );
}
