# North — Product Spec

*Relationships. Momentum. Results.*

A lender-relationship system for an SBA 504 business development officer. This document
describes what North is, the rules it enforces, and — more usefully — the decisions behind
those rules and the alternatives that were deliberately rejected. It is the reference for anyone
picking this project up.

Companion documents:
- `docs/CONTEXT_HANDOFF.md` — where the work stands right now, conventions, and open questions.
- `docs/USER_GUIDE.md` — the operating manual, rendered in-app at `/guide`.
- `docs/ORIGINAL_BUILD_PLAN.md` — the August 2026 plan this grew from, kept verbatim.
- `docs/lender_crm_build_spec.md` — the long original build spec. Historical.

---

## 1. Who it is for and what it does

**User:** Brandon Toyn, Loan Officer / BDO at InterMountain Business Lending (IMBL), covering the
Wasatch Front (Salt Lake City) and Southern Utah (St. George). One user today; designed for four.

**The job:** he does not originate loans from borrowers. He originates them from *bankers* —
commercial lenders at banks and credit unions who bring him deals that don't fit their own box.
His book is ~142 lenders across 24 institutions. His product is the relationship.

**The problem North solves.** Those relationships lived in a spreadsheet of names. A
spreadsheet cannot answer the three questions that decide whether a territory produces:

1. **Who haven't I talked to in six weeks?** Relationships go quiet gradually and silently.
2. **Which lenders actually send me deals?** Lunches booked feel like progress; referrals are the
   only outcome that matters.
3. **Does this referral partner know where their loan stands?** Silence after a handoff costs the
   next referral.

North answers all three, and drafts the outreach that follows from the answers.

**The one-sentence test for any feature:** does it help him know who to contact, contact them, or
keep a partner informed? If not, it does not belong.

---

## 2. Core domain concepts

| Concept | Meaning |
|---|---|
| **Lender** | A person at a bank or credit union. The primary object. Not a company. |
| **Institution** | The bank. Created automatically when a lender is added. Lenders can move between them and keep their history. |
| **Territory** | `Wasatch Front` or `Southern Utah`. Drives trip planning and grouping. |
| **Touch** | Any logged contact. Split into two kinds — see §3. |
| **Coverage** | Whether a lender has been contacted inside the goal window. The engine of the product. |
| **Look** | Any time a lender raises a possible deal — a real referral, a question, a maybe. |
| **Active loan** | A deal in process whose referring lender is owed a weekly update. |
| **Proposal** | An offer of specific meeting times, and the tracking of what came back. |
| **Promise** | Something owed, in either direction. |

---

## 3. The coverage engine

The heart of the product. `src/lib/coverage.ts`, pure and unit-tested.

**The rule:** every active lender should hear from him *personally* every **30 days**, with a
**10-day grace period**. Both are configurable per user.

**States:** `on_track` → `grace` → `overdue` → `seriously_overdue`, plus `never_contacted`.

### Three decisions that define it

**1. A personal touch and a mass email are not the same thing.** Every activity carries
`personal_touch` and `counts_for_coverage`. Coverage is computed twice — a **visible** figure
(any contact) and a **personal** figure (one-to-one only). A lender reached only by campaign shows
as `campaign_only`: technically contacted, actually neglected. Collapsing these would let a
newsletter hide a cold relationship, which is the exact failure the product exists to prevent.

**2. A confirmed future meeting counts as covered immediately.** Not when the meeting happens —
when the invite is accepted. The relationship is handled at that point, and nagging about someone
you are seeing on Thursday is noise.

**3. Two other actions reset the clock**, because they are genuinely contact:
- Logging a **loan update** — informing a referral partner and maintaining the relationship are
  the same act.
- Logging a **look** — someone who just brought you a deal must not appear tomorrow as needing
  attention.

---

## 4. Looks — the outcome measure

`src/lib/looks.ts`. Stored in the `opportunities` table.

**What counts:** *any* conversation where a lender raises a possible deal. A named referral, a
question about whether something would qualify, a vague "I might have one for you." **The borrower
name is optional** — most of these conversations don't have one yet.

**Why so loose:** the original design counted only real referrals with a named borrower. The user
overrode this, and was right: the value is the *follow-up hook*, and waiting for a borrower name
means the conversation never gets logged at all. The count of who's reaching out then falls out for
free.

**The clock is the point.** A look gets a follow-up date (default 3 days, configurable). It goes
gold when due and red after a week — the same colours as the loan clock, so the colours mean one
thing across the app.

**Three outcomes:** `Open` → `Became a loan` or `Went nowhere`. Anything not explicitly closed
counts as open, so an old record asks to be dealt with rather than quietly filing itself away.

**What it produces:** a "who's reaching out" ranking and a lifetime count per lender. This is the
closest thing in the product to an honest answer about which relationships produce and which are
all lunch and no loans.

> **Note for anyone reading the history:** referral tracking was cut during an early scope review
> as "too much," then reinstated. The August plan's addendum called it *"the single highest-value
> thing to add."* The addendum was right and the scope review was wrong.

---

## 5. Loan updates

