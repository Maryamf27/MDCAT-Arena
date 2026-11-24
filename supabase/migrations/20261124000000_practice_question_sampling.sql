begin;

create or replace function public.sample_practice_questions(
  p_subject_id  uuid    default null,
  p_unit_id     uuid    default null,
  p_topic_id    uuid    default null,
  p_slo_node_id uuid    default null,
  p_difficulty  text    default null,  -- database vocabulary: easy | moderate | difficult
  p_limit       integer default 10
)
returns table (
  id               uuid,
  subject_id       uuid,
  syllabus_node_id uuid,
  unit_id          uuid,
  topic_id         uuid,
  slo_node_id      uuid,
  slo_reference    text,
  question         text,
  options          jsonb,
  difficulty       text,
  created_at       timestamptz
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select q.id,
         q.subject_id,
         q.syllabus_node_id,
         q.unit_id,
         q.topic_id,
         q.slo_node_id,
         q.slo_reference::text,
         q.question::text,
         to_jsonb(q.options),
         q.difficulty::text,
         q.created_at
    from public.questions q
   where q.is_active
     and (p_subject_id  is null or q.subject_id  = p_subject_id)
     and (p_unit_id     is null or q.unit_id     = p_unit_id)
     and (p_topic_id    is null or q.topic_id    = p_topic_id)
     and (p_slo_node_id is null or q.slo_node_id = p_slo_node_id)
     and (p_difficulty  is null or q.difficulty  = p_difficulty)
   order by random()
   limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

revoke all on function public.sample_practice_questions(uuid, uuid, uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.sample_practice_questions(uuid, uuid, uuid, uuid, text, integer)
  to service_role;

commit;
