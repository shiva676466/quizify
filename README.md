# Quizify

Upload PDF notes → get a summary, 10 MCQs, and flashcards, powered by Google Gemini.

Built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Supabase** (Auth + Postgres + RLS), and the **Gemini API**. Production-ready and deploys to Vercel in a few minutes.

---

## Features

- Email + password auth (Supabase)
- PDF upload with server-side text extraction
- AI generation: summary, 10 multiple-choice questions, 12 flashcards
- Dashboard with upload history, delete, status badges
- Quiz page: interactive MCQs (score tracking), flippable flashcards, copy-to-clipboard, **export to PDF**, **Generate more questions**
- Dark mode + system theme
- Mobile responsive, smooth animations, accessible
- Row-Level Security so users only ever see their own data
- Basic in-memory rate limiting on AI endpoints
- Server-side API handling — no API keys ever shipped to the browser

---

## Project structure

```
quizify/
├── app/
│   ├── api/
│   │   ├── upload/route.ts            # PDF upload → extract → Gemini → save
│   │   ├── generate-more/route.ts     # additional MCQs for an existing quiz
│   │   └── delete-upload/route.ts     # delete an upload (cascades)
│   ├── auth/
│   │   ├── callback/route.ts          # Supabase email confirm callback
│   │   └── signout/route.ts           # POST → sign out
│   ├── dashboard/page.tsx             # upload zone + history
│   ├── login/                         # /login + LoginForm
│   ├── signup/                        # /signup + SignupForm
│   ├── quiz/[id]/page.tsx             # summary + MCQs + flashcards
│   ├── layout.tsx                     # ThemeProvider + Toaster
│   ├── globals.css                    # Tailwind tokens
│   ├── not-found.tsx
│   └── page.tsx                       # landing
├── components/
│   ├── ui/                            # Button, Input, Card
│   ├── Navbar.tsx, Footer.tsx
│   ├── ThemeProvider.tsx, ThemeToggle.tsx
│   ├── UploadZone.tsx                 # drag & drop uploader
│   ├── MCQList.tsx                    # interactive quiz
│   ├── FlashcardDeck.tsx              # flip cards
│   ├── QuizActions.tsx                # copy / export / generate-more
│   ├── DeleteUploadButton.tsx
│   └── SignOutButton.tsx
├── lib/
│   ├── supabase/{client,server,middleware}.ts
│   ├── gemini.ts                      # prompt + JSON parsing
│   ├── pdf.ts                         # pdf-parse wrapper
│   ├── ratelimit.ts                   # in-memory token bucket
│   ├── export.ts                      # jsPDF export
│   └── utils.ts                       # cn, formatBytes, formatDate
├── supabase/schema.sql                # tables, triggers, RLS policies
├── types/index.ts                     # shared types
├── middleware.ts                      # Supabase session refresh + redirects
├── next.config.js, tailwind.config.ts, postcss.config.js, tsconfig.json
├── .env.local.example
└── package.json
```

---

## 1. Local setup

### Prerequisites

- Node.js **18.18+** (or 20+)
- A free **Supabase** project — https://supabase.com
- A **Google AI Studio** API key for Gemini — https://aistudio.google.com/app/apikey

### Install

```bash
cd quizify
npm install
```

### Environment variables

Copy the example and fill in the values:

```bash
cp .env.local.example .env.local
```

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY   # optional, not used yet, reserve for future admin tasks

# Google Gemini
GEMINI_API_KEY=YOUR-GEMINI-API-KEY

# App
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

> Never commit `.env.local`. The Gemini key and Supabase service-role key are server-only.

### Run

```bash
npm run dev
```

Open http://localhost:3000.

---

## 2. Supabase setup

1. Create a new project at https://supabase.com.
2. In the Supabase dashboard, go to **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates:
   - `profiles` (1-to-1 with `auth.users`, auto-populated on signup)
   - `uploads` (filename, size, status)
   - `quizzes` (summary + MCQs as jsonb)
   - `flashcards`
   - Row-Level Security policies so users can only access their own rows.
