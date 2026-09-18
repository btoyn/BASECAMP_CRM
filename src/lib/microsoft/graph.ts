import "server-only";
import { GRAPH_BASE, SCOPE_FOR } from "./config";
import { getAccessToken } from "./tokens";
import {
  busyBlocksFromSchedule,
  mergeBusyBlocks,
  scheduleHadErrors,
  type BusyBlockIso,
  type GraphScheduleEntry,
} from "./free-busy";

/**
 * The Microsoft Graph calls this app actually makes. Three of them.
 *
 * Every one returns a result object rather than throwing, because none of them
 * is allowed to take a screen down: a calendar Graph won't answer for should
 * degrade to the behaviour the app had before it was ever connected, with a
 * line saying so — never to a blank week that reads as "free".
 */

export type GraphFailure =
  | "not_configured"
  | "not_connected"
  | "reconnect_needed"
  | "missing_scope"
  | "unavailable";

async function graphFetch(
  path: string,
  init: RequestInit & { scope?: string } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; failure: GraphFailure; detail?: string }> {
  const auth = await getAccessToken();
  if ("error" in auth) return { ok: false, failure: auth.error };

  // A partial consent is normal: an admin can grant calendar and withhold mail.
  // Better to say which half is missing than to send a request that 403s.
  if (init.scope && !auth.scopes.some((s) => s.toLowerCase() === init.scope!.toLowerCase())) {
    return { ok: false, failure: "missing_scope", detail: init.scope };
  }

  try {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${auth.token}`,
        "content-type": "application/json",
        // Ask for UTC so the parser never has to guess an offset.
        prefer: 'outlook.timezone="UTC"',
        ...init.headers,
      },
      cache: "no-store",
    });

    if (res.status === 401) return { ok: false, failure: "reconnect_needed" };
    if (res.status === 403) return { ok: false, failure: "missing_scope", detail: init.scope };
    if (!res.ok) {
      return { ok: false, failure: "unavailable", detail: `HTTP ${res.status}` };
    }
    return { ok: true, data: res.status === 204 ? null : await res.json() };
  } catch (cause) {
    return { ok: false, failure: "unavailable", detail: String(cause) };
  }
}

export interface FreeBusyResult {
  /** Merged busy blocks. Empty with `ok: false` means "unknown", not "free". */
  busy: BusyBlockIso[];
  ok: boolean;
  failure?: GraphFailure;
  detail?: string;
}

/**
 * What the real calendar says is taken between two instants.
 *
 * This is the piece that makes a suggestion trustworthy. Before it, the app
 * offered dates knowing only about meetings it had recorded itself, which is
 * most of a working week short.
 */
export async function getFreeBusy(input: {
  email: string;
  start: Date;
  end: Date;
}): Promise<FreeBusyResult> {
  const result = await graphFetch("/me/calendar/getSchedule", {
    method: "POST",
    scope: SCOPE_FOR.freeBusy,
    body: JSON.stringify({
      schedules: [input.email],
      startTime: { dateTime: input.start.toISOString(), timeZone: "UTC" },
      endTime: { dateTime: input.end.toISOString(), timeZone: "UTC" },
      // An hour is plenty: the slot-finder steps in 30-minute increments and
      // exact block edges come back in scheduleItems anyway.
      availabilityViewInterval: 30,
    }),
  });

  if (!result.ok) {
    return { busy: [], ok: false, failure: result.failure, detail: result.detail };
  }

  const entries = ((result.data as { value?: GraphScheduleEntry[] })?.value ?? []);
  const busy = mergeBusyBlocks(busyBlocksFromSchedule(entries));

  if (scheduleHadErrors(entries)) {
    return { busy, ok: false, failure: "unavailable", detail: "Graph returned an error entry" };
  }
  return { busy, ok: true };
}

export interface CreateEventInput {
  subject: string;
  start: Date;
  end: Date;
  attendeeEmails: string[];
  location?: string | null;
  body?: string;
}

/**
 * Puts the confirmed meeting on the calendar and invites the lenders.
 *
 * Only ever called from Confirm, which is a button a human presses. Nothing in
 * this app books a meeting on its own.
 */
export async function createCalendarEvent(
  input: CreateEventInput,
): Promise<{ eventId: string } | { failure: GraphFailure; detail?: string }> {
  const result = await graphFetch("/me/events", {
    method: "POST",
    scope: SCOPE_FOR.createEvent,
    body: JSON.stringify({
      subject: input.subject,
      start: { dateTime: input.start.toISOString(), timeZone: "UTC" },
      end: { dateTime: input.end.toISOString(), timeZone: "UTC" },
      location: input.location ? { displayName: input.location } : undefined,
      body: input.body ? { contentType: "text", content: input.body } : undefined,
      attendees: input.attendeeEmails.map((address) => ({
        emailAddress: { address },
        type: "required",
      })),
    }),
  });

  if (!result.ok) return { failure: result.failure, detail: result.detail };
  const id = (result.data as { id?: string })?.id;
  return id ? { eventId: id } : { failure: "unavailable", detail: "No event id returned" };
}

export interface MailInput {
  to: string[];
  subject: string;
  body: string;
}

/**
 * Leaves the ask in his Outlook drafts.
 *
 * The default, and the one the product has always wanted: he proofs it and
 * presses send himself. `sendMail` exists beside it for when he decides the
 * tool has earned it, but nothing calls it yet.
 */
export async function createMailDraft(
  input: MailInput,
): Promise<{ draftId: string; webLink?: string } | { failure: GraphFailure; detail?: string }> {
  const result = await graphFetch("/me/messages", {
    method: "POST",
    scope: SCOPE_FOR.draftMail,
    body: JSON.stringify({
      subject: input.subject,
      body: { contentType: "text", content: input.body },
      toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
    }),
  });

  if (!result.ok) return { failure: result.failure, detail: result.detail };
  const data = result.data as { id?: string; webLink?: string };
  return data?.id
    ? { draftId: data.id, webLink: data.webLink }
    : { failure: "unavailable", detail: "No draft id returned" };
}

/** Sends directly. Deliberately unused until he asks for it. */
export async function sendMail(
  input: MailInput,
): Promise<{ sent: true } | { failure: GraphFailure; detail?: string }> {
  const result = await graphFetch("/me/sendMail", {
    method: "POST",
    scope: SCOPE_FOR.sendMail,
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "text", content: input.body },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: true,
    }),
  });

  return result.ok ? { sent: true } : { failure: result.failure, detail: result.detail };
}

/** Who Microsoft says this is, recorded so Settings can show the account. */
export async function getMicrosoftProfile(
  accessToken: string,
): Promise<{ email: string | null; id: string | null }> {
  try {
    const res = await fetch(`${GRAPH_BASE}/me`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return { email: null, id: null };
    const data = (await res.json()) as {
      mail?: string;
      userPrincipalName?: string;
      id?: string;
    };
    return { email: data.mail ?? data.userPrincipalName ?? null, id: data.id ?? null };
  } catch {
    return { email: null, id: null };
  }
}
