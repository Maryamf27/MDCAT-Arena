begin;

alter table public.questions enable row level security;

revoke all on table public.questions from public, anon, authenticated;

-- Answer-free columns only, signed-in users only.
grant select (
  id, subject_id, syllabus_node_id, unit_id, topic_id, slo_node_id,
  slo_reference, question, question_text, options, difficulty, created_at
) on public.questions to authenticated;

grant all on table public.questions to service_role;

commit;
