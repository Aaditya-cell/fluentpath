# MVP completion status

## 1. Product scope — complete for the pilot

IELTS Academic and PTE Academic are in scope. IELTS General Training is deferred. Scope, learner journey, and success criteria are documented in `PRODUCT_SCOPE.md`.

## 2. Content bank — representative task-type coverage added; review and volume remain

Seventy-one original tasks now cover IELTS Academic and PTE Academic, including 119 answer-keyed Reading and Listening items. The bank includes representative familiarisation tasks across IELTS Reading, Listening, Writing and Speaking formats and all 22 scored PTE Academic item types. The library includes radio choices, multi-select, dropdowns, typed gap answers, matching, word-bank placement, paragraph ordering, word highlighting, charts, diagrams, optional timers, speech prompts and written responses. Skill-card starts rotate through unseen tasks before repeating; learners can select any item in the library. Objective tasks include answer keys and explanations, and every item has source/rights metadata. This is still a starter library, not a full-length mock or exhaustive commercial question bank; educator review and substantially more items per type remain required.

## 3. Scoring — formative only

Reading and Listening objective questions are marked deterministically from their answer keys. Writing and Speaking use rubric-guided Gemini feedback with schema-constrained JSON, required criterion validation, and numeric score claim rejection. Prompt instructions treat learner content as untrusted exam material. Numeric/official score claims are intentionally absent. `RUBRICS.md` defines criteria and calibration requirements.

## 4. Reliability and privacy — implemented for the pilot

The Gemini key stays on the server. Writing and Speaking use Gemini 3.5 Flash-Lite with low thinking and a 15-second server budget (16-second browser timeout), with one fallback model for common transient failures. Interactions use `store:false`. The feedback panel remains visible while the request runs and displays either validated AI feedback or a clearly labeled local self-review with a retry action. Provider-wide outages can still prevent AI feedback; a second vendor is not configured. A synthetic Writing request returned valid feedback in about 6 seconds; Speaking has not been live-verified after the latency change.

## 5. Learner features — account flow implemented; cloud setup pending

Guest progress remains available locally. Optional Supabase email/password sign-up, sign-in, password reset, sign-out, explicit guest-history import, per-user attempt sync, synced-history deletion, and full account deletion are implemented. Full deletion requires the server-only `SUPABASE_SECRET_KEY`, a recent password reauthentication, and Supabase Auth Admin; the database foreign keys cascade to attempt and quota data. The SQL schema uses per-user RLS and grants only required database operations. The app stores only attempt metadata, not learner responses, audio, or AI feedback. Cloud features are not active until a Supabase project is created, the SQL is run, and `.env` is configured; those external steps are documented in `ACCOUNT_SETUP.md`.

A learner-facing Plans preview page now describes the current product and routes visitors into practice. It is a sales-page draft only: there is no selected price, payment provider, subscription entitlement, or checkout flow.

## 6. Launch readiness — local preparation complete; release gates remain

The Plans page does not take payments. Before selling access, choose the plans and prices, integrate a payment provider, enforce paid access on the server, and publish reviewed purchase, refund, privacy, and support terms.

`PREDEPLOYMENT.md` and `PRIVACY_AND_CONSENT.md` document the review gates. Vercel-compatible Node functions now provide feedback, health, and safe public config routes; `vercel.json` sets the function duration and baseline security headers. Hosted feedback can require server-verified Supabase sign-in and an atomic per-account quota (3 per minute, 20 per UTC day). Speaking payloads are bounded for the host limit. The app has not been deployed or verified against real Gemini/Supabase production settings, and educator, privacy, security, and accessibility reviews remain outstanding.

`npm test` checks starter-bank coverage and answer-key references, task-library selection and no-repeat rotation across exams, page navigation focus and active state, basic accessibility semantics, HTTP method/body-size boundaries, safe Supabase key/URL handling, account-deletion behavior, the SQL RLS/cascade/quota contract, plus the feedback contract, rubric/no-score validation, fallback retry, Speaking audio MIME normalization, and hosted authentication/quota gates. Provider calls are mocked and the SQL checks are static; educator/legal content review and live provider/database checks are still pending.

## Current release decision

This is a reviewable MVP demo with launch scaffolding, not a production-ready paid service. Do not deploy publicly until the remaining release gates in `PREDEPLOYMENT.md` are resolved.
