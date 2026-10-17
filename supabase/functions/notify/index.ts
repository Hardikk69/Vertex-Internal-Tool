// Emails the other side when someone posts in a client thread: a client message goes to
// the team, a team reply goes to that client's logins. Called by a Database Webhook on
// INSERT into public.project_comments (see README). Deploy with --no-verify-jwt; the
// webhook authenticates with the x-webhook-secret header instead.
import { admin, APP_URL } from "../_shared/admin.ts";

type Comment = {
  client_id: string;
  author_id: string;
  author_role: "team" | "client";
  comment: string;
  attachment_name: string | null;
};

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET"))
    return new Response("Forbidden", { status: 403 });

  const { record: c }: { record: Comment } = await req.json();
  const toTeam = c.author_role === "client";

  const recipientsQuery = admin.from("users").select("id").neq("id", c.author_id);
  const [client, author, recipients] = await Promise.all([
    admin.from("clients").select("name").eq("id", c.client_id).single(),
    admin.from("users").select("name").eq("id", c.author_id).single(),
    toTeam ? recipientsQuery.eq("role", "team") : recipientsQuery.eq("client_id", c.client_id),
  ]);
  if (!client.data || !author.data || !recipients.data)
    return new Response((client.error ?? author.error ?? recipients.error)?.message, { status: 500 });
  const clientName = client.data.name;
  const authorName = author.data.name;

  // emails live in auth.users, not public.users
  const users = await Promise.all(recipients.data.map((r) => admin.auth.admin.getUserById(r.id)));
  const emails = users.map((u) => u.data.user?.email).filter((e): e is string => !!e);
  if (!emails.length) return new Response("No recipients");

  const link = toTeam ? `${APP_URL}/clients?c=${c.client_id}` : `${APP_URL}/portal`;
  const text = [
    `${authorName} wrote in the ${clientName} thread:`,
    "",
    c.comment,
    c.attachment_name ? `\n[Attached: ${c.attachment_name}]` : "",
    "",
    `Reply here: ${link}`,
  ].join("\n");

  // ponytail: one email per message; switch to a digest if busy threads get noisy
  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    // one email per recipient, so nobody sees the others' addresses
    body: JSON.stringify(
      emails.map((to) => ({
        from: Deno.env.get("EMAIL_FROM"),
        to,
        subject: `New message from ${authorName} · ${clientName}`,
        text,
      })),
    ),
  });
  if (!res.ok) return new Response(`Resend: ${await res.text()}`, { status: 502 });
  return new Response(`Sent to ${emails.length}`);
});
