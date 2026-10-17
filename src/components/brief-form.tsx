import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRIEF, missing, type Answers, type Question } from "@/lib/brief";
import { supabase } from "@/lib/supabase";

type Brief = { answers: Answers; submitted_at: string | null; updated_at: string; author: { name: string } | null };

const COLS = "answers, submitted_at, updated_at, author:users(name)";

function Field({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const label = (
    <span className="text-sm font-medium">
      {q.label}
      {q.required && <span className="text-muted-foreground"> *</span>}
    </span>
  );
  if (q.type === "choices") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className="grid gap-2">
        <legend className="mb-2">{label}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {q.options!.map((o) => (
            <Label key={o} className="flex items-center gap-2 text-sm font-normal">
              <Checkbox
                checked={picked.includes(o)}
                onCheckedChange={(on) => onChange(on === true ? [...picked, o] : picked.filter((x) => x !== o))}
              />
              {o}
            </Label>
          ))}
        </div>
      </fieldset>
    );
  }
  const text = typeof value === "string" ? value : "";
  return (
    <Label className="grid gap-2">
      {label}
      {q.hint && <span className="-mt-1 text-xs font-normal text-muted-foreground">{q.hint}</span>}
      {q.type === "long" ? (
        <Textarea rows={3} value={text} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input value={text} onChange={(e) => onChange(e.target.value)} />
      )}
    </Label>
  );
}

// The onboarding brief for one client. Clients fill it in from the portal; the team sees
// and can edit the same form from the Clients page.
export function BriefForm({ clientId, onSaved }: { clientId: string; onSaved?: (submittedAt: string | null) => void }) {
  const { profile } = useAuth();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("client_briefs")
      .select(COLS)
      .eq("client_id", clientId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return void toast.error(error.message);
        setBrief((data ?? null) as unknown as Brief | null);
        setAnswers((data?.answers ?? {}) as Answers);
        setDirty(false);
        setLoaded(true);
      });
  }, [clientId]);

  const left = missing(answers);
  if (!loaded) return <Loading />;

  async function save() {
    setBusy(true);
    // submitted once every required question has an answer; it keeps the first submission's date
    const submitted_at = left === 0 ? (brief?.submitted_at ?? new Date().toISOString()) : null;
    const firstSubmit = !brief?.submitted_at && !!submitted_at;
    const { data, error } = await supabase
      .from("client_briefs")
      .upsert({ client_id: clientId, answers, submitted_at })
      .select(COLS)
      .single();
    setBusy(false);
    if (error) return void toast.error(error.message);
    setBrief(data as unknown as Brief);
    setDirty(false);
    onSaved?.(submitted_at);
    toast.success(firstSubmit ? "Brief submitted — thank you!" : "Saved");
    // let the team know through the thread they already watch (unread badge + email)
    if (firstSubmit && profile?.role === "client")
      supabase
        .from("project_comments")
        .insert({ client_id: clientId, comment: "Submitted the project brief." })
        .then(({ error }) => error && console.error("Couldn't post brief notice:", error.message));
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {brief?.submitted_at ? (
            <>
              <span className="font-medium text-foreground">Submitted</span>{" "}
              {new Date(brief.submitted_at).toLocaleDateString([], { dateStyle: "medium" })} · last edited{" "}
              {new Date(brief.updated_at).toLocaleDateString([], { dateStyle: "medium" })}
              {brief.author && ` by ${brief.author.name}`}
            </>
          ) : left > 0 ? (
            `${left} required question${left === 1 ? "" : "s"} still to answer.`
          ) : (
            "All set — hit Save to submit."
          )}
        </p>
        <Button onClick={save} disabled={!dirty || busy} aria-busy={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : dirty ? (
            "Save"
          ) : (
            "Saved"
          )}
        </Button>
      </div>

      {BRIEF.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            {section.questions.map((q) => (
              <Field
                key={q.id}
                q={q}
                value={answers[q.id]}
                onChange={(v) => {
                  setAnswers((a) => ({ ...a, [q.id]: v }));
                  setDirty(true);
                }}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-end gap-3">
        {left > 0 && <span className="text-sm text-muted-foreground">{left} required left</span>}
        <Button onClick={save} disabled={!dirty || busy} aria-busy={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : dirty ? (
            "Save"
          ) : (
            "Saved"
          )}
        </Button>
      </div>
    </div>
  );
}
