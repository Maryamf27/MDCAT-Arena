-- Assertions for public.sample_practice_questions. Any failed assertion raises
-- and (with ON_ERROR_STOP) fails the run. Output lines: "ok - <name>".
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

create temp table results (name text);

create function pg_temp.pass(p_name text) returns void language sql as
$$ insert into pg_temp.results values (p_name); select null::void $$;

create function pg_temp.assert(p_ok boolean, p_name text, p_detail text default '') returns void
language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAIL - %: %', p_name, p_detail; end if;
  insert into pg_temp.results values (p_name);
end $$;

select md5(string_agg(q::text, '|' order by id)) as before_hash from public.questions q \gset

-- 0. Preconditions of the fixture
select pg_temp.assert((select count(*) from public.questions where subject_id=(select v from fx where k='bio') and is_active) = 695,
  'fixture: 695 active biology questions');

-- 1. Subject-wide selection works when the pool is larger than 500
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 50)) = 50,
  'subject-wide sample returns the requested 50');
select pg_temp.assert((select count(distinct id) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 50)) = 50,
  'no duplicates within one result');

-- 2. Every one of the 695 eligible questions can be selected (including those
--    beyond the first 500 physical rows that the old code could never reach).
create temp table seen as select id from public.questions where false;
do $$
begin
  for i in 1..700 loop
    insert into pg_temp.seen
      select id from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 50);
  end loop;
end $$;
select pg_temp.assert((select count(distinct id) from pg_temp.seen) = 695,
  'all 695 eligible biology questions are reachable by subject-wide sampling',
  (select count(distinct id)::text from pg_temp.seen));
select pg_temp.assert(
  (select count(distinct s.id) from pg_temp.seen s join public.questions q using (id)
    where q.created_at > timestamptz '2026-01-01' + 500 * interval '1 minute') = 195,
  'the 195 questions beyond the old 500-row window are all reachable');

-- 3. Inactive questions are never returned
select pg_temp.assert(not exists (
    select 1 from pg_temp.seen s join public.questions q using (id) where not q.is_active),
  'inactive questions never appear in 700 subject-wide draws');
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='chem'), null, null, null, null, 50)) = 30,
  'chemistry returns exactly its 30 active questions (5 inactive excluded)');

-- 4. Scope filters (subject / unit / topic / SLO)
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 50)
    where subject_id <> (select v from fx where k='bio')) = 0, 'subject filter');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), (select v from fx where k='u2'), null, null, null, 50)) = 50
  and not exists (select 1 from public.sample_practice_questions((select v from fx where k='bio'), (select v from fx where k='u2'), null, null, null, 50)
                   where unit_id <> (select v from fx where k='u2')),
  'unit filter (unit 2 has exactly 50 active questions)');
select pg_temp.assert(not exists (select 1 from public.sample_practice_questions(null, null, (select v from fx where k='t2'), null, null, 50)
    where topic_id <> (select v from fx where k='t2')), 'topic filter');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions(null, null, null, (select v from fx where k='s3'), null, 50)) = 50
  and not exists (select 1 from public.sample_practice_questions(null, null, null, (select v from fx where k='s3'), null, 50)
                   where slo_node_id <> (select v from fx where k='s3')),
  'SLO filter');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), (select v from fx where k='u1'),
        (select v from fx where k='t1'), (select v from fx where k='s1'), null, 50)) = 50
  and (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), (select v from fx where k='u2'),
        (select v from fx where k='t1'), null, null, 50)) = 0,
  'subject+unit+topic+SLO combine with AND semantics');
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 50) where unit_id is null) = 0,
  'rows carry their syllabus ids');

-- 5. Difficulty filter in database vocabulary (mapping from easy/medium/hard is done in TypeScript)
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'easy', 50)) = 50
  and not exists (select 1 from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'easy', 50) where difficulty <> 'easy'),
  'difficulty=easy');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'moderate', 50)) = 50
  and not exists (select 1 from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'moderate', 50) where difficulty <> 'moderate'),
  'difficulty=moderate');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'difficult', 50)) = 50
  and not exists (select 1 from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'difficult', 50) where difficulty <> 'difficult'),
  'difficulty=difficult');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'medium', 50)) = 0
  and (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'hard', 50)) = 0,
  'API words medium/hard match nothing at the database level (they must be mapped first)');
-- every difficulty bucket is fully reachable too (145 difficult rows)
create temp table seen_hard as select id from public.questions where false;
do $$ begin
  for i in 1..300 loop
    insert into pg_temp.seen_hard
      select id from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, 'difficult', 50);
  end loop;
end $$;
select pg_temp.assert((select count(distinct id) from pg_temp.seen_hard) = 145, 'all 145 difficult questions reachable');

-- 6. Fewer eligible rows than the limit: returns all of them, once each
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='chem'), null, null, null, null, 50)) = 30
  and (select count(distinct id) from public.sample_practice_questions((select v from fx where k='chem'), null, null, null, null, 50)) = 30,
  'limit larger than the eligible set returns each eligible row once');

-- 7. Limit clamping
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 1000)) = 50, 'limit clamped to 50');
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 0)) = 1, 'limit clamped to at least 1');
select pg_temp.assert((select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, null)) = 10, 'null limit defaults to 10');

-- 8. Results differ between calls (it is actually random)
create temp table draws (ids uuid[]);
do $$ begin
  for i in 1..5 loop
    insert into pg_temp.draws
      select array_agg(id order by id)
        from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 20);
  end loop;
end $$;
select pg_temp.assert((select count(distinct ids) from pg_temp.draws) > 1, 'consecutive samples differ');

-- 9. Answer keys are never part of the function's result
select pg_temp.assert(
  pg_get_function_result('public.sample_practice_questions(uuid,uuid,uuid,uuid,text,integer)'::regprocedure) !~* '(correct_answer|explanation|source_|content_hash|question_hash|status)',
  'function result type contains no answer key or provenance column');
select pg_temp.assert(
  (select count(*) from public.sample_practice_questions((select v from fx where k='bio'), null, null, null, null, 50) r
     where to_jsonb(r)::text ~* '(SECRET|correct_answer|explanation)') = 0,
  'returned rows contain no explanation text or answer key');

-- 10. Privileges: service_role only
select pg_temp.assert(
  has_function_privilege('service_role', 'public.sample_practice_questions(uuid,uuid,uuid,uuid,text,integer)', 'execute')
  and not has_function_privilege('anon', 'public.sample_practice_questions(uuid,uuid,uuid,uuid,text,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.sample_practice_questions(uuid,uuid,uuid,uuid,text,integer)', 'execute'),
  'execute granted to service_role only');

-- 11. Non-destructive: sampling changed nothing
select md5(string_agg(q::text, '|' order by id)) as after_hash from public.questions q \gset
select pg_temp.assert(:'before_hash' = :'after_hash', 'questions table is byte-for-byte unchanged by sampling');

select 'ok - ' || name from pg_temp.results;
select 'ASSERTIONS PASSED: ' || count(*) from pg_temp.results;
