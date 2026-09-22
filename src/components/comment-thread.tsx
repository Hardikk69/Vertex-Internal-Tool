import { Send } from "lucide-react";
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
  author: { name: string } | null;
};

// One client's project thread. Used by the team Clients page and the client portal;
// RLS decides which threads a user can read or post to.
export function CommentThread({ clientId, userId }: { clientId: string; userId: string }) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_comments")
      .select("id, comment, created_at, author_id, author_role, author:users(name)")
      .eq("client_id", clientId)
      .order("created_at");
    if (error) toast.error(error.message);
    else setComments(data as unknown as Comment[]);
  }, [clientId]);

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

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const comment = text.trim();
    if (!comment || sending) return;
    setSending(true);
    const { error } = await supabase
      .from("project_comments")
      .insert({ client_id: clientId, comment });
    setSending(false);
    if (error) return void toast.error(error.message);
    setText("");
    load(); // realtime delivers it too; this covers a dropped socket
  }

  return (
    <Card className="flex h-[70dvh] min-h-96 flex-col overflow-hidden">
      <div ref={list} className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6" aria-live="polite">
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
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm",
                  mine ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {c.comment}
              </p>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={2}
          placeholder="Write an update…"
          aria-label="Message"
          className="min-h-0 resize-none"
        />
        <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim() || sending}>
          <Send />
        </Button>
      </form>
    </Card>
  );
}
