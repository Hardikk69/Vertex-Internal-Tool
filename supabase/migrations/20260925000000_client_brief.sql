-- Onboarding brief: one questionnaire per client, filled in the portal by the client
-- (or by the team on their behalf). The questions themselves live in src/lib/brief.ts;
-- answers are stored as a jsonb map of question id -> answer.

create table public.client_briefs (
  client_id uuid primary key references public.clients (id) on delete cascade,
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  submitted_at timestamptz, -- set once every required question is answered
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.users (id)
);
alter table public.client_briefs enable row level security;

-- who touched it last is recorded here, not by the client, so it can't be faked
create function public.touch_client_brief() returns trigger
language plpgsql security definer set search_path = ''
as $$ begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;

create trigger client_briefs_touch before update on public.client_briefs
for each row execute function public.touch_client_brief();

-- the team sees every brief, a client only its own. No delete policy: briefs are edited, not removed.
create policy "briefs: read" on public.client_briefs for select to authenticated
using ((select public.my_role()) = 'team' or client_id = (select public.my_client_id()));

create policy "briefs: start" on public.client_briefs for insert to authenticated
with check ((select public.my_role()) = 'team' or client_id = (select public.my_client_id()));

create policy "briefs: edit" on public.client_briefs for update to authenticated
using ((select public.my_role()) = 'team' or client_id = (select public.my_client_id()))
with check ((select public.my_role()) = 'team' or client_id = (select public.my_client_id()));
