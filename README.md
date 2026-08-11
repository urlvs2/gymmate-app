# GymMate

**Live: https://gymmate-app.vercel.app**


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

Almost nothing about the training is hardcoded. There is no list of questions
and no set of allowed splits — `src/lib/ai/prompts.ts` describes the coach's
*job* and `src/lib/ai/schemas.ts` describes the *shape* of a valid answer. The
structure of the week, the choice of movements, the sets, reps and rest are the
model's call, made from the user's age, gender, height, weight, experience,
goal, available days, session length and equipment.

That means the coach picks its own next question each turn (and skips anything
it already knows), and a beginner with two days and a pair of dumbbells gets a
genuinely different program from a lifter with six days in a full gym.

### Real exercises, not invented ones

The one thing the model does *not* invent is the exercises themselves. Every
movement is chosen from the open
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (873 real
exercises). For each plan, `src/lib/exercises/catalogue.ts` builds a shortlist
filtered to the person's **equipment** (a dumbbells-only user's pool contains
only dumbbell and bodyweight movements) and their **level** (a beginner never
sees expert lifts like a pistol squat or planche push-up — the exact
"unrealistic" cases this rules out). That shortlist goes into the prompt, and
the model selects from it by reference code; a code that is not on the list
fails schema validation and is sent back for one repair pass. So an invented or
unsuitable exercise cannot reach the plan — it is not in the list, and a made-up
code is rejected.

Because each chosen exercise is a real catalogue entry, its equipment tag, its
demonstration photos and its identity all come straight from the database — so
equipment compliance and correct images are now guaranteed by construction
rather than checked after the fact. Swaps pick from the same shortlist. Only the
display name, the muscle label and the coaching cues are the model's own words,
so an Arabic plan still reads in Arabic while pointing at the real movement
underneath.

### Equipment is a hard rule, not a hint

Whatever the user says they have is the complete list of what a plan may use, and
that is now guaranteed at the source: `src/lib/domain/equipment.ts` reads the
free-text answer (in either language) into a policy — "just dumbbells at home" and
"bodyweight only" produce a restriction; "basic gym" or "full gym" allows
everything — and the catalogue shortlist for the plan is filtered by that policy
before the model ever sees it. A dumbbells-only user's pool simply contains no
machine or cable movements, so the model cannot pick one. The equipment policy is
also still available as a schema check for belt-and-braces, but with the pool
pre-filtered a violation cannot occur in the first place.

### The coach can change the plan, not just talk about it

One prompt covers the whole conversation — before a program exists it reads as
an interview, afterwards as an ordinary conversation — and every turn sees the
profile, the running program and the recent history. That is what lets it
answer a question without losing its place, and remember what was said twenty
messages ago.

Each turn also decides what to do with the program: `none`, `build`, or
`rebuild`. A rebuild fires whenever the ground the program stood on has moved —
lost access to the gym, fewer days, shorter sessions, a new injury, a changed
goal — not only when the person asks for one. Say *"I can't go to the gym any
more"* and the coach updates `equipment` on the profile, rewrites the saved plan
as bodyweight training, and every later suggestion follows: the plan writer and
the exercise-swap endpoint both read that same profile, so nothing offers a
machine again.

A rebuild also ends any session in progress — it belongs to the program that was
just replaced, and finishing it would mean doing exercises the coach has
withdrawn. It is marked abandoned, never completed.

`completeJson` validates every response against a Zod schema, feeds validation
errors back to the model for one repair attempt, retries once through a rate
limit, and falls through the model list if one is down.

Two settings matter for how the app feels:

- **The model is OpenAI's GPT-5.6 (`openai/gpt-5.6-luna`),** driving both the
  conversation and the program. It reads context well, answers questions mid-flow
  before returning to its own, and writes plans that actually reflect what the
  person said — a nervous beginner who mentions getting winded on stairs gets
  warm-up walks and gentle regressions, not a generic template. It is the newest
  OpenAI generation the current free-tier key can run end to end: the larger
  flagships (`gpt-5.4` / `5.5` / `5.6-sol`) answer a short chat turn fine but
  `402` once a whole program's worth of output is requested. Add credits at
  openrouter.ai and you can promote both variables to `openai/gpt-5.4` for even
  richer plans; the fallback in each chain is `openai/gpt-oss-120b:free`.
- **Reasoning is switched off.** The coach's replies are short and structured,
  and reasoning made one model take 30 seconds instead of two. Models that
  refuse to have it disabled are retried with it left on.

Measured on the current chain: each conversational turn ~1–2s, program
generation ~20–30s (it is a large JSON document, and the screen shows a
"putting your program together" state while it runs).

### Weights are never guessed

Body weight and height say nothing about how much someone can press. The first
time an exercise comes up the app suggests nothing and tells the user to start
light enough to keep every rep clean. From then on the suggestion comes from
their own log — what they lifted and whether it felt too easy, good or too hard
(`src/lib/domain/progression.ts`).

### Every exercise shows a real demonstration

The exercise sheet shows an actual photo of the movement — two frames, the start
and mid-rep positions, cross-faded so the rep animates — drawn from the open
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (873 movements,
served from a CDN, no API key).

The hard part is that exercise names are the model's own words, in the user's
language. Matching happens in `src/lib/exercises/`: a slim library index
(`library.json`) plus an IDF-weighted fuzzy matcher (`match.ts`) where rare words
like "goblet" or "thruster" count for far more than "dumbbell", the naming verb
must agree (a *row* is never matched to a *press*), and anything below a
confidence bar returns nothing rather than risk showing the wrong exercise.
Non-English names are normalized to their common English name in one batched
model call first (`attach.ts`) — "ضغط الصدر بالدمبلز" becomes "Dumbbell Bench
Press", which matches. Images are attached once per plan through
`/api/plan/images` and stored on the plan, and swapped-in exercises get one too.

When a movement genuinely is not in the library — a warm-up walk, a bird-dog —
the panel falls back to a silhouette of the right *pattern* (a squat looks like a
squat, a plank like a plank), never the generic standing figure that started this.

### Missed workouts stay missed

A `workout_sessions` row is created when the user starts a session and only
reaches `completed` when they press *Finish workout*. A day nobody trained has
no row at all, so it can never be back-filled as done. After a session the app
looks forward through the plan for the next training day and shows it —
including "rest day today, next one Wednesday" (`src/lib/domain/schedule.ts`).

### Accounts are identified by a username

Sign-up takes a name, username, password, age, height, weight and gender, plus
an email if the person wants to give one. The email is optional and is only ever
contact information — it is not a login credential and nothing is sent to it.

Those body facts go straight onto the profile as the account is created, so the
coach starts the first conversation already knowing them and never asks. The
interview is only ever about training: experience, goal, days, session length,
equipment. All of it stays editable in the Profile tab.

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

## Deploying

The app runs on Vercel, deployed from `main`. The environment variables above
have to exist on the project as well as locally:

```bash
bash scripts/vercel-env.sh
```

That copies each value out of `.env.local` into the linked Vercel project for
production, preview and development, reading them from the file so no secret
ends up in a command line. `OPENROUTER_SITE_URL` should point at the deployed
domain rather than localhost.

One gotcha worth knowing: Vercel builds a vulnerable Next.js release and then
refuses to deploy the output. If a deployment fails with *"Vulnerable version
of Next.js detected"* after a clean build, the fix is to upgrade Next, not to
change the app.

## Scripts

```bash
npm run dev        # development server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```
