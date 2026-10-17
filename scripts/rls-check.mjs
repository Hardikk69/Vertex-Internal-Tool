// Runs the migrations in an in-memory Postgres (PGlite) and asserts the RLS rules.
// Usage: npm run test:rls
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const db = new PGlite();

// Minimal stand-in for the parts of Supabase the migration relies on.
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[:cardinality(string_to_array(name, '/')) - 1] $$;
`);
const dir = new URL("../supabase/migrations/", import.meta.url);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
await db.exec(`
  grant usage on schema public, auth, storage to authenticated;
  grant all on all tables in schema public, storage to authenticated;
`);

const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const [A, B, team1, team2, clientA, clientB, nobody, admin] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);
await db.exec(`
  insert into auth.users values ('${team1}'), ('${team2}'), ('${clientA}'), ('${clientB}'), ('${nobody}'), ('${admin}');
  insert into public.clients (id, name) values ('${A}', 'Acme'), ('${B}', 'Bolt');
  insert into public.users values
    ('${team1}', 'team', 'Team One', null), ('${team2}', 'team', 'Team Two', null),
    ('${clientA}', 'client', 'Acme PM', '${A}'), ('${clientB}', 'client', 'Bolt PM', '${B}');
  insert into public.users (id, role, name, is_admin) values ('${admin}', 'team', 'Admin', true);
  insert into public.time_logs (user_id, client_id, clock_in, clock_out, work_description) values
    ('${team1}', '${A}', '2026-01-01 10:00Z', '2026-01-01 11:30Z', 'edit'),
    ('${team2}', '${B}', '2026-01-01 10:00Z', '2026-01-01 11:00Z', 'design');
  insert into public.todos (user_id, title) values ('${team1}', 't1'), ('${team2}', 't2');
  insert into public.project_comments (client_id, author_id, author_role, comment) values
    ('${A}', '${clientA}', 'client', 'hi from A'), ('${B}', '${clientB}', 'client', 'hi from B');
