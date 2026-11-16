# Privacy and consent notes for product review

This is an implementation summary for review, not a substitute for launch-specific legal advice or a published privacy policy.

## Data the current app handles

- **Guest practice history:** stored in this browser's local storage. It includes exam, skill, task title, completion time, attempt type, and an objective result when applicable. It does not include the learner's answer, recording, transcript, or AI feedback. The account dialog offers a control to clear guest history on this device.
- **Signed-in account:** Supabase Auth handles the email/password account and session. When the learner is signed in, new attempt metadata is sent to the Supabase `practice_attempts` table. The account dialog offers separate controls to delete synced practice history or permanently delete the account and its synced server data. Full deletion rechecks the password and requires a server-only Supabase secret key.
- **AI feedback:** after the learner checks the consent box and selects feedback, the written response or speaking recording is sent to Google's Gemini API along with the task prompt and relevant source material (for example, chart data or a sample transcript). The project sends `store:false` with the Interactions request and does not save the response, recording, transcript, or generated feedback in its own database. Provider processing is governed by Google's applicable API terms and data policies; `store:false` is not a promise about all provider-side processing or retention.
- **Speaking recording:** captured in browser memory for the current session. It is not sent until the learner checks the consent box and requests feedback. The app does not upload it to Supabase. Recordings above 2.8 MB are rejected to stay below the function-host payload limit.

## Controls currently implemented

- The learner must check consent before submitting each Writing or Speaking task; that consent remains in effect for retries within the same open task.
- AI outages show an explicitly labeled general self-review instead of fake AI assessment.
- Cloud attempt rows are owner-scoped with Supabase Row Level Security and contain no raw learner work.
- A learner can sign out, choose whether to import guest history, clear device guest history, delete synced practice history, or request full account deletion.
- The Supabase publishable key is public by design and is only safe when the supplied SQL grants and RLS policies are installed. No Supabase secret/service-role key is used in browser code.

## Still required before a public launch

- Write, publish, and have counsel review a privacy notice, terms, recording notice, retention schedule, and support process for the actual operating jurisdictions.
- Configure the server-only Supabase secret key and verify that full account deletion removes the Auth identity, synced attempts, and quota row. The secret must never be placed in the browser or returned from `/api/config`.
- Configure production email delivery and review confirmation/reset flows.
- Choose database retention and backup settings, then explain any provider backup retention to learners.
- Enable server-side Supabase authentication and per-account AI quotas for hosted feedback; add host-level abuse monitoring and provider budget alerts before public use.
- Have privacy/security reviewers inspect all data flows and provider agreements before accepting real learner recordings.
