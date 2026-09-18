import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createCalendarEvent } from "./graph";

/**
 * Putting a confirmed meeting on the real calendar.
 *
 * Best effort, always. By the time this runs he has pressed Confirm and the
 * meeting exists in North; a calendar that won't answer is a thing to tell
 * him about later, not a reason to undo what he just did. So every failure
 * here is swallowed, logged, and leaves `external_calendar_event_id` null —
 * which is exactly the state every meeting has had until now.
 */
export async function addConfirmedMeetingToCalendar(input: {
  meetingId: string;
  subject: string;
  start: Date;
  minutes: number;
  locationName: string | null;
  attendeeEmails: string[];
}): Promise<{ eventId?: string }> {
  const result = await createCalendarEvent({
    subject: input.subject,
    start: input.start,
    end: new Date(input.start.getTime() + input.minutes * 60_000),
    attendeeEmails: input.attendeeEmails,
    location: input.locationName,
  });

  if ("failure" in result) {
    // `not_connected` and `not_configured` are the normal state today, so they
    // are not worth a line in the log.
    if (result.failure !== "not_connected" && result.failure !== "not_configured") {
      console.error(
        `Calendar event not created for meeting ${input.meetingId}: ${result.failure}`,
        result.detail ?? "",
      );
    }
    return {};
  }

  const supabase = await createClient();
  await supabase
    .from("meetings")
    .update({
      external_calendar_event_id: result.eventId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.meetingId);

  return { eventId: result.eventId };
}
