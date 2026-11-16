# FluentPath — IELTS Academic & PTE Academic practice

A browser MVP for short, self-directed English exam practice. The supported pilot scope and exclusions are in [PRODUCT_SCOPE.md](PRODUCT_SCOPE.md); the practice library contains 71 original tasks across IELTS Academic and PTE Academic. Objective practice includes 119 answer-keyed items. The original starter set and task-type expansion live in `data/practice-bank.json` and `data/extended-practice-bank.json`; skill-card starts rotate through unseen tasks before repeating. Formative feedback criteria are in [RUBRICS.md](RUBRICS.md).

The **Plans** page is a local sales-preview page. Paid pricing and checkout are not active; do not advertise the preview as a purchasable subscription.

## Run locally

Requires Node.js 20 or newer. In VS Code, open a terminal in this project folder and run:

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm start
```

Keep the terminal open. Open the URL printed by the server (the starter `.env` uses `http://localhost:8001`). Check `/api/health` for the server and Gemini configuration status.

## Run the local checks

Run `npm test` from the project folder. The built-in Node test suite checks exam/skill coverage and answer-key references in the starter bank, task selection and no-repeat rotation in both exam libraries, navigation focus and active state, basic accessibility semantics, route methods and request-size limits, safe Supabase key/URL handling, account deletion, the SQL RLS/cascade/quota contract, the feedback response schema, rubric validation, fallback-model retry, Speaking audio request shape, and hosted sign-in/quota gates. It uses mocked provider responses and static SQL checks; it does not send learner data, connect to Supabase, or make paid Gemini requests. Its rights checks validate the bank's source/rights notes; they do not replace educator or legal review.

## Gemini feedback setup

Create a Gemini API key in Google AI Studio, then put it in the `GEMINI_API_KEY` setting in `.env`. Keep the key server-side; `.env` is ignored by Git. Do not overwrite an existing `.env` when updating the starter file.

Writing responses and Speaking recordings are sent to Gemini only after the learner checks the consent box and selects **Get AI feedback**. Requests use `store:false` on the Interactions API. The app itself does not save the text response or audio. Google’s handling remains subject to its API terms and data policies. See [PRIVACY_AND_CONSENT.md](PRIVACY_AND_CONSENT.md) for the implemented data flow and open review items.

The feedback flow requests schema-constrained JSON from Gemini 3.5 Flash-Lite with low thinking, allows up to 15 seconds server-side and 16 seconds in the page, and retries one fallback model for common transient errors. The feedback panel stays visible while the request runs. If Gemini is unavailable, the page offers a clearly labeled local self-review checklist and a retry button; it does not present the fallback as an AI assessment. Provider latency varies, so the response time is not guaranteed.

The expanded library provides original familiarisation tasks for current IELTS Academic sections and all 22 scored PTE Academic item types. It is not a full-length mock exam or an exhaustive question bank; educators must review the content before commercial use.

## Learner data

Guest history is saved in browser storage on the same device. Optional Supabase accounts sync attempt metadata across devices after you configure the project; signing in never uploads guest history automatically. Learners can choose **Sync guest sessions** in the account dialog. Raw answers, recordings, transcripts, and Gemini feedback are not saved to the practice-history table. A server-side **Delete account and data** route is implemented; enabling it requires a Supabase secret key configured only on the server. See [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md) before enabling accounts.

## Content and scoring

The starter bank is original FluentPath content and is not copied from official IELTS, Pearson PTE, or university papers. Do not add third-party papers without a documented license or permission. Reading and Listening objective tasks use stored answer keys and explanations. Writing and Speaking feedback is qualitative, rubric-guided, and not an official score or band.

## Deployment

The local `server.js` is for development. Vercel-compatible handlers now live under `api/`, and `vercel.json` sets their duration and baseline headers. The feedback route keeps encoded recording payloads below the host limit. Before launch, create/configure Supabase, add `GEMINI_API_KEY`, `GEMINI_MODEL`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` in Vercel's environment settings, set `REQUIRE_AUTH_FOR_AI=true`, run the updated SQL quota setup, and verify the preview deployment. Hosted authenticated mode validates sessions on the server and allows 3 AI requests per minute and 20 per UTC day per account. See [ACCOUNT_SETUP.md](ACCOUNT_SETUP.md) and [PREDEPLOYMENT.md](PREDEPLOYMENT.md).
