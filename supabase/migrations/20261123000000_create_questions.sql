begin;

-- 0. Verify the supplied legacy schema (incl. the composite legacy FK) and inspect node types.
do $$
declare
  required_missing text[];
  q_node_att smallint;
  q_subject_att smallint;
  ref_id_att smallint;
  ref_subject_att smallint;
  fk_total integer;
  fk_correct integer;
  fk_definition text;
  node_type_row record;
begin
  if to_regclass('public.questions') is null then
    raise exception 'Expected existing public.questions; this migration never creates it';
  end if;

  select array_agg(req.column_name order by req.column_name)
    into required_missing
    from (values
      ('id'), ('subject_id'), ('syllabus_node_id'), ('question_text'),
      ('options'), ('correct_answer_index'), ('explanation'), ('difficulty'),
      ('source_name'), ('source_url'), ('content_hash'), ('status'), ('created_at')
    ) as req(column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'questions'
        and c.column_name = req.column_name
   );
  if required_missing is not null then
    raise exception 'Legacy questions schema mismatch; missing columns: %', required_missing;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'questions'
       and ((column_name in ('id','subject_id','syllabus_node_id') and data_type <> 'uuid')
         or (column_name in ('question_text','explanation','difficulty','source_name','source_url','content_hash')
             and data_type not in ('text','character varying')))
  ) then
    raise exception 'Legacy questions schema has an unexpected column type';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'questions'
       and (
         (column_name in ('unit_id','topic_id','slo_node_id') and data_type <> 'uuid')
         or (column_name in ('question','slo_reference','source_type','source_reference','question_hash')
             and data_type not in ('text','character varying'))
         or (column_name = 'is_active' and data_type <> 'boolean')
       )
  ) then
    raise exception 'An existing normalized questions column has an unexpected type';
  end if;

  if to_regclass('public.subjects') is null or to_regclass('public.syllabus_nodes') is null then
    raise exception 'Expected public.subjects and public.syllabus_nodes';
  end if;

  -- Existing legacy FK is composite:
  --   FOREIGN KEY (syllabus_node_id, subject_id)
  --   REFERENCES public.syllabus_nodes (id, subject_id)
  -- Verify it by attnum/conkey/confkey (order-sensitive). Never drop or recreate it.
  select attnum into q_node_att from pg_attribute
   where attrelid = 'public.questions'::regclass
     and attname = 'syllabus_node_id' and not attisdropped;
  select attnum into q_subject_att from pg_attribute
   where attrelid = 'public.questions'::regclass
     and attname = 'subject_id' and not attisdropped;
  select attnum into ref_id_att from pg_attribute
   where attrelid = 'public.syllabus_nodes'::regclass
     and attname = 'id' and not attisdropped;
  select attnum into ref_subject_att from pg_attribute
   where attrelid = 'public.syllabus_nodes'::regclass
     and attname = 'subject_id' and not attisdropped;

  if q_node_att is null or q_subject_att is null
     or ref_id_att is null or ref_subject_att is null then
    raise exception 'Could not resolve attnums for the syllabus_node_id/subject_id composite FK check';
  end if;

  select count(*),
         count(*) filter (
           where c.confrelid = 'public.syllabus_nodes'::regclass
             and c.conkey  = array[q_node_att, q_subject_att]::smallint[]
             and c.confkey = array[ref_id_att, ref_subject_att]::smallint[]
         )
    into fk_total, fk_correct
    from pg_constraint c
   where c.conrelid = 'public.questions'::regclass
     and c.contype = 'f'
     and q_node_att = any(c.conkey);

  if fk_total <> 1 or fk_correct <> 1 then
    raise exception 'Expected exactly one composite FK questions(syllabus_node_id, subject_id) -> syllabus_nodes(id, subject_id); found % FK(s) on syllabus_node_id, % matching',
      fk_total, fk_correct;
  end if;

  select pg_get_constraintdef(c.oid) into fk_definition
    from pg_constraint c
   where c.conrelid = 'public.questions'::regclass
     and c.contype = 'f'
     and c.conkey  = array[q_node_att, q_subject_att]::smallint[]
     and c.confkey = array[ref_id_att, ref_subject_att]::smallint[];
  raise notice 'Existing composite syllabus_node_id FK (preserved): %', fk_definition;

  for node_type_row in
    select n.node_type::text as node_type, count(*) as question_count
      from public.questions q
      join public.syllabus_nodes n on n.id = q.syllabus_node_id
     group by n.node_type::text
     order by n.node_type::text
  loop
    raise notice 'syllabus_node_id references node_type %, questions %',
      node_type_row.node_type, node_type_row.question_count;
  end loop;

  for node_type_row in
    select coalesce(q.status::text, '<null>') as node_type, count(*) as question_count
      from public.questions q
     group by q.status::text
     order by q.status::text
  loop
    raise notice 'Legacy status % maps to is_active=% for % questions',
      node_type_row.node_type,
      lower(node_type_row.node_type) in ('active', 'approved', 'published', 'live', 'enabled'),
      node_type_row.question_count;
  end loop;
