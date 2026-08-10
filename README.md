# GymMate

An AI gym coach for people who have never trained. It interviews the user, writes
them a program, then walks them through every session one exercise at a time —
explaining movements, swapping them when a machine is busy, and learning what
they can actually lift.

Built with Next.js (App Router), Supabase for auth and storage, and OpenRouter
for the AI. Mobile first; on a desktop it settles into the phone frame the
design was drawn in. English and Arabic, dark and light, RTL included.

---

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

`.env.local` holds the configuration:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Safe in the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key. Safe in the browser — every table is behind Row Level Security. |
| `OPENROUTER_API_KEY` | **Server only.** Never prefixed with `NEXT_PUBLIC_`, never sent to the client. |
| `OPENROUTER_MODEL` | Model for conversation, explanations and swaps. Comma-separate several for fallback. |
| `OPENROUTER_MODEL_PLAN` | Model for writing the program. Falls back to `OPENROUTER_MODEL`. |

### Supabase setup

The schema in `supabase/migrations/` is already applied to the project in
`.env.local`. To point at a different project, run the migration files in the
SQL editor in order, then deploy the sign-up function:

```bash
supabase functions deploy signup --no-verify-jwt
```

No dashboard settings need changing. Accounts are created already confirmed, so
the **Confirm email** setting does not affect sign-up either way.

---

## How it fits together

```
src/
  app/
    page.tsx              Front door — create an account, or log in
    app/page.tsx          The app itself (four tabs), signed-in only
    login, signup         Account screens
    api/
      ai/coach            One conversational turn: the coach decides what to ask
      ai/plan             Writes the whole program
      ai/explain          "How do I do this?"
      ai/swap             Replaces one exercise for today
      state                Boots the signed-in user's data
      profile, workout     Profile edits; start / log / finish a session
  components/
    ui/                   Button, Chip, Card, Field, Sheet, StatGrid, icons
    layout/               Device frame, status bar, bottom navigation
    chat/                 The coach conversation and the plan card
    workout/              Session runner, exercise detail, generated artwork
    plan/                 The week
    profile/              What GymMate knows about you
  lib/
    ai/                   OpenRouter client, prompts, output schemas, mappers
    api/                  Request context (guest vs member) and error handling
    db/                   Every database query, in one file
    domain/               Types, scheduling, weight progression, exercise keys
    i18n/                 UI copy and the language / theme provider
    state/                AppProvider — the one thing screens talk to
    supabase/             Browser and server clients
```

### The AI is the product

Nothing about the training is hardcoded. There is no list of questions, no
catalogue of exercises, no set of allowed splits anywhere in the codebase —
`src/lib/ai/prompts.ts` describes the coach's *job* and `src/lib/ai/schemas.ts`
describes the *shape* of a valid answer. Everything else is the model's call,
made from the user's age, gender, height, weight, experience, goal, available
days, session length and equipment.

That means the coach picks its own next question each turn (and skips anything
it already knows), and a beginner with two days and a pair of dumbbells gets a
genuinely different program from a lifter with six days in a full gym.

`completeJson` validates every response against a Zod schema, feeds validation
errors back to the model for one repair attempt, retries once through a rate
limit, and falls through the model list if one is down.

Two settings matter for how the app feels:

- **Reasoning is switched off.** The coach's replies are short and structured,
  and reasoning made one model take 30 seconds instead of 2.4. Models that
  refuse to have it disabled are retried with it left on.
- **The models are cheap paid ones, not free ones.** The `:free` tiers rate
  limit constantly and ignored the instruction to offer tap options. A whole
  onboarding plus a generated program costs well under a cent. To go back to
  free, set both model variables to `openai/gpt-oss-20b:free`.

Measured on the current chain: each conversational turn 1.3–4s, program
generation ~30s (it is a large JSON document, and the screen shows a
"putting your program together" state while it runs).

### Weights are never guessed

Body weight and height say nothing about how much someone can press. The first
time an exercise comes up the app suggests nothing and tells the user to start
light enough to keep every rep clean. From then on the suggestion comes from
their own log — what they lifted and whether it felt too easy, good or too hard
(`src/lib/domain/progression.ts`).

### Missed workouts stay missed

A `workout_sessions` row is created when the user starts a session and only
reaches `completed` when they press *Finish workout*. A day nobody trained has
no row at all, so it can never be back-filled as done. After a session the app
looks forward through the plan for the next training day and shows it —
including "rest day today, next one Wednesday" (`src/lib/domain/schedule.ts`).

### Accounts are identified by a username

Sign-up takes a username and a password. An email address is optional and is
only ever contact information — it is not a login credential and nothing is
sent to it.

Supabase Auth is built around an email address, so every account also carries a
deterministic internal one, `<username>@users.gymmate.app`, derived from the
username (`src/lib/auth/account.ts`). It can never receive mail, is never shown
to anyone, and logging in only ever needs the username and password.

Because that address cannot receive a confirmation link, accounts are created by
the `signup` edge function (`supabase/functions/signup/`), which holds the
service role and registers them already confirmed. It is the one deliberately
public endpoint: it creates an account and nothing else, and the only thing it
discloses is whether a username is taken — which the sign-up form has to know.

Usernames are 3–24 characters (letters, digits, `_`, `.`), stored as typed and
unique case-insensitively, so `Layla` and `layla` cannot both exist. A username
is fixed once chosen — it is the account's identity, and the profile screen
shows it read-only.

There is no anonymous mode. `/app` redirects to the login screen without a
session, and every API route answers `401` to a signed-out caller.

### Privacy

Every table is per-user and protected by Row Level Security, so a row is
readable only by the account that owns it. Verified: an anonymous caller holding
the publishable key reads back an empty list from every table even when rows
exist. The OpenRouter key lives only on the server — the AI modules are marked
`server-only`, so an accidental client import fails the build rather than
shipping the key.

---

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```
