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
`);
const dir = new URL("../supabase/migrations/", import.meta.url);
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));
await db.exec(`
  grant usage on schema public, auth to authenticated;
  grant all on all tables in schema public to authenticated;
`);

const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const [A, B, team1, team2, clientA, clientB, nobody] = [1, 2, 3, 4, 5, 6, 7].map(id);
await db.exec(`
  insert into auth.users values ('${team1}'), ('${team2}'), ('${clientA}'), ('${clientB}'), ('${nobody}');
  insert into public.clients (id, name) values ('${A}', 'Acme'), ('${B}', 'Bolt');
  insert into public.users values
    ('${team1}', 'team', 'Team One', null), ('${team2}', 'team', 'Team Two', null),
    ('${clientA}', 'client', 'Acme PM', '${A}'), ('${clientB}', 'client', 'Bolt PM', '${B}');
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
  ["Acme PM", "Team One", "Team Two"],
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

// team: own logs/todos only, every client and thread
assert.deepEqual(await as(team1, "select work_description, total_duration::text as d from public.time_logs"), [
  { work_description: "edit", d: "01:30:00" },
]);
assert.equal(await count(team1, "todos"), 1);
assert.equal(await count(team1, "clients"), 2);
assert.equal(await count(team1, "project_comments"), 3);
await as(team2, `delete from public.time_logs`);
assert.equal((await db.query("select count(*)::int as n from public.time_logs")).rows[0].n, 1); // team2 only deleted its own
const [reply] = await as(team1, `insert into public.project_comments (client_id, comment) values ('${B}', 'reply') returning author_role`);
assert.equal(reply.author_role, "team");

// time tracking constraints
await as(team1, `insert into public.time_logs (client_id) values ('${A}')`);
await rejects(as(team1, `insert into public.time_logs (client_id) values ('${B}')`), /time_logs_one_active/);
await rejects(as(team1, `update public.time_logs set clock_out = now() where clock_out is null`), /check constraint/);
await as(team1, `update public.time_logs set clock_out = now(), work_description = 'done' where clock_out is null`);

// signed in but not onboarded: sees nothing
for (const t of ["users", "clients", "time_logs", "todos", "project_comments"]) assert.equal(await count(nobody, t), 0);

console.log("RLS check passed");
