begin;

-- The original subjects table is external to migrations in this repository.
-- Fail before writing if its known app-facing contract is not present.
do $$
declare missing_columns text;
begin
  if to_regclass('public.subjects') is null then
    raise exception 'Expected existing public.subjects table';
  end if;
  if to_regclass('public.mock_test_configs') is null or to_regclass('public.tests') is null then
    raise exception 'Apply the existing mock-test engine migration before exam tracks';
  end if;
  select string_agg(required.column_name, ', ' order by required.column_name)
    into missing_columns
    from (values ('id'), ('code'), ('name')) as required(column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name='subjects'
        and c.column_name=required.column_name
   );
  if missing_columns is not null then
    raise exception 'public.subjects is missing required columns: %', missing_columns;
  end if;
  select string_agg(required.table_name || '.' || required.column_name, ', ' order by required.table_name, required.column_name)
    into missing_columns
    from (values
      ('tests','id'),('tests','title'),('tests','description'),('tests','test_type'),('tests','duration_seconds'),('tests','status'),
      ('mock_test_configs','test_id'),('mock_test_configs','question_distribution'),('mock_test_configs','marks_per_correct'),
      ('mock_test_configs','negative_marking'),('mock_test_configs','marks_deducted'),('mock_test_configs','is_provisional'),('mock_test_configs','updated_at')
    ) as required(table_name,column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema='public' and c.table_name=required.table_name
        and c.column_name=required.column_name
   );
  if missing_columns is not null then
    raise exception 'Mock-test schema is missing required columns: %', missing_columns;
  end if;
  if exists (
    select 1 from public.subjects where code in ('BIO','CHEM','PHY','ENG','LR')
    group by code having count(*) > 1
  ) then
    raise exception 'Duplicate canonical MDCAT subject codes found; refusing to guess which rows to tag';
  end if;
  if exists (
    select 1 from public.subjects
     where code in ('ECAT_MATH','ECAT_PHY','ECAT_CHEM','ECAT_ENG',
                    'NAT_IE_ENG','NAT_IE_ANALYTICAL','NAT_IE_QUANTITATIVE',
                    'NAT_IE_PHY','NAT_IE_CHEM','NAT_IE_MATH')
     group by code having count(*) > 1
  ) then
    raise exception 'Duplicate ECAT or NAT subject codes found; refusing to guess which rows to tag';
  end if;
end;
$$;

alter table public.subjects add column if not exists subject_key text;
alter table public.subjects add column if not exists exam_key text;
alter table public.subjects add column if not exists category_key text;

-- Preserve the five existing MDCAT subject rows and every question FK.
update public.subjects
   set subject_key = case code
       when 'BIO' then 'biology'
       when 'CHEM' then 'chemistry'
       when 'PHY' then 'physics'
       when 'ENG' then 'english'
       when 'LR' then 'logical_reasoning'
     end,
       exam_key = 'mdcat',
       category_key = null
 where code in ('BIO','CHEM','PHY','ENG','LR');

-- Namespace new subject codes so their question rows cannot overlap MDCAT.
update public.subjects set subject_key='ecat_mathematics', exam_key='ecat', category_key='pre_engineering', name='ECAT Mathematics' where code='ECAT_MATH';
update public.subjects set subject_key='ecat_physics', exam_key='ecat', category_key='pre_engineering', name='ECAT Physics' where code='ECAT_PHY';
update public.subjects set subject_key='ecat_chemistry', exam_key='ecat', category_key='pre_engineering', name='ECAT Chemistry' where code='ECAT_CHEM';
update public.subjects set subject_key='ecat_english', exam_key='ecat', category_key='pre_engineering', name='ECAT English' where code='ECAT_ENG';
update public.subjects set subject_key='nat_ie_english', exam_key='nts_nat', category_key='nat_ie', name='NAT-IE English' where code='NAT_IE_ENG';
update public.subjects set subject_key='nat_ie_analytical', exam_key='nts_nat', category_key='nat_ie', name='NAT-IE Analytical' where code='NAT_IE_ANALYTICAL';
update public.subjects set subject_key='nat_ie_quantitative', exam_key='nts_nat', category_key='nat_ie', name='NAT-IE Quantitative' where code='NAT_IE_QUANTITATIVE';
update public.subjects set subject_key='nat_ie_physics', exam_key='nts_nat', category_key='nat_ie', name='NAT-IE Physics' where code='NAT_IE_PHY';
update public.subjects set subject_key='nat_ie_chemistry', exam_key='nts_nat', category_key='nat_ie', name='NAT-IE Chemistry' where code='NAT_IE_CHEM';
update public.subjects set subject_key='nat_ie_mathematics', exam_key='nts_nat', category_key='nat_ie', name='NAT-IE Mathematics' where code='NAT_IE_MATH';