`src/lib/loan-cadence.ts`, `src/lib/loan-email.ts`.

Every active loan gets a note to the referring lender **every 7 days, whether or not anything
changed.** Silence is what makes a referral partner nervous.

**States:** up to date (teal) → due (gold, days 0–7 past) → overdue (red, day 8+).

### The email

- **Week one** composes a skeleton: greeting, "just wanted to give you my weekly update on the
  Harris loan," a gap for the news, signature. The cursor lands in the gap.
- **Every week after opens with last week's email.** Change what changed. Edits carry forward, so
  the template becomes his rather than staying the app's.
- **Subject is dated** — `Harris loan — update Aug 19` — so each week is its own message rather
  than collapsing into one thread.
- **The borrower can ride along.** Their address is stored on the loan so it's typed once, but the
  tick is per-send and defaults off.
- **Opening the Outlook draft marks the week done** and restarts the clock.

### Two endings

| Action | Behaviour |
|---|---|
| **Sent to closing** | Drafts the handoff email — SBA approved, closing team reaching out, 45–90 days, or on certificate of occupancy if construction is involved. Sending it ends the cadence. |
| **Didn't happen** | Stops the clock, sends nothing. A dead deal is a phone call. |

The closed list records which ending each loan got and counts how many reached closing.

### Rejected designs, and why

- **A five-stage pipeline** (Processing → Underwriting → Board approved → Submitted → SBA
  approved), each with a stock sentence. Designed in full, then dropped on the user's call: *"Every
  week I know where the loan is. I don't need to select something."* A dropdown asks someone to
  type a fact they already know into a second place it can go stale.
- **Predicted SBA response dates.** Explicitly refused: *"Don't add when you think the SBA will get
  back. That's setting up for disaster."*
- **"No change since last week" emails.** Rejected as lame. The stage sentence plus last week's
  text always says something real.
- **Amounts and production numbers.** Deliberately absent everywhere. Those live in the system that
  already owns them, and a second half-kept copy is always the wrong one. The same reasoning removed
  an SBA-approvals card from the dashboard.

---

## 6. Scheduling

`src/lib/scheduling.ts` (finding slots), `src/lib/reply-reader.ts` (understanding replies).

**The flow is email-first, by design:** pick a lender → the app offers open dates and drafts the
ask → **he proofs and presses send** → the reply is read → a confirmed date becomes a calendar
invite.

### Decisions

**Availability is one window per meeting type**, not a week-by-week grid. Real rules are shaped
like "lunches Tuesday to Thursday, 11 to 1." Coffee is not a meeting type — he doesn't drink it.
Breakfast is.

**The reply reader abstains rather than guesses.** It splits on *clauses*, not sentences, so
"Can't do the 13th, but the 18th works" resolves to the 18th, while an unpicked either/or lands on
`unclear`. Nothing is ever booked from its reading alone — the reading is shown and a human presses
the button. An unclear verdict costs ten seconds; a meeting booked at the wrong time costs a
relationship.

**Wall-clock logic runs in the browser.** Availability windows and reply date-resolution are
wall-clock problems ("lunches 11 to 1", "the 21st"), so both run client-side where local time is
already the user's. Only absolute ISO instants cross to the server. This avoids a timezone
dependency and keeps the logic pure and testable.

**Silence gets chased after 4 days**, configurable.

**Rejected:** a calendar-only flow where the app books directly. It quietly removed his
press-send step, which is the thing he explicitly wants to keep until the tool has earned trust.

### The hands-off goal, and what blocks it

The stated target is: a lender replies, the app reads it, and it only comes to him if it genuinely
needs his call. Two things stand between here and there, and **both** are needed:

| Blocker | Removes |
|---|---|
| Somewhere the app can read replies — a shared mailbox, or delegated `Mail.Read` | The paste step |
| An Anthropic API key | Most of the interruptions |
| (Separately) `Calendars.ReadWrite` | The double-checking of proposed dates against Outlook |

---

## 7. Screens

| Route | Purpose |
|---|---|
| `/dashboard` | Coverage ring, relationship momentum, today's actions, this week's list, upcoming agenda |
| `/lenders` | The book. Grouped by territory then bank, collapsed. Search, 11 filter views |
| `/lenders/[id]` | Profile: coverage, timeline, promises, personal details, looks given, bank history |
| `/lenders/new` | Add a lender, with duplicate detection while typing |
| `/institutions`, `/institutions/[id]` | Banks and everyone known at each |
| `/follow-ups` | Open promises (both directions) and tasks |
| `/loans` | Active loans, the weekly clock, the update composer, two endings |
| `/looks` | Looks from lenders, follow-up clock, who's reaching out |
| `/needs-attention` | Everyone slipping, worst first, filterable by state and territory |
| `/settings` | Coverage goal, availability, follow-up intervals, signature, invites, import/export |
| `/import` | Excel import wizard with column mapping |
| `/guide` | `docs/USER_GUIDE.md` rendered in-app |
| `/trash` | 90-day restore for anything soft-deleted |
| `/export` | Full data export |

### The Lenders list — grouping

