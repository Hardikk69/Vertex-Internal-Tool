-- Admins: team members who can read everyone's time logs (Reports page).
-- Read-only: admins still only edit/delete their own logs. Set is_admin from the SQL editor;
-- there's no update policy on users, so nobody can promote themselves.

alter table public.users add column is_admin boolean not null default false;
alter table public.users add constraint users_admin_is_team check (not is_admin or role = 'team');

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select is_admin from public.users where id = auth.uid()), false) $$;

-- permissive policies OR together: admins read all rows, writes still go through "own rows (team)"
create policy "time_logs: admin reads all" on public.time_logs for select to authenticated
using ((select public.is_admin()));