end
$$;

-- Ensure the columns used by the resolver exist. These are the inferred
-- syllabus_nodes/subjects fields written by scripts/import-syllabus.ts.
do $$
declare
  missing text[];
begin
  select array_agg(req.table_name || '.' || req.column_name order by req.table_name, req.column_name)
    into missing
    from (values
      ('subjects','id'), ('subjects','code'),
      ('syllabus_nodes','id'), ('syllabus_nodes','subject_id'),
      ('syllabus_nodes','parent_id'), ('syllabus_nodes','node_type'),
      ('syllabus_nodes','source_identifier'), ('syllabus_nodes','source_path')
    ) as req(table_name, column_name)
   where not exists (
     select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = req.table_name
        and c.column_name = req.column_name
   );
  if missing is not null then
    raise exception 'Missing syllabus resolver columns: %', missing;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'subjects' and column_name = 'id')
         or (table_name = 'syllabus_nodes' and column_name in ('id','subject_id','parent_id')))
       and data_type <> 'uuid'
  ) then
    raise exception 'Expected UUID subjects/syllabus_nodes identifiers';
  end if;
end
$$;

-- 1. Add only new normalized fields. The old fields are retained.
alter table public.questions add column if not exists question text;
alter table public.questions add column if not exists unit_id uuid;
alter table public.questions add column if not exists topic_id uuid;
alter table public.questions add column if not exists slo_reference text;
alter table public.questions add column if not exists slo_node_id uuid;
alter table public.questions add column if not exists source_type text;
alter table public.questions add column if not exists source_reference text;
alter table public.questions add column if not exists question_hash text;
alter table public.questions add column if not exists is_active boolean;

-- Convert canonical dataset paths into database UUID references. The path
-- columns in syllabus_nodes use the subject UUID prefix; callers use the
-- canonical subject key (biology/unit/3/topic/...).
create or replace function public.resolve_question_syllabus_refs(
  p_subject_key text,
  p_unit_path text,
  p_topic_path text,
  p_slo text
)
returns table (subject_id uuid, unit_id uuid, topic_id uuid, slo_node_id uuid)
language sql
stable
set search_path = ''
as $$
  with subj as (
    select s.id from public.subjects s
     where s.code = case p_subject_key
                      when 'biology' then 'BIO'
                      when 'chemistry' then 'CHEM'
                      when 'physics' then 'PHY'
                      when 'english' then 'ENG'
                      when 'logical_reasoning' then 'LR'
                    end
  )
  select subj.id, u.id, t.id, l.id
    from subj
    join public.syllabus_nodes u
      on u.subject_id = subj.id and u.node_type::text = 'unit'
     and u.source_path = subj.id::text || substr(p_unit_path, length(p_subject_key) + 1)
    join public.syllabus_nodes t
      on t.subject_id = subj.id and t.node_type::text = 'topic'
     and t.parent_id = u.id
     and t.source_path = subj.id::text || substr(p_topic_path, length(p_subject_key) + 1)
    join public.syllabus_nodes l
      on l.subject_id = subj.id and l.node_type::text = 'slo'
     and l.parent_id = t.id and l.source_identifier = p_slo
   where p_unit_path like p_subject_key || '/unit/%'
     and p_topic_path like p_unit_path || '/topic/%';
