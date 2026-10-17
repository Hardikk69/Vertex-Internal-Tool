import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  CheckCircle2, 
  Clock, 
  FileText, 
  HelpCircle, 
  Info, 
  Layers, 
  Loader2, 
  Sparkles 
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Loading } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BRIEF, missing, questions, type Answers, type Question } from "@/lib/brief";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Brief = { 
  answers: Answers; 
  submitted_at: string | null; 
  updated_at: string; 
  author: { name: string } | null 
};

const COLS = "answers, submitted_at, updated_at, author:users(name)";

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
}) {
  const label = (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold text-foreground">{q.label}</span>
      {q.required ? (
        <span className="rounded bg-[#FF4B33]/15 px-1.5 py-0.2 text-[10px] font-bold text-[#FF4B33]">
          Required
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">(Optional)</span>
      )}
    </div>
  );

  if (q.type === "choices") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className="grid gap-2.5 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md">
        <legend className="px-1 text-sm font-semibold">{label}</legend>
        {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
        <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {q.options!.map((o) => {
            const isChecked = picked.includes(o);
            return (
              <label
                key={o}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-xs font-medium transition-all",
                  isChecked
                    ? "border-[#FF4B33]/60 bg-[#FF4B33]/10 text-foreground font-semibold"
                    : "border-border/60 bg-background/50 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                )}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={(on) =>
                    onChange(on === true ? [...picked, o] : picked.filter((x) => x !== o))
                  }
                />
                <span className="flex-1">{o}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div className="grid gap-2 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md">
      {label}
      {q.hint && <p className="text-xs text-muted-foreground">{q.hint}</p>}
      {q.type === "long" ? (
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Write your answer here…"
          className="rounded-xl bg-background/60 text-sm"
        />
      ) : (
        <Input
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type here…"
          className="rounded-xl bg-background/60 text-sm"
        />
      )}
    </div>
  );
}

export default function BriefPage() {
  const { profile } = useAuth();
  const clientId = profile!.client_id!;
  const [brief, setBrief] = useState<Brief | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

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

  const leftRequired = missing(answers);
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => {
    const val = answers[q.id];
    return Array.isArray(val) ? val.length > 0 : !!val?.trim();
  }).length;
  const completionPercentage = Math.round((answeredCount / totalQuestions) * 100);

  async function save(notifyComplete = false) {
    setBusy(true);
    const submitted_at = leftRequired === 0 ? (brief?.submitted_at ?? new Date().toISOString()) : null;
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
    toast.success(firstSubmit || notifyComplete ? "Project brief submitted — our creative team has been notified!" : "Draft progress saved");

    if ((firstSubmit || notifyComplete) && profile?.role === "client") {
      supabase
        .from("project_comments")
        .insert({ client_id: clientId, comment: "Submitted the project onboarding brief." })
        .then(({ error: e }) => e && console.error("Couldn't post brief notice:", e.message));
    }
  }

  if (!loaded) return <Loading className="py-20" />;

  const currentSection = BRIEF[activeStep];
  const isLastStep = activeStep === BRIEF.length - 1;

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      {/* Header with back link */}
      <div className="flex items-center justify-between">
        <Link
          to="/portal"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to Client Portal
        </Link>
        <span className="text-xs text-muted-foreground">
          {brief?.submitted_at ? "Status: Completed & Submitted" : "Status: In Progress"}
        </span>
      </div>

      {/* Hero Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-[#FF4B33]/10 p-6 shadow-xl sm:p-8">
        <div className="hero-checker absolute inset-0 opacity-10" />
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FF4B33]/15 px-3 py-1 text-xs font-semibold text-[#FF4B33]">
            <Sparkles className="size-3.5" />
            <span>Creative Onboarding</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {profile?.client?.name ?? "Your Brand"} Creative Brief
          </h1>
          <p className="max-w-xl text-xs text-muted-foreground sm:text-sm">
            This brief forms the blueprint for our directors, editors, and motion designers. Take your time to fill in as much detail as you can — all progress autosaves.
          </p>

          {/* Progress Bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Completion Progress</span>
              <span className="font-semibold text-foreground">{completionPercentage}% answered</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full brand-gradient transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Step Tabs / Stepper */}
      <div className="grid grid-cols-3 gap-2">
        {BRIEF.map((sec, idx) => {
          const isSelected = activeStep === idx;
          const isDone = sec.questions.every((q) => {
            if (!q.required) return true;
            const a = answers[q.id];
            return Array.isArray(a) ? a.length > 0 : !!a?.trim();
          });

          return (
            <button
              key={sec.title}
              type="button"
              onClick={() => setActiveStep(idx)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all",
                isSelected
                  ? "border-[#FF4B33]/60 bg-[#FF4B33]/10 shadow-sm"
                  : "border-border/60 bg-card/60 hover:bg-accent/40"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isSelected ? "text-[#FF4B33]" : "text-muted-foreground"
                )}>
                  Step {idx + 1}
                </span>
                {isDone && <CheckCircle2 className="size-3.5 text-emerald-500" />}
              </div>
              <p className="truncate text-xs font-semibold text-foreground">{sec.title}</p>
            </button>
          );
        })}
      </div>

      {/* Active Step Question Form */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {currentSection.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            Section {activeStep + 1} of {BRIEF.length}
          </p>
        </div>

        <div className="grid gap-4">
          {currentSection.questions.map((q) => (
            <QuestionField
              key={q.id}
              q={q}
              value={answers[q.id]}
              onChange={(v) => {
                setAnswers((prev) => ({ ...prev, [q.id]: v }));
                setDirty(true);
              }}
            />
          ))}
        </div>
      </div>

      {/* Navigation & Submission Controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {leftRequired > 0 ? (
            <span>
              <strong className="text-foreground">{leftRequired}</strong> required field{leftRequired === 1 ? "" : "s"} remaining before final submission.
            </span>
          ) : (
            <span className="font-semibold text-emerald-500">
              ✓ All required fields completed! You can submit now.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {activeStep > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveStep((prev) => prev - 1)}
              className="rounded-xl text-xs"
            >
              Previous
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => save(false)}
            disabled={!dirty || busy}
            className="rounded-xl text-xs"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : dirty ? "Save Draft" : "Draft Saved"}
          </Button>

          {!isLastStep ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                save(false);
                setActiveStep((prev) => prev + 1);
              }}
              className="brand-gradient rounded-xl text-xs font-semibold text-white"
            >
              Next Step <ArrowRight className="ml-1 size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => save(true)}
              disabled={busy}
              className="brand-gradient rounded-xl text-xs font-bold text-white shadow-md shadow-[#FF4B33]/20"
            >
              {busy ? "Submitting…" : "Complete & Submit Brief"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
