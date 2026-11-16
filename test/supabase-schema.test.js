import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql=readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8');

test('Supabase practice data is owner-scoped and cascades when an account is deleted',()=>{
  assert.match(sql,/create table if not exists public\.practice_attempts/i);
  assert.match(sql,/user_id uuid not null references auth\.users\s*\(id\) on delete cascade/i);
  assert.match(sql,/alter table public\.practice_attempts enable row level security/i);
  assert.match(sql,/revoke all on table public\.practice_attempts from anon, authenticated/i);
  assert.match(sql,/grant select, insert, delete on table public\.practice_attempts to authenticated/i);
  assert.match(sql,/create policy "Learners read their own attempts"[\s\S]*?using\s*\(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql,/create policy "Learners add their own attempts"[\s\S]*?with check\s*\(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql,/create policy "Learners delete their own attempts"[\s\S]*?using\s*\(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql,/user_id uuid primary key references auth\.users\s*\(id\) on delete cascade/i);
});

test('Supabase AI quota counters are private and enforced atomically per account',()=>{
  assert.match(sql,/alter table public\.ai_feedback_usage enable row level security/i);
  assert.match(sql,/revoke all on table public\.ai_feedback_usage from public, anon, authenticated/i);
  assert.match(sql,/create or replace function public\.consume_ai_feedback_quota\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(sql,/insert into public\.ai_feedback_usage as current_usage[\s\S]*?on conflict \(user_id\) do update/i);
  assert.match(sql,/return v_minute_count <= 3 and v_day_count <= 20/i);
  assert.match(sql,/revoke all on function public\.consume_ai_feedback_quota\(\) from public, anon, authenticated/i);
  assert.match(sql,/grant execute on function public\.consume_ai_feedback_quota\(\) to authenticated/i);
});