$$;

create temporary table questions_schema_backfill_map on commit drop as
with candidate_paths as (
  select q.id as question_id,
         q.subject_id,
         sb.code,
         q.syllabus_node_id,
         legacy.node_type::text as legacy_node_type,
         u.source_path as unit_source_path,
         t.source_path as topic_source_path,
         s.source_identifier as slo_reference,
         case sb.code
           when 'BIO' then 'biology'
           when 'CHEM' then 'chemistry'
           when 'PHY' then 'physics'
           when 'ENG' then 'english'
           when 'LR' then 'logical_reasoning'
         end as subject_key
    from public.questions q
    join public.subjects sb on sb.id = q.subject_id
    join public.syllabus_nodes legacy on legacy.id = q.syllabus_node_id
    join public.syllabus_nodes u
      on u.subject_id = q.subject_id and u.node_type::text = 'unit'
    join public.syllabus_nodes t
      on t.subject_id = q.subject_id and t.node_type::text = 'topic'
     and t.parent_id = u.id
    join public.syllabus_nodes s
      on s.subject_id = q.subject_id and s.node_type::text = 'slo'
     and s.parent_id = t.id
   where (legacy.node_type::text = 'unit' and legacy.id = u.id)
      or (legacy.node_type::text = 'topic' and legacy.id = t.id)
      or (legacy.node_type::text = 'slo' and legacy.id = s.id)
),
resolved as (
  select c.question_id, r.unit_id, r.topic_id, r.slo_node_id, c.slo_reference
    from candidate_paths c
    cross join lateral public.resolve_question_syllabus_refs(
      c.subject_key,
      c.subject_key || substr(c.unit_source_path, length(c.subject_id::text) + 1),
      c.subject_key || substr(c.topic_source_path, length(c.subject_id::text) + 1),
      c.slo_reference
    ) r
   where r.subject_id = c.subject_id
)
select question_id, unit_id, topic_id, slo_node_id, slo_reference
  from resolved;

do $$
begin
  if exists (
    select q.id
      from public.questions q
      left join pg_temp.questions_schema_backfill_map m on m.question_id = q.id
     group by q.id
    having count(m.question_id) <> 1
  ) then
    raise exception 'Could not resolve exactly one canonical unit/topic/SLO path for every legacy syllabus_node_id; inspect the node types and ambiguous descendants';
  end if;

  if exists (
    select 1
      from public.questions q
      join pg_temp.questions_schema_backfill_map m on m.question_id = q.id
     where (q.unit_id is not null and q.unit_id is distinct from m.unit_id)
        or (q.topic_id is not null and q.topic_id is distinct from m.topic_id)
        or (q.slo_node_id is not null and q.slo_node_id is distinct from m.slo_node_id)
        or (q.slo_reference is not null and q.slo_reference is distinct from m.slo_reference)
  ) then
    raise exception 'Existing normalized syllabus fields conflict with the canonical legacy-node mapping';
  end if;

  if exists (
    select 1 from public.questions q
     where coalesce(nullif(btrim(q.question), ''), nullif(btrim(q.question_text::text), '')) is null
  ) then
    raise exception 'A question has neither question nor non-empty question_text';
  end if;
end
$$;