Territory is the **outer** level and institution the **inner** one. This is not arbitrary: six
banks (Zions, Bank of Utah, Alta, Hillcrest, CC Bank, UCCU) have people in **both** territories,
and those get visited on different trips. A single "Zions" group of 24 would merge two itineraries.

Grouping was validated against the data before being built: **11 banks hold 112 of the 141
people**, so headers carry real weight instead of splintering the list into pairs.

The header is what makes it readable, not the grouping — count, freshest touch in the group, and how
many are slipping. That is enough to skip a healthy bank without opening it. Groups sort
**worst-first** within a territory. **Search always shows the flat list**, because results are
ranked by match quality and grouping would discard that order.

---

## 8. Privacy and safety

**Row-level security, per user, on every owned table.** Each officer's book is walled off at the
database level — nobody sees anyone else's lenders, notes or pipeline, *including the admin*. This
is enforced by policy, not by a setting someone can switch off, and it is what makes a four-officer
pilot safe.

**Signups are closed.** Accounts are created with single-use invite codes. The `signup_invites`
table has RLS enabled with **no policies**, so it is unreadable through the API; two
security-definer functions are the only way in, and both accept `anon` because someone redeeming a
code has no session yet. The code is validated *before* `signUp` so a bad code cannot leave a
half-made account behind.

**Soft deletes everywhere**, with a 90-day restore window and an append-only audit log.

**AI is optional.** The app is fully functional with no Anthropic key. Every AI path checks a flag
and offers manual entry instead of failing. There is a configurable monthly spend cap.

**No automated sending.** The tool drafts; a person presses send. This is a standing decision, not
a limitation to be engineered away, and should not change without an explicit call.

---

## 9. Non-goals

Stated plainly so they don't get rebuilt:

- **Not a loan pipeline.** No amounts, no stages, no milestones, no production reporting.
- **Not a borrower CRM.** The relationship being tracked is with the *banker*.
- **Not a mass-email platform.** The monthly SBA update is a roadmap item; bulk marketing is not.
- **Not a replacement** for whatever system already tracks loans and approvals.
- **Not multi-tenant SaaS.** Four officers inside one firm.

---

## 10. Roadmap

**Blocked on approvals, not on work:**
- Real Outlook drafts, reply monitoring, calendar conflict checks, actual meeting invitations
  (Microsoft Entra app registration with delegated `Calendars.ReadWrite` and mail permission)
- Drafting in his voice, plain-English reply understanding, pre-meeting briefs (Anthropic API key)
- Four-officer pilot

**Designed, not built:**
- **St. George trip planner** — give it dates and a target of 6–8 meetings; it fills the week from
  the most overdue lenders down there. Tables exist (`trips`, `trip_targets`), no screen. Includes a
  known rule: Mondays are office days *except* when he's in St. George — an exception the current
  availability model cannot express.
- **Monthly SBA update** — one useful email a month to the whole list. Every other touch asks a
  banker for time; this one gives them something. Blocked on real email sending: a newsletter to 141
  people cannot go through a `mailto:` link.
- **Voice samples screen** — paste 3–5 real emails to build a voice profile. Storage ready.
- **Entertainment log** — activity and rough cost per meeting, for compliance records.
- **Job-change alerts** — a banker moving banks is a warm relationship walking into a new lending
  shop; today it is a silent loss.

**Deliberately parked:**
- Automated SMS through a provider (A2P 10DLC registration + TCPA consent). One-to-one texts from
  his own phone are fine and need no infrastructure.
- Video messaging.

---

## 11. Brand

Renamed twice: "Lender CRM" to **Basecamp** in August 2026, and Basecamp to
**North** in September 2026. The mark is a compass rose, and the primary lockup
puts it to the left of the wordmark.

| Token | Value | Where it lands |
|---|---|---|
| `--brand-blue` | `#1E76FF` | The north arrowhead, and the right half of the needle |
| `--brand-blue-deep` | `#1A4FB0` | The left half of the needle |
| `--brand-slate` | `#2B3646` | East and west arrowheads, and the wordmark |
| `--brand-grey` | `#A8B1BD` | The ring, and the south arrowhead |

Colour carries the meaning in this mark. North is the bright blue, east and
west are slate, south is grey, and the needle splits down its centre line so it
reads as a pointer rather than a flat triangle. Anything that renders the rose
in one colour keeps that hierarchy through opacity instead — `NorthMarkMono`.

The interface derives from these, with one deliberate departure:

- **Teal, plum and red are not brand colours.** They carry *status* meaning — on
  track, personal intelligence, overdue — and four brand colours cannot express
  five states.

The mark is vector and lives in `src/components/brand.tsx`, drawn from the
reference art in `docs/brand/north-lockup.png` and `docs/brand/north-mark.png`
rather than traced from it. The ring is four explicit arcs rather than a dashed
circle, because a dash pattern puts its gaps where the arithmetic lands and
these four have to sit exactly under the four arrowheads.

`docs/brand/basecamp-brand-sheet.png` is the retired mountain-and-sun mark,
kept only as a record of what it replaced.
