-- Client housekeeping, retainer hours, thread attachments, unread tracking, to-dos per client.

-- ---------------------------------------------------------------- clients: rename, archive, retainer
-- Clients can't be deleted (time logs point at them), so they're archived instead.
alter table public.clients
  add column archived boolean not null default false,
  add column retainer_hours numeric check (retainer_hours > 0); -- per month; null = no retainer

create policy "clients: edit (team)" on public.clients for update to authenticated
using ((select public.my_role()) = 'team')
with check ((select public.my_role()) = 'team');

-- Hours logged on a client since a point in time. Clients can't read time_logs, so this is
-- how the portal shows "hours used": a total only, and only for your own client.
create function public.hours_logged(p_client uuid, p_since timestamptz) returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(extract(epoch from sum(clock_out - clock_in)) / 3600, 0)
  from public.time_logs
  where client_id = p_client and clock_out is not null and clock_in >= p_since
    and (public.my_role() = 'team' or p_client = public.my_client_id())
$$;

-- ---------------------------------------------------------------- attachments
-- One file per message, stored in the private "attachments" bucket under <client_id>/,
-- which is what the storage policies below scope on. Like comments, files are append-only.
alter table public.project_comments
  alter column comment set default '',
  add column attachment_path text,
  add column attachment_name text,
  add constraint attachment_in_client_folder
    check (attachment_path is null or attachment_path like client_id::text || '/%'),
  add constraint attachment_named check ((attachment_path is null) = (attachment_name is null)),
  drop constraint project_comments_comment_check,
  add constraint comment_or_attachment check (length(trim(comment)) > 0 or attachment_path is not null);

insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);

create policy "attachments: read" on storage.objects for select to authenticated
using (
  bucket_id = 'attachments'
  and ((select public.my_role()) = 'team' or (storage.foldername(name))[1] = (select public.my_client_id())::text)
);

create policy "attachments: upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'attachments'
  and ((select public.my_role()) = 'team' or (storage.foldername(name))[1] = (select public.my_client_id())::text)
);

-- ---------------------------------------------------------------- unread threads
-- How far each person has read each thread; the Clients page shows the difference as a badge.
create table public.thread_reads (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  last_read_at timestamptz not null,
  primary key (user_id, client_id)
);
alter table public.thread_reads enable row level security;

create policy "thread_reads: own rows" on public.thread_reads for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Messages from others you haven't read yet, per thread. Security invoker: RLS on
-- project_comments keeps it to the threads you can see.
create function public.unread_counts() returns table (client_id uuid, unread bigint)
language sql stable set search_path = ''
as $$
  select c.client_id, count(*)
  from public.project_comments c
  left join public.thread_reads r on r.client_id = c.client_id and r.user_id = auth.uid()
  where c.author_id <> auth.uid() and (r.last_read_at is null or c.created_at > r.last_read_at)
  group by c.client_id
$$;

-- ---------------------------------------------------------------- to-dos per client
alter table public.todos add column client_id uuid references public.clients (id);
