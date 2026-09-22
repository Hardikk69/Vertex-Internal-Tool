-- Team members can add clients from the Clients page. Client logins (public.users)
-- are still created by an admin, so nobody can change their own role or client link.

alter table public.clients add constraint clients_name_not_blank check (length(trim(name)) > 0);

create policy "clients: add (team)" on public.clients for insert to authenticated
with check ((select public.my_role()) = 'team');
