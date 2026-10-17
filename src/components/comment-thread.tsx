import { Loader2, Paperclip, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Comment = {
  id: string;
  comment: string;
  created_at: string;
  author_id: string;
  author_role: "team" | "client";
  attachment_path: string | null;
  attachment_name: string | null;
  author: { name: string } | null;
  pending?: boolean; // local only: sent, not yet confirmed by the server
};

// Downloads through a short-lived signed URL; the bucket is private and storage RLS
// decides who can sign which files.
async function download(path: string, name: string) {
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 60, { download: name });
  if (error) return void toast.error(error.message);
  window.location.assign(data.signedUrl); // Content-Disposition: attachment, so the page stays put
}

// One client's project thread. Used by the team Clients page and the client portal;
// RLS decides which threads a user can read or post to.
export function CommentThread({ clientId, userId }: { clientId: string; userId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [announce, setAnnounce] = useState("");
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_comments")
      .select("id, comment, created_at, author_id, author_role, attachment_path, attachment_name, author:users(name)")
      .eq("client_id", clientId)
      .order("created_at");
    if (error) return void toast.error(error.message);
    const rows = data as unknown as Comment[];
    setComments(rows);
    const newest = rows.at(-1);
    // announce arrivals from other people only — not the whole thread on first load,
    // and not your own message echoing back
    if (loadedOnce.current && newest && newest.author_id !== userId)
      setAnnounce(`${newest.author?.name ?? "New message"}: ${newest.comment.slice(0, 100)}`);
    loadedOnce.current = true;
    // everything loaded is now read (drives the unread badges on the Clients page).
    // The newest message's own timestamp, so a skewed local clock can't skip messages.
    if (newest)
      supabase
        .from("thread_reads")
        .upsert({ user_id: userId, client_id: clientId, last_read_at: newest.created_at })
        .then(({ error }) => error && console.error("Couldn't mark thread read:", error.message));
  }, [clientId, userId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`comments:${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "project_comments",
          filter: `client_id=eq.${clientId}`,
        },
        load, // refetch so the author name comes along
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, load]);

  // keep the newest message in view
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [comments]);

  function pickFile(f: File | null) {
    setFile(f);
    if (!f && fileInput.current) fileInput.current.value = "";
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const comment = text.trim();
    if (sending) return;
    // the button stays enabled, so focus the composer instead of dying silently
    if (!comment && !file) return composer.current?.focus();
    setSending(true);

    // A text-only send is reversible and cheap, so the bubble appears now and rolls
    // back if the insert fails. A send with an attachment waits for the upload —
    // an optimistic bubble for a file that never lands is a worse lie than the wait.
    const optimistic = file ? null : crypto.randomUUID();
    if (optimistic) {
      setComments((cs) => [
        ...(cs ?? []),
        {
          id: optimistic,
          comment,
          created_at: new Date().toISOString(),
          author_id: userId,
          // only read for other people's messages, and this one is always yours
          author_role: "team",
          attachment_path: null,
          attachment_name: null,
          author: null,
          pending: true,
        },
      ]);
      setText("");
    }

    let attachment = {};
    if (file) {
      // <client_id>/ is what storage RLS checks; the random folder keeps same-named files apart
      const path = `${clientId}/${crypto.randomUUID()}/${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file, { contentType: file.type });
      if (error) {
        setSending(false);
        return void toast.error(`Upload failed: ${error.message}`);
      }
      attachment = { attachment_path: path, attachment_name: file.name };
    }
    // ponytail: if this insert fails the uploaded file is orphaned (no delete policy); rare, clean up in the dashboard
    const { error } = await supabase
      .from("project_comments")
      .insert({ client_id: clientId, comment, ...attachment });
    setSending(false);
    if (error) {
      if (optimistic) {
        setComments((cs) => cs?.filter((c) => c.id !== optimistic) ?? null);
        setText(comment); // don't make them retype it
      }
      return void toast.error(error.message);
    }
    setText("");
    pickFile(null);
    load(); // realtime delivers it too; this covers a dropped socket
  }

  return (
    <Card className="flex h-[70dvh] min-h-96 flex-col overflow-hidden">
      <div ref={list} className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6">
        {comments?.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No messages yet. Start the conversation.
          </p>
        )}
        {comments?.map((c) => {
          const mine = c.author_id === userId;
          return (
            <div key={c.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {mine ? "You" : (c.author?.name ?? (c.author_role === "team" ? "VMH team" : "Client"))}
                </span>
                {c.author_role === "team" && !mine && (
                  <span className="rounded-full bg-[#FF4B33]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#FF4B33]">
                    VMH
                  </span>
                )}
                <time dateTime={c.created_at}>
                  {new Date(c.created_at).toLocaleString([], {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </div>
              <div
                className={cn(
                  "grid max-w-[85%] gap-2 rounded-2xl px-4 py-2.5 text-sm",
                  mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  c.pending && "opacity-60",
                )}
              >
                {c.comment && <p className="whitespace-pre-wrap break-words">{c.comment}</p>}
                {c.attachment_path && (
                  <button
                    type="button"
                    onClick={() => download(c.attachment_path!, c.attachment_name!)}
                    className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-left underline-offset-2 hover:underline"
                  >
                    <Paperclip className="size-4 shrink-0" />
                    <span className="truncate">{c.attachment_name}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* arrivals only, so a screen reader isn't read the whole thread on load */}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <form onSubmit={send} className="grid gap-2 border-t p-3">
        {file && (
          <div className="flex min-w-0 items-center gap-2 self-start rounded-lg bg-muted px-3 py-1.5 text-sm">
            {/* ponytail: indeterminate — supabase-js storage upload exposes no progress
                events; swap in raw XHR if a real percentage is ever needed */}
            {sending ? (
              <Loader2 className="size-4 shrink-0 animate-spin" />
            ) : (
              <Paperclip className="size-4 shrink-0" />
            )}
            <span className="truncate">{sending ? `Uploading ${file.name}…` : file.name}</span>
            {!sending && (
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => pickFile(null)}
                className="cursor-pointer rounded-sm opacity-70 hover:opacity-100"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Attach a file"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip />
          </Button>
          <Textarea
            ref={composer}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={file ? "Add a note (optional)…" : "Write an update…"}
            aria-label="Message"
            className="min-h-0 resize-none"
          />
          <Button
            type="submit"
            size="icon"
            aria-label={sending ? "Sending" : "Send"}
            aria-busy={sending}
            disabled={sending}
          >
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </form>
    </Card>
  );
}
