// Admins invite a login from the People page: creates the auth user (Supabase emails the
// invite link) and its public.users row. Deploy with --no-verify-jwt; the caller is checked here.
import { admin, APP_URL } from "../_shared/admin.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // caller must be a signed-in admin
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  const { data: auth } = await admin.auth.getUser(jwt);
  if (!auth.user) return json({ error: "Not signed in." }, 401);
  const { data: caller } = await admin.from("users").select("is_admin").eq("id", auth.user.id).maybeSingle();
  if (!caller?.is_admin) return json({ error: "Only admins can invite people." }, 403);

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const role = body.role;
  const clientId = role === "client" ? String(body.client_id ?? "") : null;
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || !name || !["team", "client"].includes(role) || clientId === "")
    return json({ error: "Email, name and role are required (and a client for client logins)." }, 400);

  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${APP_URL}/set-password`,
  });
  if (error) return json({ error: error.message }, 400);

  // the role/client check constraint and the client FK validate the rest
  const { error: rowError } = await admin
    .from("users")
    .insert({ id: invited.user.id, role, name, client_id: clientId });
  if (rowError) {
    await admin.auth.admin.deleteUser(invited.user.id); // don't leave a login with no access row
    return json({ error: rowError.message }, 400);
  }
  return json({ ok: true });
});
