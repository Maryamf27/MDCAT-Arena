begin;

create table if not exists public.mock_test_configs (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null unique references public.tests(id) on delete restrict,
  question_distribution jsonb not null,
  marks_per_correct numeric not null default 1 check (marks_per_correct > 0),
  negative_marking boolean not null default false,
  marks_deducted numeric not null default 0 check (marks_deducted >= 0),
  is_provisional boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mock_test_distribution_object check (jsonb_typeof(question_distribution) = 'object'),
  constraint mock_test_negative_config check (negative_marking or marks_deducted = 0)
);

create table if not exists public.mock_attempt_questions (
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  position integer not null check (position > 0),
  visited boolean not null default false,
  marked_for_review boolean not null default false,
  correct_answer_index_at_submit integer,
  explanation_at_submit text,
  question_snapshot_at_submit jsonb,
  primary key (attempt_id, question_id),
  unique (attempt_id, position)
);

create index if not exists mock_configs_test_idx on public.mock_test_configs(test_id);
create index if not exists mock_attempt_questions_order_idx on public.mock_attempt_questions(attempt_id, position);

alter table public.mock_test_configs enable row level security;
alter table public.mock_attempt_questions enable row level security;
revoke all on public.mock_test_configs from public, anon, authenticated;
revoke all on public.mock_attempt_questions from public, anon, authenticated;
grant select on public.mock_test_configs to authenticated;
grant select on public.mock_attempt_questions to authenticated;
grant all on public.mock_test_configs, public.mock_attempt_questions to service_role;

create policy mock_configs_published_read on public.mock_test_configs
  for select to authenticated using (
    exists (select 1 from public.tests t where t.id = test_id and t.test_type = 'mock' and t.status = 'published')
  );
create policy mock_attempt_questions_owner_read on public.mock_attempt_questions
  for select to authenticated using (
    exists (select 1 from public.attempts a where a.id = attempt_id and a.user_id = auth.uid())
  );

