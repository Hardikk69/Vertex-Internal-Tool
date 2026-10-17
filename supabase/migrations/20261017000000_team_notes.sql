-- Team Notes: shared notes visible to the whole team, optionally tagged to a client.
-- Notes are pinnable so important ones stay on top.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  client_id uuid references public.clients (id),
  title text not null check (length(trim(title)) > 0),
  body text not null default '',
  pinned boolean not null default false,
  color text not null default 'default' check (color in ('default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_team on public.notes (created_at desc);

alter table public.notes enable row level security;

-- Team members can read all notes (shared knowledge base)
create policy "notes: read (team)" on public.notes for select to authenticated
using ((select public.my_role()) = 'team');

-- Team members can create notes
create policy "notes: create (team)" on public.notes for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (select public.my_role()) = 'team'
);

-- Authors can update their own notes, admins can update any
create policy "notes: update" on public.notes for update to authenticated
using (
  (author_id = (select auth.uid()) and (select public.my_role()) = 'team')
  or (select public.is_admin())
)
with check (
  (author_id = (select auth.uid()) and (select public.my_role()) = 'team')
  or (select public.is_admin())
);

-- Authors can delete their own notes, admins can delete any
create policy "notes: delete" on public.notes for delete to authenticated
using (
  (author_id = (select auth.uid()) and (select public.my_role()) = 'team')
  or (select public.is_admin())
);
