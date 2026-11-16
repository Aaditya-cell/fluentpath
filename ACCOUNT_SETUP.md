# Account and progress sync setup

This project uses Supabase Auth for email/password accounts and Supabase Postgres for cross-device practice history. Until configured, the app remains usable in guest mode and keeps attempt metadata in this browser.

## 1. Create a Supabase project

Create a project in the Supabase dashboard. In **Connect** or **Settings → API Keys**, copy the project URL and its **publishable key**. The publishable key is meant for browser apps and is safe only when the database policies below are enabled. Never put a `secret` or `service_role` key in browser code.

## 2. Create the attempts table and access rules

Open the Supabase **SQL Editor**, paste the contents of `supabase/setup.sql`, and run it. The SQL grants only the operations this app uses and restricts each learner to their own rows with Row Level Security. It also creates a private, atomic feedback quota of 3 AI requests per minute and 20 per UTC day per account; learners cannot read or edit the quota counters.

## 3. Configure email sign-in

In Supabase **Authentication → URL Configuration**, add `http://localhost:8001/**` to the allowed redirect URLs. Enable email/password sign-in. If email confirmation is enabled, learners must confirm the message before the first sign-in. For real users, configure a production email provider and review its rate limits before launch.

## 4. Add the public project settings locally

Open `.env` in the project root. Add these lines without removing your Gemini settings:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Use the actual values from your Supabase dashboard. If the dashboard only offers a legacy `anon` key, the app can use `SUPABASE_ANON_KEY` temporarily; prefer the publishable key for new projects. `.env` is ignored by Git.

## 5. Add the server-only key for account deletion

Create or copy the Supabase **secret key** from **Settings → API Keys** and add it to `.env`:

```env
SUPABASE_SECRET_KEY=sb_secret_...
```

This key bypasses row-level security. Keep it only in `.env` and Vercel's server-side environment settings; never add it to browser code, Git, or chat. The app rejects a secret/service-role key in the public-key setting. The **Delete account and data** control appears only when both public and server-only Supabase configuration are present. Deletion rechecks the learner's password, verifies recent authentication on the server, permanently removes the Auth account, and relies on SQL foreign-key cascades to remove practice history and quota data. Separate guest history on the current device remains until the learner clears it.

Restart the local server with `npm start`, refresh `http://localhost:8001`, then choose **Sign in** in the lower-left profile. Create an account or sign in. Choose **Sync guest sessions** only if you want the practice history from this browser copied to that account.

## What is synced

Only session metadata is synced: exam, skill, task title, completion time, objective result when applicable, and attempt type. Learner writing, audio, transcripts, and AI feedback are not stored in the practice-history table. A signed-in learner can delete their synced practice history from the account dialog. Signing out returns the app to guest history on that browser.

## Before public launch

In Vercel, set `REQUIRE_AUTH_FOR_AI=true` after configuring Supabase. This makes the feedback API validate each Supabase session and enforce the per-account quota in the database. If Supabase validation or quota checks are unavailable, the endpoint fails closed rather than spending Gemini credits.

Add your production site URL to Supabase's allowed redirect URLs. In Vercel, configure `SUPABASE_SECRET_KEY` as a server-side environment variable. Test sign-up, email confirmation, password reset, sign-in, sign-out, row isolation, quota behavior, recent-password account deletion, and its cascading data removal. The account quota reduces accidental or casual overuse; it does not prevent a determined person from creating multiple accounts, so add host-level abuse monitoring before a paid public launch.
