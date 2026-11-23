begin;

create or replace function public.start_practice_attempt(
  p_user_id uuid,
  p_subject_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_test_id uuid;
  v_attempt_id uuid;
begin
  v_title := case p_subject_key
    when 'biology' then 'Biology Practice'
    when 'chemistry' then 'Chemistry Practice'
    when 'physics' then 'Physics Practice'
    when 'english' then 'English Practice'
    when 'logical_reasoning' then 'Logical Reasoning Practice'
  end;
  if v_title is null then
    raise exception 'invalid_subject';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  -- attempts.user_id references profiles(user_id); nothing else creates the
  -- profile row, so make sure it exists (role defaults to 'user').
  insert into public.profiles (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  perform pg_advisory_xact_lock(hashtextextended('practice_test:' || p_subject_key, 0));

  select t.id into v_test_id
    from public.tests t
   where t.test_type = 'practice' and t.status = 'published' and t.title = v_title
   order by t.created_at
   limit 1;

  if v_test_id is null then
    insert into public.tests (title, description, test_type, status)
    values (v_title, 'Untimed practice session', 'practice', 'published')
    returning id into v_test_id;
  end if;

  insert into public.attempts (user_id, test_id)
  values (p_user_id, v_test_id)
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

create or replace function public.submit_practice_attempt(
  p_attempt_id uuid,
  p_user_id uuid,
  p_answers jsonb,            -- [{ "questionId": uuid, "selectedIndex": 0-3 | null }]
  p_expected_correct integer  -- the API's own score; used only as a consistency check
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts%rowtype;
  v_test_type text;
  v_expected integer;
  v_inserted integer;
  v_correct integer;
  v_total integer;
  v_now timestamptz := now();
begin
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers) = 0 then
    raise exception 'invalid_answers';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_answers) as a("questionId" uuid, "selectedIndex" integer)
     where a."selectedIndex" is not null and a."selectedIndex" not between 0 and 3
  ) then
    raise exception 'invalid_answers';
  end if;

  -- Row lock: concurrent submits of the same attempt queue up here.
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found or v_attempt.user_id <> p_user_id then
    raise exception 'attempt_not_found';
  end if;

  select t.test_type into v_test_type from public.tests t where t.id = v_attempt.test_id;
  if v_test_type is distinct from 'practice' then
    raise exception 'attempt_not_found';
  end if;

  -- Duplicate submission: write nothing, hand back what was saved.
  if v_attempt.status = 'submitted' then
    return jsonb_build_object(
      'alreadySubmitted', true,
      'attemptId', v_attempt.id,
      'submittedAt', v_attempt.submitted_at,
      'score', v_attempt.score,
      'totalPoints', v_attempt.total_points,
      'answers', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'questionId', aa.question_id,
            'selectedIndex', aa.selected_option_index
          ) order by aa.question_id), '[]'::jsonb)
          from public.attempt_answers aa
         where aa.attempt_id = v_attempt.id
      )
    );
  end if;

  if v_attempt.status <> 'in_progress'
     or (v_attempt.expires_at is not null and v_attempt.expires_at < v_now) then
    raise exception 'attempt_expired';
  end if;

  v_expected := jsonb_array_length(p_answers);

  insert into public.attempt_answers
    (attempt_id, question_id, selected_option_index, is_correct, answered_at)
  select p_attempt_id,
         a."questionId",
         a."selectedIndex",
         (a."selectedIndex" is not null and a."selectedIndex" = q.correct_answer_index),
         case when a."selectedIndex" is null then null else v_now end
    from jsonb_to_recordset(p_answers) as a("questionId" uuid, "selectedIndex" integer)
    join public.questions q on q.id = a."questionId";
  get diagnostics v_inserted = row_count;

  if v_inserted <> v_expected then
    raise exception 'unknown_questions';
  end if;

  select count(*) filter (where is_correct), count(*)
    into v_correct, v_total
    from public.attempt_answers
   where attempt_id = p_attempt_id;

  if v_correct is distinct from p_expected_correct then
    raise exception 'score_mismatch';
  end if;

  update public.attempts
     set status = 'submitted',
         submitted_at = v_now,
         score = v_correct,
         total_points = v_total
   where id = p_attempt_id;

  return jsonb_build_object(
    'alreadySubmitted', false,
    'attemptId', p_attempt_id,
    'submittedAt', v_now,
    'score', v_correct,
    'totalPoints', v_total
  );
end;
$$;

-- Only the server (service role) may call these. Students must never be able
-- to start/submit attempts by calling the RPC directly with their own anon key.
revoke all on function public.start_practice_attempt(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_practice_attempt(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.start_practice_attempt(uuid, text) to service_role;
grant execute on function public.submit_practice_attempt(uuid, uuid, jsonb, integer) to service_role;

commit;
