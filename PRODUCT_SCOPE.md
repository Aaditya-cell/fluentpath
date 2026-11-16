# FluentPath MVP scope

## Product decision

Initial scope: browser practice for **IELTS Academic** and **PTE Academic**, for independent learners who want short practice sessions and formative feedback. IELTS General Training is deferred until its content set is separately prepared.

## Learner journey

1. Choose IELTS Academic or PTE Academic.
2. Choose Listening, Reading, Writing, or Speaking.
3. Read the task directions and complete a short practice task.
4. Check objective answers immediately; request formative AI feedback for Writing or Speaking.
5. Review the attempt and see recent practice history saved on this device, or sign in to sync it across devices.

## MVP included

- Responsive practice dashboard and skill/task selection.
- Original familiarisation tasks, answer keys, and explanations in `data/practice-bank.json` and `data/extended-practice-bank.json`, covering representative IELTS Academic formats and all scored PTE Academic item types.
- Deterministic checks for multiple-choice Reading and Listening questions.
- Qualitative, rubric-guided feedback for Writing and Speaking through the server-side Gemini API.
- A short request deadline, one model fallback, health endpoint, clear provider errors, and no AI request if the key is missing.
- Guest progress saved locally in the browser, with optional Supabase email/password accounts and private cross-device progress sync when configured.
- Clear disclosure that prompts are illustrative and automated feedback is not an official score.

## Deferred until the MVP is reviewed

- IELTS General Training, complete exam-length mock tests, a large question bank with repeated practice for each item type, and official score predictions.
- Payments, subscriptions, and admin authoring tools. Account sync requires a configured Supabase project before use.
- Model fine-tuning. The current Gemini Developer API/AI Studio does not offer direct fine-tuning; Vertex AI is a separate option.
- Importing exam or university papers without a documented license or permission.

## Pilot success criteria

- Learners can finish at least one task in each of the eight exam/skill combinations.
- Reading and Listening answers are reproducible from a stored key and explanation.
- Writing and Speaking feedback uses visible criteria and never presents itself as an official score.
- A provider outage stops within the configured time limit, preserves the learner's current work, and gives a useful retry message.
- Attempts persist after refreshing the same browser on the same device.