3. In **Authentication → Providers → Email**, leave email enabled. For local dev you can also disable email confirmations under **Authentication → Settings** so signup is instant.
4. Copy your **Project URL** and **anon public key** from **Project Settings → API** into `.env.local`.
5. (Optional, for email confirmations) under **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` and your production URL to the redirect allow-list.

---

## 3. Gemini setup

1. Go to https://aistudio.google.com/app/apikey and create an API key.
2. Paste it into `.env.local` as `GEMINI_API_KEY`.
3. The app uses `gemini-1.5-flash` by default (fast & cheap). Edit the model name in `lib/gemini.ts` if you want to switch to `gemini-1.5-pro`.

---

## 4. Production deployment (Vercel)

### One-time

1. Push this project to a **private** GitHub repo (see "Create a private GitHub repo" below).
2. Sign in to https://vercel.com and click **Add New → Project**.
3. Import the repo. Vercel auto-detects Next.js — accept defaults.
4. Under **Environment Variables**, add the same four variables as your `.env.local`, but set `NEXT_PUBLIC_SITE_URL` to your deployed URL (e.g. `https://quizify.vercel.app`).
5. Hit **Deploy**.

### After deploy

- In Supabase, add your production URL `https://YOUR-DOMAIN/auth/callback` to **Authentication → URL Configuration → Redirect URLs**.
- Re-deploy if you change env vars.

### Notes for production

- The `/api/upload` and `/api/generate-more` routes are configured with `maxDuration = 60`. On the free Hobby plan, function timeouts are 10s — long PDFs may time out. Either use a Pro plan or shorten the prompt / trim text more aggressively in `lib/gemini.ts`.
- Rate limiting in `lib/ratelimit.ts` is per-instance memory. For real production traffic, swap it for **Upstash Redis** or **Vercel KV** — see the comment in that file.

---

## 5. Create a private GitHub repo

From inside the `quizify/` directory:

```bash
# 1) init local repo
git init
git add .
git commit -m "Initial commit: Quizify scaffold"

# 2a) Using GitHub CLI (recommended)
gh repo create quizify --private --source=. --remote=origin --push

# 2b) OR manually
# - Create an EMPTY private repo on github.com named "quizify"
# - then:
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/quizify.git
git push -u origin main
```

`.gitignore` already excludes `.env*`, `node_modules`, `.next`, and `.vercel`.

---

## 6. Usage

1. Sign up → confirm email if confirmations are on → land on `/dashboard`.
2. Drag-drop a PDF (≤ 10MB) onto the upload zone.
3. Wait ~10–30s for Gemini to generate; you'll be redirected to `/quiz/<id>`.
4. On the quiz page:
   - Read the AI summary.
   - Answer MCQs — pick A/B/C/D, click **Reveal** to score.
   - Flip flashcards.
   - Click **Generate more questions** to add 10 more MCQs (you may be prompted to re-upload the source PDF since the raw text isn't stored).
   - **Copy** the whole set to clipboard, or **Export PDF**.
5. From the dashboard, delete any study set with the trash icon — cascades to its quiz and flashcards.

---

## 7. Tech & dependencies

| Concern               | Choice                                |
| --------------------- | ------------------------------------- |
| Framework             | Next.js 14 (App Router, RSC)          |
| Language              | TypeScript (strict)                   |
| Styling               | Tailwind CSS + CSS variables          |
| UI primitives         | Hand-rolled (Button, Card, Input)     |
| Icons                 | lucide-react                          |
| Toasts                | sonner                                |
| Theme                 | next-themes                           |
| Auth + DB             | Supabase (`@supabase/ssr`)            |
| AI                    | `@google/generative-ai` (Gemini 1.5)  |
| PDF parsing           | `pdf-parse`                           |
| PDF export            | `jspdf`                               |

---

## 8. Security checklist

- ✅ Gemini API key is **never** exposed to the client (server route only).
- ✅ Supabase anon key is public (it's designed to be) — protection comes from **Row-Level Security** policies in `supabase/schema.sql`.
- ✅ All `/api/*` routes verify `supabase.auth.getUser()` server-side.
- ✅ Rate limiting on `/api/upload` (5/min) and `/api/generate-more` (10/min) per user+IP.
- ✅ PDF size capped at 10MB.
- ✅ MIME type validated server-side (not just client).
- ✅ Middleware redirects unauthenticated users away from `/dashboard` & `/quiz/*`.

For multi-instance deployments swap the in-memory rate limiter for Upstash Redis.

---

## 9. Scripts

```bash
npm run dev          # local dev server
npm run build        # production build
npm run start        # serve production build
npm run lint         # eslint
npm run type-check   # tsc --noEmit
```

---

## License

MIT — do whatever you want, just don't sue us.