`);

async function as(uid, sql) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return (await db.query(sql)).rows;
  } finally {
    await db.exec("reset role;");
  }
}
const count = async (uid, table) => (await as(uid, `select * from public.${table}`)).length;
const rejects = (p, re) => assert.rejects(p, re);

// client A: own client + own thread only, nothing team-only
assert.equal(await count(clientA, "time_logs"), 0);
assert.equal(await count(clientA, "todos"), 0);
assert.deepEqual(await as(clientA, "select name from public.clients"), [{ name: "Acme" }]);
assert.deepEqual(await as(clientA, "select comment from public.project_comments"), [{ comment: "hi from A" }]);
assert.deepEqual(
  (await as(clientA, "select name from public.users order by name")).map((r) => r.name),
  ["Acme PM", "Admin", "Team One", "Team Two"],
);
await rejects(as(clientA, `insert into public.project_comments (client_id, comment) values ('${B}', 'x')`), /row-level security/);
await rejects(
  as(clientA, `insert into public.project_comments (client_id, comment, author_role) values ('${A}', 'x', 'team')`),
  /row-level security/,
);
await rejects(as(clientA, `insert into public.time_logs (client_id) values ('${A}')`), /row-level security/);
const [posted] = await as(clientA, `insert into public.project_comments (client_id, comment) values ('${A}', 'ok') returning author_role`);
assert.equal(posted.author_role, "client");
await as(clientA, `update public.users set role = 'team', client_id = null where id = '${clientA}'`);
assert.equal((await db.query(`select role from public.users where id = '${clientA}'`)).rows[0].role, "client");

// admin: reads every time log, but writes only its own; nobody can self-promote; clients can't be admins
assert.equal(await count(admin, "time_logs"), 2);
await as(admin, `update public.time_logs set work_description = 'hacked'`);
await as(admin, `delete from public.time_logs`);
assert.equal((await db.query("select count(*)::int as n from public.time_logs where work_description <> 'hacked'")).rows[0].n, 2);
await as(team1, `update public.users set is_admin = true where id = '${team1}'`);
assert.equal((await db.query(`select is_admin from public.users where id = '${team1}'`)).rows[0].is_admin, false);
await rejects(db.query(`update public.users set is_admin = true where id = '${clientA}'`), /users_admin_is_team/);

// team: own logs/todos only, every client and thread
assert.deepEqual(await as(team1, "select work_description, total_duration::text as d from public.time_logs"), [
  { work_description: "edit", d: "01:30:00" },
]);
assert.equal(await count(team1, "todos"), 1);
assert.equal(await count(team1, "clients"), 2);
await as(team1, `insert into public.clients (name) values ('Cobalt')`);
assert.equal(await count(team1, "clients"), 3);
await rejects(as(team1, `insert into public.clients (name) values ('  ')`), /clients_name_not_blank/);
await rejects(as(clientA, `insert into public.clients (name) values ('x')`), /row-level security/);
await rejects(as(nobody, `insert into public.clients (name) values ('x')`), /row-level security/);
assert.equal(await count(team1, "project_comments"), 3);
await as(team2, `delete from public.time_logs`);
assert.equal((await db.query("select count(*)::int as n from public.time_logs")).rows[0].n, 1); // team2 only deleted its own
const [reply] = await as(team1, `insert into public.project_comments (client_id, comment) values ('${B}', 'reply') returning author_role`);
assert.equal(reply.author_role, "team");

// time tracking constraints
await as(team1, `insert into public.time_logs (client_id) values ('${A}')`);
await rejects(as(team1, `insert into public.time_logs (client_id) values ('${B}')`), /time_logs_one_active/);
// a manual (finished) entry is fine while a timer runs
await as(team1, `insert into public.time_logs (client_id, clock_in, clock_out, work_description)
  values ('${B}', '2026-01-02 09:00Z', '2026-01-02 10:00Z', 'manual')`);
await rejects(as(team1, `update public.time_logs set clock_out = now() where clock_out is null`), /check constraint/);
await as(team1, `update public.time_logs set clock_out = now(), work_description = 'done' where clock_out is null`);

// clients: team renames/archives/sets retainers, clients can't
await as(team1, `update public.clients set name = 'Acme Co', archived = true, retainer_hours = 40 where id = '${A}'`);
await as(clientA, `update public.clients set name = 'hacked', retainer_hours = 999 where id = '${A}'`);
assert.deepEqual((await db.query(`select name, archived, retainer_hours::int as h from public.clients where id = '${A}'`)).rows, [
  { name: "Acme Co", archived: true, h: 40 },
]);

// hours used: a client gets its own total (not the rows), never another client's
const hours = async (uid, c) => (await as(uid, `select round(public.hours_logged('${c}', '2026-01-01'), 2)::float as h`))[0].h;
assert.equal(await hours(clientA, A), 1.5);
assert.equal(await hours(clientA, B), 0);
assert.equal(await hours(team2, A), 1.5);
assert.equal(await hours(nobody, A), 0);

// attachments: files stay in their client's folder, per-client read access
await as(clientA, `insert into public.project_comments (client_id, attachment_path, attachment_name) values ('${A}', '${A}/x/brief.pdf', 'brief.pdf')`);
await rejects(
  as(clientA, `insert into public.project_comments (client_id, attachment_path, attachment_name) values ('${A}', '${B}/x/f.pdf', 'f.pdf')`),
  /attachment_in_client_folder/,
);
await rejects(as(clientA, `insert into public.project_comments (client_id, comment) values ('${A}', '  ')`), /comment_or_attachment/);
await as(clientA, `insert into storage.objects (bucket_id, name) values ('attachments', '${A}/x/brief.pdf')`);
await rejects(as(clientA, `insert into storage.objects (bucket_id, name) values ('attachments', '${B}/x/evil.pdf')`), /row-level security/);
await as(team1, `insert into storage.objects (bucket_id, name) values ('attachments', '${B}/y/cut.mp4')`);
assert.deepEqual(await as(clientA, "select name from storage.objects"), [{ name: `${A}/x/brief.pdf` }]);
assert.deepEqual(await as(clientB, "select name from storage.objects"), [{ name: `${B}/y/cut.mp4` }]);
assert.equal((await as(team2, "select name from storage.objects")).length, 2);

// unread: messages from others since you last read the thread; you can only mark your own reads
const unread = async (uid) =>
  Object.fromEntries((await as(uid, "select client_id, unread::int as n from public.unread_counts()")).map((r) => [r.client_id, r.n]));
assert.deepEqual(await unread(team1), { [A]: 3, [B]: 1 }); // B: team1's own reply doesn't count
await as(team1, `insert into public.thread_reads (client_id, last_read_at) select '${A}', max(created_at) from public.project_comments where client_id = '${A}'`);
assert.deepEqual(await unread(team1), { [B]: 1 });
assert.deepEqual(await unread(clientA), {}); // only its own messages in its thread
await rejects(as(team1, `insert into public.thread_reads (user_id, client_id, last_read_at) values ('${team2}', '${A}', now())`), /row-level security/);
assert.equal(await count(team2, "thread_reads"), 0);

// briefs: a client fills in its own and sees no other; the team sees and edits all
await as(clientA, `insert into public.client_briefs (client_id, answers) values ('${A}', '{"brand": "Acme"}')`);
await rejects(as(clientA, `insert into public.client_briefs (client_id) values ('${B}')`), /row-level security/);
await as(team1, `insert into public.client_briefs (client_id, answers) values ('${B}', '{"brand": "Bolt"}')`);
assert.deepEqual(await as(clientA, "select answers->>'brand' as b from public.client_briefs"), [{ b: "Acme" }]);
assert.equal(await count(team1, "client_briefs"), 2);
await as(team1, `update public.client_briefs set answers = '{"brand": "Acme Co"}', submitted_at = now() where client_id = '${A}'`);
await as(clientA, `update public.client_briefs set answers = '{"brand": "hacked"}' where client_id = '${B}'`);
assert.deepEqual((await db.query(`select answers->>'brand' as b, updated_by from public.client_briefs order by b`)).rows, [
  { b: "Acme Co", updated_by: team1 }, // the trigger records who edited, whatever the client sends
  { b: "Bolt", updated_by: team1 },
]);
await rejects(as(team1, `insert into public.client_briefs (client_id, answers) values ('${A}', '"nope"')`), /client_briefs_answers_check|duplicate key/);

// the profile query embeds clients through this constraint by name (users -> clients is
// ambiguous to PostgREST now that thread_reads looks like a join table), so it must keep its name
assert.equal((await db.query("select conname from pg_constraint where conname = 'users_client_id_fkey'")).rows.length, 1);

// to-dos can point at a client
await as(team1, `insert into public.todos (title, client_id) values ('send cut', '${A}')`);

// signed in but not onboarded: sees nothing
for (const t of ["users", "clients", "time_logs", "todos", "project_comments", "thread_reads", "client_briefs"]) assert.equal(await count(nobody, t), 0);
assert.equal((await as(nobody, "select * from storage.objects")).length, 0);

console.log("RLS check passed");