insert into public.subjects (
    code,
    name,
    sort_order,
    subject_key,
    exam_key,
    category_key
)
select
    valueset.code,
    valueset.name,
    valueset.sort_order,
    valueset.subject_key,
    valueset.exam_key,
    valueset.category_key
from (
    values
    ('ECAT_MATH', 'ECAT Mathematics', 6, 'ecat_mathematics', 'ecat', 'pre_engineering'),
    ('ECAT_PHY', 'ECAT Physics', 7, 'ecat_physics', 'ecat', 'pre_engineering'),
    ('ECAT_CHEM', 'ECAT Chemistry', 8, 'ecat_chemistry', 'ecat', 'pre_engineering'),
    ('ECAT_ENG', 'ECAT English', 9, 'ecat_english', 'ecat', 'pre_engineering'),
    ('NAT_IE_ENG', 'NAT-IE English', 10, 'nat_ie_english', 'nts_nat', 'nat_ie'),
    ('NAT_IE_ANALYTICAL', 'NAT-IE Analytical', 11, 'nat_ie_analytical', 'nts_nat', 'nat_ie'),
    ('NAT_IE_QUANTITATIVE', 'NAT-IE Quantitative', 12, 'nat_ie_quantitative', 'nts_nat', 'nat_ie'),
    ('NAT_IE_PHY', 'NAT-IE Physics', 13, 'nat_ie_physics', 'nts_nat', 'nat_ie'),
    ('NAT_IE_CHEM', 'NAT-IE Chemistry', 14, 'nat_ie_chemistry', 'nts_nat', 'nat_ie'),
    ('NAT_IE_MATH', 'NAT-IE Mathematics', 15, 'nat_ie_mathematics', 'nts_nat', 'nat_ie')
) as valueset(
    code,
    name,
    sort_order,
    subject_key,
    exam_key,
    category_key
)
where not exists (
    select 1
    from public.subjects s
    where s.code = valueset.code
);

create unique index if not exists subjects_subject_key_unique
  on public.subjects(subject_key) where subject_key is not null;