-- Backfill question from question_text and preserve legacy source attribution.
-- "legacy" is deliberate: source_name/source_url alone cannot establish
-- whether the question itself was independently authored or copied.
update public.questions q
   set question = coalesce(nullif(btrim(q.question), ''), q.question_text::text),
       unit_id = coalesce(q.unit_id, m.unit_id),
       topic_id = coalesce(q.topic_id, m.topic_id),
       slo_node_id = coalesce(q.slo_node_id, m.slo_node_id),
       slo_reference = coalesce(q.slo_reference, m.slo_reference),
       source_type = coalesce(nullif(btrim(q.source_type), ''), 'legacy'),
       question_hash = coalesce(
         nullif(btrim(q.question_hash), ''),
         md5(lower(regexp_replace(btrim(coalesce(nullif(btrim(q.question), ''), q.question_text::text)), '\s+', ' ', 'g')))
       ),
       is_active = coalesce(q.is_active,
         lower(coalesce(q.status::text, '')) in ('active', 'approved', 'published', 'live', 'enabled')),
       source_reference = coalesce(
         nullif(btrim(q.source_reference), ''),
         nullif(concat_ws(' | ',
           nullif(btrim(q.source_name::text), ''),
           nullif(btrim(q.source_url::text), '')
         ), ''),
         'Legacy provenance not recorded'
       )
  from pg_temp.questions_schema_backfill_map m
 where m.question_id = q.id;

alter table public.questions alter column question set not null;
alter table public.questions alter column unit_id set not null;
alter table public.questions alter column topic_id set not null;
alter table public.questions alter column slo_node_id set not null;
alter table public.questions alter column slo_reference set not null;
alter table public.questions alter column source_type set not null;
alter table public.questions alter column source_reference set not null;
alter table public.questions alter column question_hash set not null;
alter table public.questions alter column is_active set default true;
alter table public.questions alter column is_active set not null;

-- content_hash is retained unchanged; question_hash follows the normalized
-- question-text definition used by the intended importer.
create unique index if not exists questions_question_hash_key
  on public.questions (question_hash);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass and conname = 'questions_question_not_blank') then
    alter table public.questions add constraint questions_question_not_blank check (btrim(question) <> '') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass and conname = 'questions_slo_reference_not_blank') then
    alter table public.questions add constraint questions_slo_reference_not_blank check (btrim(slo_reference) <> '') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass and conname = 'questions_source_type_not_blank') then
    alter table public.questions add constraint questions_source_type_not_blank check (btrim(source_type) <> '') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.questions'::regclass and conname = 'questions_source_reference_not_blank') then
    alter table public.questions add constraint questions_source_reference_not_blank check (btrim(source_reference) <> '') not valid;
  end if;
  alter table public.questions validate constraint questions_question_not_blank;
  alter table public.questions validate constraint questions_slo_reference_not_blank;
  alter table public.questions validate constraint questions_source_type_not_blank;
  alter table public.questions validate constraint questions_source_reference_not_blank;
end
$$;

-- 2. Add the missing syllabus FKs without replacing any existing constraint.
do $$
declare
  ref record;
  source_att smallint;
  target_att smallint;
  existing_count integer;
  all_correct boolean;
begin
  for ref in
    select * from (values ('unit_id'), ('topic_id'), ('slo_node_id')) as v(source_column)
  loop
    select attnum into source_att from pg_attribute
     where attrelid = 'public.questions'::regclass
       and attname = ref.source_column and not attisdropped;
    select attnum into target_att from pg_attribute
     where attrelid = 'public.syllabus_nodes'::regclass
       and attname = 'id' and not attisdropped;

    select count(*), coalesce(bool_and(
             c.confrelid = 'public.syllabus_nodes'::regclass
             and c.confkey = array[target_att]::smallint[]
           ), false)
      into existing_count, all_correct
      from pg_constraint c
     where c.conrelid = 'public.questions'::regclass and c.contype = 'f'
       and c.conkey = array[source_att]::smallint[];

    if existing_count > 0 and not all_correct then
      raise exception 'Existing FK on questions.% points to a different key; it was not changed', ref.source_column;
    elsif existing_count = 0 then
      execute format(
        'alter table public.questions add constraint %I foreign key (%I) references public.syllabus_nodes(id) on delete restrict',
        'questions_' || ref.source_column || '_fkey', ref.source_column
      );
    end if;
  end loop;
end
$$;

