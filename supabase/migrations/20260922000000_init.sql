-- VMH tool: schema + row level security.
-- Roles: 'team' (internal staff) and 'client' (sees only its own project thread).
-- A signed-in auth user with no row in public.users gets no data at all (fail closed).

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('team', 'client')),
  name text not null,
  client_id uuid references public.clients (id),
  -- clients must be linked to a client record, team members must not be
  check ((role = 'client') = (client_id is not null))
);

-- Policy helpers. SECURITY DEFINER so policies can read public.users without recursing into its own RLS.
create function public.my_role() returns text
language sql stable security definer set search_path = ''
as $$ select role from public.users where id = auth.uid() $$;

create function public.my_client_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select client_id from public.users where id = auth.uid() $$;

create table public.time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id),
  client_id uuid not null references public.clients (id),
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  total_duration interval generated always as (clock_out - clock_in) stored,
  work_description text,
  -- a finished log needs a sane end time and a description
  check (clock_out is null or (clock_out >= clock_in and coalesce(trim(work_description), '') <> ''))
);
-- at most one running timer per user
create unique index time_logs_one_active on public.time_logs (user_id) where clock_out is null;
create index time_logs_user_clock_in on public.time_logs (user_id, clock_in desc);

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  done boolean not null default false,
  due_date date not null default current_date,
  created_at timestamptz not null default now()
);
create index todos_user_due on public.todos (user_id, due_date);

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.users (id),
  author_role text not null default public.my_role() check (author_role in ('team', 'client')),
  comment text not null check (length(trim(comment)) > 0),
  created_at timestamptz not null default now()
);
create index project_comments_client_created on public.project_comments (client_id, created_at);

-- ---------------------------------------------------------------- RLS

alter table public.clients enable row level security;
alter table public.users enable row level security;
alter table public.time_logs enable row level security;
alter table public.todos enable row level security;
alter table public.project_comments enable row level security;

-- No insert/update/delete policies on users or clients: those are managed from the
-- Supabase dashboard / SQL editor, so nobody can change their own role or client link.

-- users: yourself; team sees everyone; a client also sees team members (reply authors)
-- and other logins on its own client.
create policy "users: read" on public.users for select to authenticated
using (
  id = (select auth.uid())
  or (select public.my_role()) = 'team'
  or (role = 'team' and (select public.my_role()) is not null)
  or client_id = (select public.my_client_id())
);

create policy "clients: read" on public.clients for select to authenticated
using ((select public.my_role()) = 'team' or id = (select public.my_client_id()));

-- time_logs and todos: team only, and only your own rows.
create policy "time_logs: own rows (team)" on public.time_logs for all to authenticated
using (user_id = (select auth.uid()) and (select public.my_role()) = 'team')
with check (user_id = (select auth.uid()) and (select public.my_role()) = 'team');

create policy "todos: own rows (team)" on public.todos for all to authenticated
using (user_id = (select auth.uid()) and (select public.my_role()) = 'team')
with check (user_id = (select auth.uid()) and (select public.my_role()) = 'team');

-- project_comments: team reads/posts on every thread, a client only on its own.
-- Comments are append-only (no update/delete policies).
create policy "comments: read" on public.project_comments for select to authenticated
using ((select public.my_role()) = 'team' or client_id = (select public.my_client_id()));

create policy "comments: post" on public.project_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and author_role = (select public.my_role())
  and ((select public.my_role()) = 'team' or client_id = (select public.my_client_id()))
);

-- Realtime for comment threads (Realtime applies the policies above per subscriber).
alter publication supabase_realtime add table public.project_comments;
