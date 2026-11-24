-- Scratch-database fixtures for the sampling test. Mirrors the columns and
-- indexes of public.questions after the real migrations; contains synthetic
-- rows only. Never run this against a real project database.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  syllabus_node_id uuid not null,
  unit_id uuid not null,
  topic_id uuid not null,
  slo_node_id uuid not null,
  slo_reference text not null,
  question text not null,
  options jsonb not null,
  correct_answer_index int not null,
  explanation text not null,
  difficulty text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- same indexes as 20261123000000_create_questions.sql
create index questions_subject_id_idx on public.questions (subject_id);
create index questions_unit_id_idx on public.questions (unit_id);
create index questions_topic_id_idx on public.questions (topic_id);
create index questions_slo_node_id_idx on public.questions (slo_node_id);
create index questions_active_selection_idx on public.questions (subject_id, difficulty) where is_active;

-- Fixed ids so tests can address scopes.
create table public.fx (k text primary key, v uuid not null);
insert into public.fx values
  ('bio',  '00000000-0000-4000-8000-0000000000b1'),
  ('chem', '00000000-0000-4000-8000-0000000000c1'),
  ('u1',   '00000000-0000-4000-8000-000000000a01'),
  ('u2',   '00000000-0000-4000-8000-000000000a02'),
  ('t1',   '00000000-0000-4000-8000-000000000b01'),
  ('t2',   '00000000-0000-4000-8000-000000000b02'),
  ('t3',   '00000000-0000-4000-8000-000000000b03'),
  ('s1',   '00000000-0000-4000-8000-000000000c01'),
  ('s2',   '00000000-0000-4000-8000-000000000c02'),
  ('s3',   '00000000-0000-4000-8000-000000000c03'),
  ('cu',   '00000000-0000-4000-8000-000000000a09'),
  ('ct',   '00000000-0000-4000-8000-000000000b09'),
  ('cs',   '00000000-0000-4000-8000-000000000c09');

-- Biology: 695 ACTIVE rows (mirrors production) in 2 units / 3 topics / 3 SLOs,
-- difficulties in DATABASE vocabulary: 300 easy / 250 moderate / 145 difficult.
--   unit1/topic1/slo1: 350 rows   unit1/topic2/slo2: 295 rows   unit2/topic3/slo3: 50 rows
insert into public.questions
  (subject_id, syllabus_node_id, unit_id, topic_id, slo_node_id, slo_reference, question, options,
   correct_answer_index, explanation, difficulty, is_active, created_at)
select (select v from fx where k='bio'),
       (select v from fx where k = case when n <= 350 then 't1' when n <= 645 then 't2' else 't3' end),
       (select v from fx where k = case when n <= 645 then 'u1' else 'u2' end),
       (select v from fx where k = case when n <= 350 then 't1' when n <= 645 then 't2' else 't3' end),
       (select v from fx where k = case when n <= 350 then 's1' when n <= 645 then 's2' else 's3' end),
       case when n <= 350 then '1.1' when n <= 645 then '1.2' else '2.1' end,
       'Biology question ' || n,
       '["a","b","c","d"]'::jsonb,
       n % 4,
       'SECRET explanation ' || n,
       case when n <= 300 then 'easy' when n <= 550 then 'moderate' else 'difficult' end,
       true,
       timestamptz '2026-01-01' + n * interval '1 minute'
  from generate_series(1, 695) n;

-- 40 INACTIVE Biology rows spread over every scope and difficulty.
insert into public.questions
  (subject_id, syllabus_node_id, unit_id, topic_id, slo_node_id, slo_reference, question, options,
   correct_answer_index, explanation, difficulty, is_active)
select subject_id, syllabus_node_id, unit_id, topic_id, slo_node_id, slo_reference,
       'INACTIVE ' || question, options, correct_answer_index, explanation, difficulty, false
  from public.questions where is_active order by created_at limit 40;

-- Chemistry: 30 active rows (must never leak into Biology scopes) and a scope
-- containing ONLY inactive rows.
insert into public.questions
  (subject_id, syllabus_node_id, unit_id, topic_id, slo_node_id, slo_reference, question, options,
   correct_answer_index, explanation, difficulty, is_active)
select (select v from fx where k='chem'), (select v from fx where k='ct'), (select v from fx where k='cu'),
       (select v from fx where k='ct'), (select v from fx where k='cs'), '9.9',
       'Chemistry question ' || n, '["a","b","c","d"]'::jsonb, 0, 'SECRET chem ' || n, 'moderate', n <= 30
  from generate_series(1, 35) n;   -- rows 31..35 inactive