-- Validate all mapped rows and guard future writes against wrong node types,
-- subjects, or parent/child relationships.
do $$
begin
  if exists (
    select 1
      from public.questions q
      left join public.syllabus_nodes u on u.id = q.unit_id
      left join public.syllabus_nodes t on t.id = q.topic_id
      left join public.syllabus_nodes s on s.id = q.slo_node_id
     where u.id is null or t.id is null or s.id is null
        or u.node_type::text is distinct from 'unit'
        or t.node_type::text is distinct from 'topic'
        or s.node_type::text is distinct from 'slo'
        or u.subject_id is distinct from q.subject_id
        or t.subject_id is distinct from q.subject_id
        or s.subject_id is distinct from q.subject_id
        or t.parent_id is distinct from u.id
        or s.parent_id is distinct from t.id
        or s.source_identifier is distinct from q.slo_reference
  ) then
    raise exception 'Mapped questions rows do not match the syllabus hierarchy';
  end if;
end
$$;

create or replace function public.questions_validate_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  u public.syllabus_nodes%rowtype;
  t public.syllabus_nodes%rowtype;
  s public.syllabus_nodes%rowtype;
begin
  select * into u from public.syllabus_nodes where id = new.unit_id;
  select * into t from public.syllabus_nodes where id = new.topic_id;
  select * into s from public.syllabus_nodes where id = new.slo_node_id;

  if u.id is null or u.node_type::text <> 'unit' then
    raise exception 'unit_id must reference a unit node';
  end if;
  if t.id is null or t.node_type::text <> 'topic' then
    raise exception 'topic_id must reference a topic node';
  end if;
  if s.id is null or s.node_type::text <> 'slo' then
    raise exception 'slo_node_id must reference an slo node';
  end if;
  if u.subject_id is distinct from new.subject_id
     or t.subject_id is distinct from new.subject_id
     or s.subject_id is distinct from new.subject_id then
    raise exception 'Syllabus nodes must belong to questions.subject_id';
  end if;
  if t.parent_id is distinct from u.id or s.parent_id is distinct from t.id then
    raise exception 'Syllabus nodes do not form a unit/topic/SLO parent chain';
  end if;
  if s.source_identifier is distinct from new.slo_reference then
    raise exception 'slo_reference does not match the SLO node source_identifier';
  end if;
  if tg_op = 'INSERT'
     or new.question is distinct from old.question
     or new.question_hash is null
     or btrim(new.question_hash) = '' then
    new.question_hash := md5(lower(regexp_replace(btrim(new.question), '\s+', ' ', 'g')));
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.is_active := lower(coalesce(new.status::text, ''))
      in ('active', 'approved', 'published', 'live', 'enabled');
  elsif new.is_active is null then
    new.is_active := true;
  end if;
  return new;
end
$$;

do $$
declare
  existing_function oid;
begin
  select tgfoid into existing_function from pg_trigger
   where tgrelid = 'public.questions'::regclass
     and tgname = 'questions_validate_hierarchy' and not tgisinternal;
  if existing_function is null then
    execute 'create trigger questions_validate_hierarchy
      before insert or update of question, status, subject_id, unit_id, topic_id, slo_node_id, slo_reference
      on public.questions for each row
      execute function public.questions_validate_hierarchy()';
  elsif existing_function <> 'public.questions_validate_hierarchy()'::regprocedure::oid then
    raise exception 'A trigger named questions_validate_hierarchy exists with a different function';
  end if;
end
$$;

create index if not exists questions_subject_id_idx on public.questions (subject_id);
create index if not exists questions_unit_id_idx on public.questions (unit_id);
create index if not exists questions_topic_id_idx on public.questions (topic_id);
create index if not exists questions_slo_node_id_idx on public.questions (slo_node_id);
create index if not exists questions_active_selection_idx
  on public.questions (subject_id, difficulty) where is_active;


revoke all on function public.resolve_question_syllabus_refs(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_question_syllabus_refs(text, text, text, text)
  to service_role;

commit;