create or replace function public.start_mock_attempt(p_user_id uuid, p_test_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_test public.tests%rowtype;
  v_config public.mock_test_configs%rowtype;
  v_attempt_id uuid;
  v_total integer := 0;
  v_available integer;
  v_subject record;
begin
  select * into v_test from public.tests t where t.id = p_test_id and t.test_type = 'mock' and t.status = 'published';
  if not found then raise exception 'mock_not_available'; end if;
  select * into v_config from public.mock_test_configs c where c.test_id = p_test_id;
  if not found then raise exception 'mock_not_configured'; end if;
  if v_test.duration_seconds is null or v_test.duration_seconds < 60 then raise exception 'invalid_duration'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then raise exception 'user_not_found'; end if;
  insert into public.profiles(user_id) values (p_user_id) on conflict (user_id) do nothing;
  perform pg_advisory_xact_lock(hashtextextended('mock:' || p_user_id::text || ':' || p_test_id::text, 0));
  select a.id into v_attempt_id from public.attempts a
   where a.user_id=p_user_id and a.test_id=p_test_id and a.status='in_progress' and a.expires_at <= now()
   order by a.started_at desc limit 1 for update;
  if v_attempt_id is not null then
    perform public.submit_mock_attempt(v_attempt_id,p_user_id,true);
    v_attempt_id := null;
  end if;

  -- Resume the student's existing active session instead of creating a duplicate.
  select a.id into v_attempt_id from public.attempts a
   where a.user_id = p_user_id and a.test_id = p_test_id and a.status = 'in_progress' and a.expires_at > now()
   order by a.started_at desc limit 1 for update;
  if v_attempt_id is not null then return v_attempt_id; end if;

  if jsonb_typeof(v_config.question_distribution) <> 'object'
     or (select count(*) from jsonb_each_text(v_config.question_distribution)) = 0 then
    raise exception 'invalid_distribution';
  end if;
  for v_subject in select key, value from jsonb_each_text(v_config.question_distribution) loop
    if v_subject.key not in ('biology','chemistry','physics','english','logical_reasoning')
       or v_subject.value !~ '^[1-9][0-9]*$' then raise exception 'invalid_distribution'; end if;
    v_available := (select count(*) from public.questions q join public.subjects s on s.id=q.subject_id
      where s.code = case v_subject.key when 'biology' then 'BIO' when 'chemistry' then 'CHEM'
        when 'physics' then 'PHY' when 'english' then 'ENG' else 'LR' end and q.is_active);
    if v_available < v_subject.value::integer then
      raise exception 'insufficient_coverage:%:%:%', v_subject.key, v_available, v_subject.value;
    end if;
    v_total := v_total + v_subject.value::integer;
  end loop;
  if v_total < 1 or v_total > 500 then raise exception 'invalid_distribution'; end if;

  insert into public.attempts(user_id,test_id,status,started_at,expires_at)
    values (p_user_id,p_test_id,'in_progress',now(),now() + make_interval(secs => v_test.duration_seconds))
    returning id into v_attempt_id;

  for v_subject in select key, value from jsonb_each_text(v_config.question_distribution) loop
    insert into public.mock_attempt_questions(attempt_id,question_id,position)
    select v_attempt_id, selected.id,
      (select count(*) from public.mock_attempt_questions x where x.attempt_id=v_attempt_id) + row_number() over ()
    from (
      select q.id from public.questions q join public.subjects s on s.id=q.subject_id
      where s.code = case v_subject.key when 'biology' then 'BIO' when 'chemistry' then 'CHEM'
        when 'physics' then 'PHY' when 'english' then 'ENG' else 'LR' end and q.is_active
      order by random() limit v_subject.value::integer
    ) selected;
  end loop;
  -- Shuffle the entire set while preserving unique stable positions.
  update public.mock_attempt_questions set position=position + 1000000 where attempt_id=v_attempt_id;
  with randomized as (
    select question_id, row_number() over (order by random())::integer as new_position
    from public.mock_attempt_questions where attempt_id=v_attempt_id
  )
  update public.mock_attempt_questions mq set position=r.new_position
    from randomized r where mq.attempt_id=v_attempt_id and mq.question_id=r.question_id;
  return v_attempt_id;
end;
$$;

create or replace function public.save_mock_answer(
  p_attempt_id uuid, p_user_id uuid, p_question_id uuid, p_selected_index integer,
  p_marked_for_review boolean, p_visited boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_attempt public.attempts%rowtype; v_options jsonb;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found then raise exception 'attempt_not_found'; end if;
  if v_attempt.status <> 'in_progress' or v_attempt.expires_at <= now() then raise exception 'attempt_expired'; end if;
  select q.options into v_options from public.mock_attempt_questions mq join public.questions q on q.id=mq.question_id
   where mq.attempt_id=p_attempt_id and mq.question_id=p_question_id and q.is_active;
  if not found then raise exception 'question_not_in_attempt'; end if;
  if p_selected_index is not null and (p_selected_index < 0 or p_selected_index >= jsonb_array_length(v_options)) then
    raise exception 'invalid_answer';
  end if;
  insert into public.attempt_answers(attempt_id,question_id,selected_option_index,answered_at)
    values(p_attempt_id,p_question_id,p_selected_index,case when p_selected_index is null then null else now() end)
    on conflict(attempt_id,question_id) do update set selected_option_index=excluded.selected_option_index,
      answered_at=excluded.answered_at, is_correct=null;
  update public.mock_attempt_questions set marked_for_review=p_marked_for_review, visited=visited or p_visited
    where attempt_id=p_attempt_id and question_id=p_question_id;
end;
$$;

create or replace function public.submit_mock_attempt(p_attempt_id uuid,p_user_id uuid,p_force_expired boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_attempt public.attempts%rowtype; v_config public.mock_test_configs%rowtype; v_now timestamptz:=now();
  v_total integer; v_answered integer; v_correct integer; v_incorrect integer; v_score numeric; v_max numeric;
begin
  select * into v_attempt from public.attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found then raise exception 'attempt_not_found'; end if;
  if v_attempt.status='submitted' then
    return jsonb_build_object('alreadySubmitted',true,'attemptId',v_attempt.id,'score',v_attempt.score,'totalPoints',v_attempt.total_points,'submittedAt',v_attempt.submitted_at);
  end if;
  if v_attempt.status<>'in_progress' then raise exception 'attempt_not_in_progress'; end if;
  if v_attempt.expires_at > v_now and p_force_expired then raise exception 'deadline_not_reached'; end if;
  select c.* into v_config from public.mock_test_configs c where c.test_id=v_attempt.test_id;
  select count(*) into v_total from public.mock_attempt_questions where attempt_id=p_attempt_id;
  select count(*) filter(where aa.selected_option_index is not null),
         count(*) filter(where aa.selected_option_index=q.correct_answer_index),
         count(*) filter(where aa.selected_option_index is not null and aa.selected_option_index<>q.correct_answer_index)
    into v_answered,v_correct,v_incorrect
    from public.mock_attempt_questions mq join public.questions q on q.id=mq.question_id
    left join public.attempt_answers aa on aa.attempt_id=mq.attempt_id and aa.question_id=mq.question_id
   where mq.attempt_id=p_attempt_id;
  v_max := v_total * v_config.marks_per_correct;
  v_score := (v_correct * v_config.marks_per_correct) -
    (case when v_config.negative_marking then v_incorrect * v_config.marks_deducted else 0 end);
  update public.attempt_answers aa set is_correct=(aa.selected_option_index=q.correct_answer_index)
    from public.questions q where aa.attempt_id=p_attempt_id and q.id=aa.question_id;
  update public.mock_attempt_questions mq
     set correct_answer_index_at_submit=q.correct_answer_index, explanation_at_submit=q.explanation,
         question_snapshot_at_submit=jsonb_build_object('question',q.question,'options',q.options,
           'subject_id',q.subject_id,'slo_reference',q.slo_reference,
           'correct_answer_index',q.correct_answer_index,'explanation',q.explanation)
    from public.questions q where mq.attempt_id=p_attempt_id and q.id=mq.question_id;
  update public.attempts set status='submitted',submitted_at=v_now,score=v_score,total_points=v_max where id=p_attempt_id;
  return jsonb_build_object('alreadySubmitted',false,'attemptId',p_attempt_id,'submittedAt',v_now,
    'score',v_score,'totalPoints',v_max,'total',v_total,'answered',v_answered,'unanswered',v_total-v_answered,
    'correct',v_correct,'incorrect',v_incorrect);
end;
$$;

revoke all on function public.start_mock_attempt(uuid,uuid) from public,anon,authenticated;
revoke all on function public.save_mock_answer(uuid,uuid,uuid,integer,boolean,boolean) from public,anon,authenticated;
revoke all on function public.submit_mock_attempt(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.start_mock_attempt(uuid,uuid) to service_role;
grant execute on function public.save_mock_answer(uuid,uuid,uuid,integer,boolean,boolean) to service_role;
grant execute on function public.submit_mock_attempt(uuid,uuid,boolean) to service_role;

commit;