create index if not exists subjects_exam_category_idx
  on public.subjects(exam_key, category_key);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.subjects'::regclass and conname='subjects_exam_key_check') then
    alter table public.subjects add constraint subjects_exam_key_check
      check (exam_key is null or exam_key in ('mdcat','ecat','nts_nat'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.subjects'::regclass and conname='subjects_exam_category_check') then
    alter table public.subjects add constraint subjects_exam_category_check
      check ((exam_key='mdcat' and category_key is null)
          or (exam_key='ecat' and category_key is not null and category_key ~ '^[a-z0-9_]+$')
          or (exam_key='nts_nat' and category_key='nat_ie')
          or (exam_key is null and category_key is null));
  end if;
end;
$$;

alter table public.mock_test_configs add column if not exists exam_key text;
alter table public.mock_test_configs add column if not exists category_key text;
alter table public.mock_test_configs add column if not exists blueprint_key text;
alter table public.mock_test_configs add column if not exists blueprint_source_name text;
alter table public.mock_test_configs add column if not exists blueprint_source_url text;
alter table public.mock_test_configs add column if not exists blueprint_verification_status text;
alter table public.mock_test_configs add column if not exists blueprint_verified_at date;
alter table public.mock_test_configs add column if not exists blueprint_verification_note text;
update public.mock_test_configs set exam_key='mdcat' where exam_key is null;
update public.mock_test_configs set blueprint_verification_status='unverified' where blueprint_verification_status is null;
alter table public.mock_test_configs alter column exam_key set default 'mdcat';
alter table public.mock_test_configs alter column exam_key set not null;
alter table public.mock_test_configs alter column blueprint_verification_status set default 'unverified';
alter table public.mock_test_configs alter column blueprint_verification_status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.mock_test_configs'::regclass and conname='mock_configs_exam_key_check') then
    alter table public.mock_test_configs add constraint mock_configs_exam_key_check
      check (exam_key in ('mdcat','ecat','nts_nat'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.mock_test_configs'::regclass and conname='mock_configs_blueprint_status_check') then
    alter table public.mock_test_configs add constraint mock_configs_blueprint_status_check
      check (blueprint_verification_status in ('verified','partial','unverified'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.mock_test_configs'::regclass and conname='mock_configs_category_check') then
    alter table public.mock_test_configs add constraint mock_configs_category_check
      check ((exam_key='mdcat' and category_key is null)
          or (exam_key='ecat' and category_key is not null and category_key ~ '^[a-z0-9_]+$')
          or (exam_key='nts_nat' and category_key='nat_ie'));
  end if;
end;
$$;

create index if not exists mock_configs_exam_category_idx
  on public.mock_test_configs(exam_key, category_key);

-- Persist these official blueprints as drafts. Publish is guarded by active
-- question coverage, so this does not represent complete syllabus coverage.
do $$
declare
  v_test_id uuid;
begin
  if not exists (select 1 from public.mock_test_configs where blueprint_key='uet_ecat_pre_engineering_2026') then
    insert into public.tests(title,description,test_type,duration_seconds,status)
    values ('UET ECAT Pre-Engineering', 'Official blueprint; publish only when each subject has full active question coverage.', 'mock', 6000, 'draft')
    returning id into v_test_id;
    insert into public.mock_test_configs(
      test_id,question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional,
      exam_key,category_key,blueprint_key,blueprint_source_name,blueprint_source_url,
      blueprint_verification_status,blueprint_verified_at,blueprint_verification_note
    ) values (
      v_test_id,
      '{"ecat_mathematics":30,"ecat_physics":30,"ecat_chemistry":30,"ecat_english":10}'::jsonb,
      4,false,0,false,
      'ecat','pre_engineering','uet_ecat_pre_engineering_2026','UET ECAT - About ECAT (Fall 2026)',
      'https://ecat.uet.edu.pk/general/ecat','verified','2026-11-28',
      'UET states 100 minutes, 10 English questions, 90 equally split among the three selected subjects, four marks per correct answer, and no negative marking.'
    );
  end if;

  if not exists (select 1 from public.mock_test_configs where blueprint_key='nts_nat_ie_2026') then
    insert into public.tests(title,description,test_type,duration_seconds,status)
    values ('NTS NAT-IE', 'NTS NAT-IE blueprint; scoring rule is partially verified.', 'mock', 7200, 'draft')
    returning id into v_test_id;
    insert into public.mock_test_configs(
      test_id,question_distribution,marks_per_correct,negative_marking,marks_deducted,is_provisional,
      exam_key,category_key,blueprint_key,blueprint_source_name,blueprint_source_url,
      blueprint_verification_status,blueprint_verified_at,blueprint_verification_note
    ) values (
      v_test_id,
      '{"nat_ie_english":20,"nat_ie_analytical":20,"nat_ie_quantitative":20,"nat_ie_physics":10,"nat_ie_chemistry":10,"nat_ie_mathematics":10}'::jsonb,
      1,false,0,true,
      'nts_nat','nat_ie','nts_nat_ie_2026','NTS NAT Paper Pattern and Questions Distribution',
      'https://nts.org.pk/Products/NTSNAT/nat-paper-pattern.php','partial','2026-11-28',
      'NTS confirms the section counts and 120-minute duration. The reference does not specify points per answer or a negative-marking rule; one point per correct answer and no penalty are Arena scoring defaults pending confirmation.'
    );
  end if;
end;
$$;

create or replace function public.resolve_question_syllabus_refs(
  p_subject_key text, p_unit_path text, p_topic_path text, p_slo text
)
returns table (subject_id uuid, unit_id uuid, topic_id uuid, slo_node_id uuid)
language sql stable set search_path = '' as $$
  with subj as (
    select s.id from public.subjects s where s.subject_key = p_subject_key
  )
  select subj.id, u.id, t.id, l.id
    from subj
    join public.syllabus_nodes u on u.subject_id=subj.id and u.node_type::text='unit'
      and u.source_path=subj.id::text || substr(p_unit_path,length(p_subject_key)+1)
    join public.syllabus_nodes t on t.subject_id=subj.id and t.node_type::text='topic'
      and t.parent_id=u.id
      and t.source_path=subj.id::text || substr(p_topic_path,length(p_subject_key)+1)
    join public.syllabus_nodes l on l.subject_id=subj.id and l.node_type::text='slo'
      and l.parent_id=t.id and l.source_identifier=p_slo
   where p_unit_path like p_subject_key || '/unit/%'
     and p_topic_path like p_unit_path || '/topic/%';
$$;
revoke all on function public.resolve_question_syllabus_refs(text,text,text,text) from public,anon,authenticated;
grant execute on function public.resolve_question_syllabus_refs(text,text,text,text) to service_role;

create or replace function public.start_practice_attempt(p_user_id uuid,p_subject_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_subject public.subjects%rowtype;
  v_title text;
  v_test_id uuid;
  v_attempt_id uuid;
begin
  select * into v_subject from public.subjects where subject_key=p_subject_key;
  if not found then raise exception 'invalid_subject'; end if;

  if v_subject.exam_key='mdcat' then
    v_title := case v_subject.subject_key
      when 'biology' then 'Biology Practice'
      when 'chemistry' then 'Chemistry Practice'
      when 'physics' then 'Physics Practice'
      when 'english' then 'English Practice'
      when 'logical_reasoning' then 'Logical Reasoning Practice'
      else null
    end;
  elsif v_subject.exam_key='ecat' then
    v_title := 'UET ECAT Pre-Engineering ' || coalesce(v_subject.name,'Subject') || ' Practice';
  else
    v_title := 'NTS NAT-IE ' || coalesce(v_subject.name,'Subject') || ' Practice';
  end if;

  if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'user_not_found'; end if;
  insert into public.profiles(user_id) values(p_user_id) on conflict(user_id) do nothing;
  perform pg_advisory_xact_lock(hashtextextended('practice_test:' || p_subject_key,0));
  select t.id into v_test_id from public.tests t
   where t.test_type='practice' and t.status='published' and t.title=v_title
   order by t.created_at limit 1;
  if v_test_id is null then
    insert into public.tests(title,description,test_type,status)
    values(v_title,'Untimed practice session','practice','published') returning id into v_test_id;
  end if;
  insert into public.attempts(user_id,test_id) values(p_user_id,v_test_id) returning id into v_attempt_id;
  return v_attempt_id;
end;
$$;
revoke all on function public.start_practice_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.start_practice_attempt(uuid,text) to service_role;

create or replace function public.start_mock_attempt(p_user_id uuid,p_test_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_test public.tests%rowtype;
  v_config public.mock_test_configs%rowtype;
  v_attempt_id uuid;
  v_total integer := 0;
  v_available integer;
  v_subject_id uuid;
  v_subject record;
begin
  select * into v_test from public.tests t
   where t.id=p_test_id and t.test_type='mock' and t.status='published';
  if not found then raise exception 'mock_not_available'; end if;
  select * into v_config from public.mock_test_configs c where c.test_id=p_test_id;
  if not found then raise exception 'mock_not_configured'; end if;
  if v_test.duration_seconds is null or v_test.duration_seconds<60 then raise exception 'invalid_duration'; end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'user_not_found'; end if;
  insert into public.profiles(user_id) values(p_user_id) on conflict(user_id) do nothing;
  perform pg_advisory_xact_lock(hashtextextended('mock:' || p_user_id::text || ':' || p_test_id::text,0));

  select a.id into v_attempt_id from public.attempts a
   where a.user_id=p_user_id and a.test_id=p_test_id and a.status='in_progress' and a.expires_at<=now()
   order by a.started_at desc limit 1 for update;
  if v_attempt_id is not null then
    perform public.submit_mock_attempt(v_attempt_id,p_user_id,true);
    v_attempt_id := null;
  end if;
  select a.id into v_attempt_id from public.attempts a
   where a.user_id=p_user_id and a.test_id=p_test_id and a.status='in_progress' and a.expires_at>now()
   order by a.started_at desc limit 1 for update;
  if v_attempt_id is not null then return v_attempt_id; end if;

  if jsonb_typeof(v_config.question_distribution)<>'object'
     or (select count(*) from jsonb_each_text(v_config.question_distribution))=0 then
    raise exception 'invalid_distribution';
  end if;
  for v_subject in select key,value from jsonb_each_text(v_config.question_distribution) loop
    if v_subject.value !~ '^[1-9][0-9]*$' then raise exception 'invalid_distribution'; end if;
    select s.id into v_subject_id from public.subjects s
     where s.subject_key=v_subject.key and s.exam_key=v_config.exam_key
       and s.category_key is not distinct from v_config.category_key;
    if v_subject_id is null then raise exception 'invalid_distribution'; end if;
    select count(*) into v_available from public.questions q where q.subject_id=v_subject_id and q.is_active;
    if v_available<v_subject.value::integer then
      raise exception 'insufficient_coverage:%:%:%',v_subject.key,v_available,v_subject.value;
    end if;
    v_total := v_total + v_subject.value::integer;
  end loop;
  if v_total<1 or v_total>500 then raise exception 'invalid_distribution'; end if;

  insert into public.attempts(user_id,test_id,status,started_at,expires_at)
    values(p_user_id,p_test_id,'in_progress',now(),now()+make_interval(secs=>v_test.duration_seconds))
    returning id into v_attempt_id;
  for v_subject in select key,value from jsonb_each_text(v_config.question_distribution) loop
    v_subject_id := null;
    select s.id into v_subject_id from public.subjects s
     where s.subject_key=v_subject.key and s.exam_key=v_config.exam_key
       and s.category_key is not distinct from v_config.category_key;
    if v_subject_id is null then raise exception 'invalid_distribution'; end if;
    insert into public.mock_attempt_questions(attempt_id,question_id,position)
    select v_attempt_id,selected.id,
      (select count(*) from public.mock_attempt_questions x where x.attempt_id=v_attempt_id)+row_number() over ()
      from (
        select q.id from public.questions q where q.subject_id=v_subject_id and q.is_active
        order by random() limit v_subject.value::integer
      ) selected;
  end loop;
  update public.mock_attempt_questions set position=position+1000000 where attempt_id=v_attempt_id;
  with randomized as (
    select question_id,row_number() over(order by random())::integer as new_position
      from public.mock_attempt_questions where attempt_id=v_attempt_id
  )
  update public.mock_attempt_questions mq set position=r.new_position from randomized r
   where mq.attempt_id=v_attempt_id and mq.question_id=r.question_id;
  return v_attempt_id;
end;
$$;
revoke all on function public.start_mock_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_mock_attempt(uuid,uuid) to service_role;

commit;

