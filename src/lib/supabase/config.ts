/**
 * The two public Supabase values, and a guard on what they contain.
 *
 * Both are trimmed. Environment variables pasted into a dashboard routinely
 * arrive with a trailing newline or space, and a space in an HTTP header value
 * is not an error anyone can see: the request simply fails with a message
 * about the header object, naming nothing.
 *
 * `anonKeyProblem` exists because that failure already happened here, and cost
 * an evening. The browser refuses to build a header from a string holding a
 * character above U+00FF, and reports it as "String contains non ISO-8859-1
 * code point" with no indication of which string or which character. This
 * turns that into a sentence naming the variable, the position and the
 * character.
 */

function read(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  // Next.js inlines these at build time, so the lookup must be a literal
  // property access rather than an index — process.env[name] would be
  // undefined in the browser.
  const raw =
    name === "NEXT_PUBLIC_SUPABASE_URL"
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return (raw ?? "").trim();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(read("NEXT_PUBLIC_SUPABASE_URL") && read("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}

export function supabaseUrl(): string {
  return read("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * The first character that cannot survive being put in an HTTP header, if any.
 *
 * Pure and exported separately so a screen can say what is wrong before making
 * a request that would fail unreadably.
 */
export function headerSafetyProblem(label: string, value: string): string | null {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0xff) {
      const hex = code.toString(16).toUpperCase().padStart(4, "0");
      return `${label} contains a character that cannot be sent in a request: U+${hex} at position ${i + 1} of ${value.length}. Re-enter the value, typing it rather than pasting.`;
    }
  }
  return null;
}

/** The same check against the configured key, for the screens that sign in. */
export function anonKeyProblem(): string | null {
  return headerSafetyProblem("NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnonKey());
}
