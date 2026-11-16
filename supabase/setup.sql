-- Run this in the Supabase SQL Editor before enabling account progress sync.
-- This table intentionally stores attempt metadata only: never answers, audio,
-- transcripts, AI feedback, or API credentials.

create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam text not null check (exam in ('IELTS', 'PTE')),
  skill text not null check (skill in ('Listening', 'Reading', 'Writing', 'Speaking')),
  title text not null check (char_length(title) between 1 and 180),
  completed_at timestamptz not null,
  correct smallint,
  total smallint,
  attempt_type text not null check (attempt_type in ('objective', 'ai-feedback', 'self-review')),
  constraint practice_attempts_score_pair check (
    (correct is null and total is null)
    or (correct is not null and total is not null and total > 0 and correct between 0 and total)
  )
);

create index if not exists practice_attempts_user_completed_idx
  on public.practice_attempts (user_id, completed_at desc);

alter table public.practice_attempts enable row level security;
revoke all on table public.practice_attempts from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, delete on table public.practice_attempts to authenticated;

drop policy if exists "Learners read their own attempts" on public.practice_attempts;
create policy "Learners read their own attempts"
  on public.practice_attempts for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Learners add their own attempts" on public.practice_attempts;
create policy "Learners add their own attempts"
  on public.practice_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Learners delete their own attempts" on public.practice_attempts;
create policy "Learners delete their own attempts"
  on public.practice_attempts for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Atomic AI feedback quota: 3 requests per minute and 20 per UTC day per account.
-- The private counters are changed only by this security-definer function.
create table if not exists public.ai_feedback_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  minute_bucket timestamptz not null,
  minute_count integer not null check (minute_count >= 0),
  day_bucket date not null,
  day_count integer not null check (day_count >= 0)
);

alter table public.ai_feedback_usage enable row level security;
revoke all on table public.ai_feedback_usage from public, anon, authenticated;

create or replace function public.consume_ai_feedback_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_now timestamptz := clock_timestamp();
  v_minute_bucket timestamptz := date_trunc('minute', v_now);
  v_day_bucket date := (v_now at time zone 'UTC')::date;
  v_minute_count integer;
  v_day_count integer;
begin
  if v_user_id is null then
    return false;
  end if;

  insert into public.ai_feedback_usage as current_usage (
    user_id, minute_bucket, minute_count, day_bucket, day_count
  ) values (
    v_user_id, v_minute_bucket, 1, v_day_bucket, 1
  )
  on conflict (user_id) do update set
    minute_bucket = excluded.minute_bucket,
    minute_count = case when current_usage.minute_bucket = excluded.minute_bucket then current_usage.minute_count + 1 else 1 end,
    day_bucket = excluded.day_bucket,
    day_count = case when current_usage.day_bucket = excluded.day_bucket then current_usage.day_count + 1 else 1 end
  returning minute_count, day_count into v_minute_count, v_day_count;

  return v_minute_count <= 3 and v_day_count <= 20;
end;
$$;

revoke all on function public.consume_ai_feedback_quota() from public, anon, authenticated;
grant execute on function public.consume_ai_feedback_quota() to authenticated;
