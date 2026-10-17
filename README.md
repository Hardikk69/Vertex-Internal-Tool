# VMH Workspace

Internal time tracking, to-dos and client comment threads for Vertex Media House.
React + Vite single-page app, React Router, Supabase. Theme tokens and UI components come
from the vertexmediahouse.com repo (`src/styles.css`, `src/components/ui`).

All access control is Supabase RLS; the route guards in `src/main.tsx` only decide what to show.

## Setup

1. `npm install`, then copy `.env.example` to `.env.local` and fill in the Supabase URL and publishable key.
2. Run the files in `supabase/migrations/` in name order (SQL editor, or `supabase db push`).
3. Supabase → Authentication → Sign In / Providers: turn off "Allow new users to sign up".
   Accounts are invited by an admin (People page). A stray signup can't read anything anyway (no `public.users` row = no access).
4. `npm run dev` (local), `npm run build` (static files in `dist/`).

Deployed on Cloudflare Workers (static assets): build command `npm run build`, deploy command
`npx wrangler deploy`. `wrangler.jsonc` serves `index.html` for unknown paths so deep links like
`/time` survive a refresh. Don't add a `_redirects` SPA rule; Workers rejects it as a loop.
The `VITE_SUPABASE_*` variables must be set in the build environment (they're baked in at build time).

## Email, invites and notifications (one-time setup)

Logins are invited from the **People** page and thread messages trigger emails. Both run as
Supabase Edge Functions (`supabase/functions/`) and send mail through [Resend](https://resend.com).

1. **Resend**: verify the `vertexmediahouse.com` domain and create an API key.
2. **Supabase → Authentication → Emails → SMTP settings**: enable custom SMTP with Resend
   (host `smtp.resend.com`, port `465`, user `resend`, password = the API key). Supabase's built-in
   mailer only delivers to your own org's addresses, so invites and password resets need this.
3. **Supabase → Authentication → URL Configuration**: set Site URL to the app's URL and add
   `https://<app-url>/set-password` to Redirect URLs (invite and reset links land there).
4. **Deploy the functions** (Supabase CLI, logged in and linked to the project):
   ```sh
   supabase secrets set APP_URL=https://<app-url> RESEND_API_KEY=re_...      EMAIL_FROM="VMH Workspace <notifications@vertexmediahouse.com>" WEBHOOK_SECRET=<long random string>
   supabase functions deploy invite --no-verify-jwt
   supabase functions deploy notify --no-verify-jwt
   ```
   Both check the caller themselves: `invite` requires a signed-in admin, `notify` requires the
   webhook secret.
5. **Supabase → Database → Webhooks → Create**: table `project_comments`, event *Insert*, type
   *Supabase Edge Functions* → `notify`, and add the HTTP header `x-webhook-secret: <same secret>`.
   A client message then emails the whole team; a team reply emails that client's logins.

## People and clients

Bootstrap the first admin once in the SQL editor (after creating the login under
Authentication → Users → Add user). From then on, admins invite everyone else from **People**:

```sql
insert into public.users (id, role, name, is_admin)
select id, 'team', 'Jane', true from auth.users where email = 'jane@vertexmediahouse.com';
```

- **Clients page** (team): add, rename, archive (clients can't be deleted, their time logs point at
  them), set monthly retainer hours, and see unread-message badges per thread.
- **Threads**: team and clients can attach one file per message (briefs, drafts, reels). Files live
  in the private `attachments` bucket under `<client_id>/`, and storage RLS keeps each client to its
  own folder. The per-file limit is the project's upload limit (Storage settings; 50 MB on the free plan).
- **Onboarding brief**: clients answer a questionnaire in the portal (Brief tab); the team sees and
  can edit the same form from the client's Brief tab. Questions live in `src/lib/brief.ts` — change
  the wording freely, but keep the question `id`s, since answers are stored against them. Submitting
  posts a note in the thread, so the team gets the usual email and unread badge.
- **Client portal**: Messages and Brief, plus hours used this month against the retainer, as a total only.
- **Time page**: add, edit and delete your own entries (e.g. a forgotten clock-out), CSV export.
- **Reports / People** (admins): everyone's hours by client and person with CSV export; invites.
- **To-dos**: optionally tagged with a client; unfinished ones move to today automatically.

## Checks

`npm run test:rls` runs the migrations in an in-memory Postgres (PGlite) and asserts the RLS rules.
