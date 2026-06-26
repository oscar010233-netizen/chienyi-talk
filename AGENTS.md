<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# JIANYI Project Instructions

## Core Goal

The user wants to build a web-based internal system for their cram school. The first purpose is not to sell SaaS immediately; it is to solve real internal daily problems first, then potentially generalize later.

Think of the product as a cram-school operating system:

- Parent communication and message triage.
- Student records, grades, attendance, and make-up class tracking.
- Student question bank and practice workflows.
- Student speaking practice and pronunciation assessment.
- Teacher/admin dashboard for reviewing important messages and student status.
- Future interactive learning, make-up lesson workflows, and teaching-material support.

When uncertain, optimize for something the user's own school can actually use every day.

## Current Repository Focus

This repository currently contains ChienYi Talk speaking practice:

- `/speaking` book list.
- `/speaking/[bookId]/practice` recording practice.
- `/speaking/[bookId]/result` score result.
- `/api/pronunciation-assessment` Azure Speech Pronunciation Assessment.

Azure Speech scoring is confirmed working through the server-side API route.

## Legacy Google System

The user also has an existing Google Sheets + Apps Script + AppSheet system for grades, task tracking, class management, parent-facing lookup, AI comment polishing, and billing.

Treat that system as the migration source for the broader JIANYI OS. Do not copy the sheet layout directly into Supabase. Preserve its business rules and workflows, then normalize them into Supabase tables and Next.js pages.

Migration notes live in `docs/google-sheets-to-supabase-migration.md`.

## DB State (read before touching the database)

`docs/db-state.md` records the current Supabase reality that schema alone does not reveal: removed columns (`student_task_records.lamp`), dropped tables (`schedule_event_students`), tables you must NOT drop (`profiles` = RLS root, `schedule_event_teachers` = joined by the events query), known gaps (`classes.department` has no write UI → buffer ENG/XIAO is dead), and the `audit_log` + `zz_audit` triggers feeding the `/db` monitor page. Column-level source of truth is `lib/db/schema.ts`. Running DDL requires the dashboard token + Management API (see `docs/db-state.md`), not the service-role key.

## Confirmed Stack

- Next.js 16 App Router with Turbopack.
- React 19 and TypeScript.
- Tailwind CSS v4, CSS-first via `app/globals.css`; do not add `tailwind.config.js` unless explicitly required.
- shadcn/ui v4 style components.
- Azure Speech keys stay server-side in `.env.local`; never expose them with `NEXT_PUBLIC_`.

## Practical Product Modules

Prefer building the product in clear modules:

1. Speaking practice
   - Record student audio.
   - Send audio to Azure Speech.
   - Show scores, weak phonemes, and practice advice.

2. Parent communication
   - Receive parent messages, likely from LINE.
   - Classify messages by topic and urgency.
   - Highlight complaints, urgent issues, payments, absences, and make-up requests.
   - Draft replies, but require teacher approval before sending.

3. Student management
   - Students, guardians, classes, attendance, grades, make-up lessons, and notes.
   - One student page should summarize the student's current situation quickly.

4. Question bank
   - Store questions, answers, explanations, tags, difficulty, and source.
   - Support student practice and teacher review.

5. Make-up and interaction workflows
   - Track absence, make-up requirements, assigned materials, completion state, and teacher follow-up.

## Architecture Direction

For the broader JIANYI OS, the likely architecture is:

- Next.js on Vercel for frontend and API.
- Supabase for database, auth, realtime, and storage.
- Inngest for slow background work such as AI analysis, retrying jobs, and scheduled reports.
- LINE Official Account for parent messaging.
- AI APIs for classification, summaries, reply drafts, and learning support.

Key parent-message rule: webhook handlers should validate, store, immediately return `200`, then hand slow work to a background job. Do not block inbound messaging while waiting for AI.

## Data And Security Rules

- Do not hardcode API keys, Azure keys, LINE secrets, database credentials, or tokens.
- Use `.env.local` for real local secrets.
- Use `.env.local.example` only as a template.
- If building multi-school features, every business table should include `tenant_id`.
- Supabase RLS should be the first boundary against cross-school data leakage.
- Parent-facing AI replies should be reviewed by a human before sending, unless the user explicitly changes that policy.

## Azure Speech Setup

Current environment shape:

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `AZURE_SPEECH_ENDPOINT`
- optional `AZURE_FOUNDRY_PROJECT_ENDPOINT`
- optional `AZURE_SPEECH_MOCK`

`AZURE_SPEECH_ENDPOINT=https://eastasia.api.cognitive.microsoft.com/` is confirmed working with the current Azure key.

Use `/api/pronunciation-assessment` as the single scoring entry point. Browser flow:

MediaRecorder -> WAV 16 kHz mono PCM -> POST API route -> Azure Speech -> normalized score JSON.

## Applying DB Migrations (DDL)

**Never ask the user to run SQL manually. You run it yourself via Chrome MCP.**

Workflow for every DDL migration:

1. Write the migration SQL to `supabase/migrations/<timestamp>_<description>.sql`.
2. Open Chrome MCP, navigate to `https://supabase.com/dashboard/project/pmoyvpnbbitnigchvluz`.
3. Run the DDL via the Management API — execute this JS in the page context (the token never leaves the page):
   ```js
   const res = await fetch(
     'https://api.supabase.com/v1/projects/pmoyvpnbbitnigchvluz/database/query',
     {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         Authorization: 'Bearer ' + JSON.parse(localStorage['supabase.dashboard.auth.token']).access_token,
       },
       body: JSON.stringify({ query: `<sql>` }),
     }
   )
   return { status: res.status, body: await res.json() }
   ```
   Success = HTTP 201 + `[]`.
4. Verify the change via REST with the service-role key (`GET /rest/v1/<table>?limit=1` → 200 means the table/column exists).
5. Update `docs/db-state.md` to record the change.

**Gotchas:**
- `localStorage["supabase.dashboard.auth.token"].access_token` is REDACTED if returned directly. Build the `Authorization` header inside the same `fetch` call; only return `{status, body}`.
- The Monaco SQL Editor in the dashboard chokes on long CJK SQL — always use the `fetch` path above.
- FK-repoint order: create+seed → DROP old FK → backfill → ADD new FK.

## Development Rules

- Build real internal workflows, not marketing pages.
- Keep UI practical, clear, and mobile-friendly.
- Preserve the current Next.js 16 and Tailwind v4 patterns.
- Avoid adding large abstractions before the workflow is proven.
- Run `npm run lint` and `npm run build` after code changes.
- Run `npm run check:azure` after changing Azure Speech integration.
