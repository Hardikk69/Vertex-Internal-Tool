# VMH Workspace

Internal time tracking, to-dos and client comment threads for Vertex Media House.
React + Vite single-page app, React Router, Supabase. Theme tokens and UI components come
from the vertexmediahouse.com repo (`src/styles.css`, `src/components/ui`).

All access control is Supabase RLS; the route guards in `src/main.tsx` only decide what to show.

## Setup

1. `npm install`, then copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
2. Run the files in `supabase/migrations/` in name order (SQL editor, or `supabase db push`).
3. Supabase → Authentication → Sign In / Providers: turn off "Allow new users to sign up".
   Accounts are created by an admin. A stray signup can't read anything anyway (no `public.users` row = no access).
4. `npm run dev` (local), `npm run build` (static files in `dist/`).

Deployed on Cloudflare Workers (static assets): build command `npm run build`, deploy command
`npx wrangler deploy`. `wrangler.jsonc` serves `index.html` for unknown paths so deep links like
`/time` survive a refresh. Don't add a `_redirects` SPA rule; Workers rejects it as a loop.
The `VITE_SUPABASE_*` variables must be set in the build environment (they're baked in at build time).

## Adding people and clients

Team members add clients from the Clients page. Logins are still admin-only: create the login
under Authentication → Users → Add user, then in the SQL editor:

```sql
-- team member
insert into public.users (id, role, name)
select id, 'team', 'Jane' from auth.users where email = 'jane@vertexmediahouse.com';

-- client login, linked to its project
insert into public.users (id, role, name, client_id)
select u.id, 'client', 'Acme PM', c.id
from auth.users u, public.clients c
where u.email = 'pm@acme.com' and c.name = 'Acme';
```

## Checks

`npm run test:rls` runs the migrations in an in-memory Postgres (PGlite) and asserts the RLS rules.
