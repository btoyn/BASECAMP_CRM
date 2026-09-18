# Deployment checklist

You chose to provision infrastructure later. This is the reminder. 🙂
Work top to bottom; the app is unusable until step 2 is done.

## 1. Supabase project (~10 min)

Your org already has two active projects (IMBL Portal, Golf App). On the free
tier only two can be active, so this third project may need the $10/mo Pro
plan — still well inside the spec's $50/mo budget.

1. Create a project at [database.new](https://database.new) (name: `lender-crm`,
   region: `us-west-2` to match your others).
2. Apply migrations **in order** via the SQL editor (or `supabase db push`):
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls.sql`
   - `supabase/migrations/0003_functions.sql`
   - `supabase/migrations/0004_sample_data.sql`
3. Auth settings → URL configuration: set the site URL to your Vercel domain
   and add `https://<domain>/auth/callback` to redirect URLs.
4. (Recommended) Enable daily backups (Pro plan includes them).
5. (Later) Schedule the purge: `select purge_soft_deleted();` daily via
   pg_cron or a Supabase scheduled edge function.

## 2. Vercel project (~5 min)

1. Import this GitHub repo into the IMBL Vercel team as a new project.
2. Set environment variables:

   | Variable | Value | Required |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | ✅ |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API (anon/publishable) | ✅ |
   | `ANTHROPIC_API_KEY` | console.anthropic.com | optional — turns on AI drafting |
   | `AI_MODEL` | defaults to `claude-sonnet-5` | optional |
   | `RESEND_API_KEY` | resend.com (free tier: 3,000/mo) | optional — email digest |
   | `EMAIL_FROM` | e.g. `Lender CRM <crm@yourdomain>` (verified in Resend) | with Resend |

3. Deploy. Visit the URL — you should see the login screen, not the setup
   notice.

## 2b. Dashboard hero image — done

The hero photograph lives at `public/images/mountain-sunrise-header.png`
(2172×724). It is served through `next/image`, so the 1.7 MB source is
re-encoded and resized per device — about 37 KB of WebP on a desktop and 9 KB on
a phone. To swap the picture later, replace that file; no code changes needed.

## 3. First run

1. Create your account (this is the separate CRM login, not Microsoft).
2. The dashboard seeds itself with **sample data** so every screen is alive.
3. Go to **Import**, upload your real lender Excel file, confirm sample-data
   removal, review the mapping, and import.

## 4. Later phases (don't need decisions now)

- **Resend domain verification** for nicer from-addresses.
- **Daily digest cron**: a Vercel cron hitting an API route at 8:00 AM
  America/Denver (14:00 UTC in daylight time, Mon–Fri) — route to be added with the
  digest feature.


## 5. Connecting Microsoft 365

The code is written and waiting. What it needs is an app registration and, on a
work account, an administrator's approval. Until that exists the app behaves
exactly as it did before: dates are suggested from your availability windows and
the meetings Basecamp already knows about, and the ask opens in your mail client
through a `mailto:` link.

### Register the app

1. **Microsoft Entra admin center** → *App registrations* → *New registration*.
   - Name it something recognisable — it is what the consent screen shows.
   - Supported account types: **accounts in this organizational directory only**.
   - Redirect URI: **Web**, set to `https://<your-domain>/api/microsoft/callback`.
     It must match exactly, including the scheme. Add a second one for
     `http://localhost:3000/api/microsoft/callback` if you want to test locally.
2. **Certificates & secrets** → *New client secret*. Copy the **value**
   immediately; it is never shown again.
3. **API permissions** → *Add a permission* → *Microsoft Graph* → **Delegated**:

   | Permission | What it buys |
   |---|---|
   | `offline_access` | It keeps working tomorrow without signing in again |
   | `User.Read` | Which account is connected |
   | `Calendars.ReadWrite` | Real free/busy, and the invite on Confirm |
   | `Mail.ReadWrite` | Leaving the ask as a draft in Outlook |
   | `Mail.Send` | Sending it directly (nothing calls this yet) |

4. **Grant admin consent** for the organisation. On a work tenant this is the
   step that actually gates everything, and it may need IT rather than you.

### Set the environment variables

On Vercel (Project → Settings → Environment Variables):

| Variable | Where it comes from |
|---|---|
| `MICROSOFT_CLIENT_ID` | The registration's *Application (client) ID* |
| `MICROSOFT_CLIENT_SECRET` | The secret **value** from step 2 |
| `MICROSOFT_TENANT_ID` | The *Directory (tenant) ID*. Optional; defaults to `organizations` |
| `MICROSOFT_TOKEN_ENCRYPTION_KEY` | A long random string you generate — e.g. `openssl rand -base64 48` |

`MICROSOFT_TOKEN_ENCRYPTION_KEY` encrypts the refresh tokens before they are
written to the database. It is not optional: without it the connection refuses
to start rather than store standing mailbox access in the clear. **Changing it
later makes existing connections unreadable** — everyone simply reconnects, but
don't rotate it casually.

### Connect

Redeploy, then **Settings → Microsoft 365 → Connect**. You pick the account,
Microsoft asks for consent, and you land back on Settings. The card then lists
which capabilities were actually granted — a partial grant is normal, and each
line says what still works without it.

Disconnecting from that card makes Basecamp forget the tokens. It does not
revoke the app at Microsoft; that is done in your own account's *My Apps*.
