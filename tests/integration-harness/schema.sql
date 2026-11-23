-- Faithful recreation of the user's Supabase schema (from their introspection JSON)
-- plus the minimum surrounding pieces (roles, auth.users/auth.uid, subjects, questions).
create role anon nologin; create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator login noinherit password 'pw';
grant anon, authenticated, service_role to authenticator;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- context tables the app reads
create table public.subjects (id uuid primary key default gen_random_uuid(), code text unique not null, name text);
create table public.syllabus_nodes (id uuid primary key default gen_random_uuid(), subject_id uuid references public.subjects(id), node_type text, source_path text);
-- questions: post-migration shape (columns the app/functions use); locked down like 20261123000200
create table public.questions (
  id uuid primary key default gen_random_uuid(), subject_id uuid not null, syllabus_node_id uuid, unit_id uuid, topic_id uuid, slo_node_id uuid,
  slo_reference text not null, question text not null, options jsonb not null, correct_answer_index int not null,
  explanation text not null, difficulty text not null, is_active boolean not null default true, created_at timestamptz not null default now());
alter table public.questions enable row level security;
revoke all on public.questions from public, anon, authenticated;
grant select (id, subject_id, syllabus_node_id, unit_id, topic_id, slo_node_id, slo_reference, question, options, difficulty, created_at) on public.questions to authenticated;
grant all on public.questions to service_role;
grant all on public.subjects, public.syllabus_nodes to service_role; grant select on public.subjects, public.syllabus_nodes to anon, authenticated;

-- ===== user's tables, exactly as introspected =====
create table public.profiles (
  user_id uuid not null, display_name text, role text not null default 'user', created_at timestamptz not null default now(),
  constraint profiles_pkey primary key (user_id),
  constraint profiles_role_check check (role = any (array['user','admin'])),
  constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade);
create table public.tests (
  id uuid not null default gen_random_uuid(), title text not null, description text, test_type text not null,
  duration_seconds integer, status text not null default 'draft', created_by uuid, created_at timestamptz not null default now(),
  constraint tests_pkey primary key (id),
  constraint tests_created_by_fkey foreign key (created_by) references public.profiles(user_id),
  constraint tests_duration_seconds_check check (duration_seconds is null or duration_seconds > 0),
  constraint tests_status_check check (status = any (array['draft','published','archived'])),
  constraint tests_test_type_check check (test_type = any (array['practice','mock'])));
create table public.attempts (
  id uuid not null default gen_random_uuid(), user_id uuid not null, test_id uuid not null, status text not null default 'in_progress',
  started_at timestamptz not null default now(), expires_at timestamptz, submitted_at timestamptz, score numeric, total_points numeric,
  created_at timestamptz not null default now(),
  constraint attempts_pkey primary key (id),
  constraint attempts_status_check check (status = any (array['in_progress','submitted','expired'])),
  constraint attempts_test_id_fkey foreign key (test_id) references public.tests(id) on delete restrict,
  constraint attempts_user_id_fkey foreign key (user_id) references public.profiles(user_id) on delete cascade);
create index attempts_user_idx on public.attempts (user_id);
create index attempts_test_idx on public.attempts (test_id);
create table public.attempt_answers (
  id uuid not null default gen_random_uuid(), attempt_id uuid not null, question_id uuid not null,
  selected_option_index integer, is_correct boolean, answered_at timestamptz,
  constraint attempt_answers_pkey primary key (id),
  constraint attempt_answers_attempt_id_question_id_key unique (attempt_id, question_id),
  constraint attempt_answers_attempt_id_fkey foreign key (attempt_id) references public.attempts(id) on delete cascade,
  constraint attempt_answers_question_id_fkey foreign key (question_id) references public.questions(id) on delete restrict);

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.tests enable row level security;
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = user_id);
create policy "Read own attempts" on public.attempts for select to authenticated using (auth.uid() = user_id);
create policy "Read own attempt answers" on public.attempt_answers for select to authenticated using (exists (select 1 from public.attempts where attempts.id = attempt_answers.attempt_id and attempts.user_id = auth.uid()));
create policy "Read published tests" on public.tests for select to anon, authenticated using (status = 'published');
-- the broad grants exactly as the user's DB has them
grant all on public.profiles, public.attempts, public.attempt_answers, public.tests to anon, authenticated, service_role;
