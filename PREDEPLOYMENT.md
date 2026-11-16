# Pre-deployment readiness

## Completed in this local MVP

- [x] Defined initial scope: IELTS Academic and PTE Academic; General Training deferred.
- [x] Added 71 original familiarisation tasks for IELTS Academic and PTE Academic, with 119 answer-keyed Reading/Listening items, representative IELTS formats, and all 22 scored PTE Academic item types.
- [x] Added a per-exam, per-skill no-repeat rotation for skill-card starts and a “Try another task” control.
- [x] Separated the starter bank into `data/practice-bank.json` and recorded source/rights notes per task.
- [x] Added formative Writing/Speaking rubric guidance; the app does not claim official scores.
- [x] Constrained Gemini output to a JSON feedback schema, validates required rubric criteria, rejects numeric score claims, and labels learner/task text as untrusted exam material.
- [x] Kept the Gemini key server-side and ignored `.env` in Git.
- [x] Rejected Supabase secret/service-role keys from the public client config and required HTTPS for remote Supabase URLs.
- [x] Added provider timeout, one fallback model, health check, and clear API errors.
- [x] Added a labeled local self-review fallback and retry action for AI outages; the fallback does not claim to be AI scoring.
- [x] Added a per-task consent checkbox before sending a written response or recording to Gemini.
- [x] Added same-device guest progress for objective checks, AI feedback, and outage self-review sessions.
- [x] Implemented optional email/password accounts, password reset, explicit guest-history import, synced attempt metadata, and learner deletion of synced practice history.
- [x] Added permanent account deletion with password reauthentication, server-side recent-auth validation, and Supabase Auth Admin deletion; the secret key is used only by the server route.
- [x] Added a Supabase SQL setup with least-privilege grants and per-user row-level security policies.
- [x] Added an optional hosted AI sign-in gate that validates Supabase sessions server-side and fails closed when verification is unavailable.
- [x] Added an atomic per-account AI request quota (3 per minute, 20 per UTC day) for hosted authenticated mode.
- [x] Added Vercel Node function routes for feedback, config, health, and account deletion, with a 10-second maximum function duration and baseline security headers.
- [x] Capped Speaking recordings at 2.8 MB and API JSON bodies at 4 MiB to leave headroom below Vercel's request-body limit.
- [x] Added privacy/data-flow notes and guest-history clearing controls.
- [x] Added keyboard-focus and reduced-motion styles, live feedback/recording status, accessible exam-selection states, page-heading focus on navigation, and a working Help dialog.
- [x] Configured Gemini Interactions requests with `store:false`.
- [x] Added Node test coverage for starter-bank exam/skill coverage and answer-key references, task-library selection across exams, basic accessibility semantics, HTTP method/body-size boundaries, safe Supabase key/URL handling, account deletion, the SQL RLS/cascade/quota contract, plus the feedback contract, rubric/no-score validation, provider fallback, Speaking audio MIME handling, sign-in enforcement, and quota gating.

## Still required before a public beta

- [ ] Have IELTS/PTE educators review every task, answer key, explanation, and rubric.
- [ ] Expand the question bank beyond this 71-task familiarisation set, add multiple fresh items per format, and obtain educator review before describing tasks as exam-accurate.
- [ ] Choose the target audience, paid features, plan prices, billing interval, trial/refund rules, and support contact; the Plans page is currently a preview only.
- [ ] Integrate a payment provider, validate webhooks, and enforce paid access on the server before collecting any money.
- [ ] Before offering graded or paid tests, move objective answer keys out of the downloadable practice-bank JSON and grade them on the server; the current starter answers are visible to anyone who inspects the demo content.
- [ ] Collect consented sample responses, have qualified raters score a held-out subset, and measure agreement before claiming any score estimate.
- [ ] Create/configure the Supabase project, run `supabase/setup.sql`, add local/production URL and publishable-key settings, and verify account email flows, row isolation, and AI quota behavior.
- [ ] Configure `SUPABASE_SECRET_KEY` server-side, then verify recent-password deletion removes the Supabase Auth identity, synced attempts, quota counters, and the browser's local account history.
- [ ] Set `REQUIRE_AUTH_FOR_AI=true` in Vercel and verify valid/expired sessions against the configured Supabase project.
- [ ] Add host-level abuse monitoring and alerting, and confirm Gemini usage/billing limits; account quotas do not stop multi-account abuse.
- [ ] Turn `PRIVACY_AND_CONSENT.md` into published privacy, recording-consent, terms, retention, deletion, and support policies reviewed for the launch jurisdictions.
- [ ] Decide whether to add a second AI provider. A second model from the same provider does not protect against provider-wide outages.
- [ ] Check API usage limits and budget; define monitoring and alerts.
- [ ] Complete accessibility, keyboard, mobile, microphone/browser, and error-state review.
- [ ] Deploy a Vercel preview and verify static content, Gemini feedback, health/config routes, account callbacks, and the audio size boundary before inviting users.
- [ ] Confirm backups, retention, and deletion behavior for the hosted Supabase database before public launch.
- [ ] Add domain/HTTPS, production logging, backups, and incident/support procedures.

## Release gate

Do not market the app as an official IELTS/PTE scorer or as containing official papers. Do not enable public accounts until authentication, data retention/deletion, and recording consent are implemented and reviewed. Validate provider outages with a clear fallback experience before inviting paying users.

Run `npm test` before each deployment. The tests mock Gemini and Supabase responses; they do not replace educator/legal content review or live preview checks against configured provider projects.
