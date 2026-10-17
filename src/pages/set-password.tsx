import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuth } from "@/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

// When an invited client or team member clicks the email link, they land here.
// They set their name and password, then clients are seamlessly guided directly to their project brief.
export default function SetPasswordPage() {
  const { loading, signedIn, profile } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  // Pre-fill name from profile if already created by admin invite
  useEffect(() => {
    if (profile?.name && !name) {
      setName(profile.name);
    }
  }, [profile, name]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) {
      return toast.error("Password must be at least 8 characters.");
    }
    setPending(true);

    // 1. Update password
    const { error: passErr } = await supabase.auth.updateUser({ password });
    if (passErr) {
      setPending(false);
      return void toast.error(passErr.message);
    }

    // 2. If name was modified or provided, update public.users name
    if (name.trim() && profile?.id) {
      await supabase
        .from("users")
        .update({ name: name.trim() })
        .eq("id", profile.id);
    }

    setPending(false);
    toast.success("Account setup complete! Welcome to Vertex Media House.");

    // If client, route straight to the brief to onboard immediately
    if (profile?.role === "client") {
      navigate("/brief", { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  }

  if (loading) return null;

  const isClient = profile?.role === "client";
  const clientCompany = profile?.client?.name;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background patterns */}
      <div className="hero-checker absolute inset-0 opacity-40 dark:opacity-25" aria-hidden />
      <div className="hero-checker-fade absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-md">
        {/* Glowing halo */}
        <div className="absolute -inset-0.5 rounded-3xl brand-gradient opacity-30 blur-lg" />

        <Card className="relative rounded-3xl border border-white/40 bg-card/90 p-2 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/95">
          <CardHeader className="space-y-2 pb-4">
            <div className="flex items-center justify-between">
              <Logo className="h-10 w-10" />
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FF4B33]/15 px-2.5 py-0.5 text-xs font-semibold text-[#FF4B33]">
                <Sparkles className="size-3" />
                {isClient ? "Client Onboarding" : "Team Onboarding"}
              </span>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {signedIn
                ? isClient
                  ? `Welcome, ${clientCompany || "Partner"}!`
                  : "Welcome to the Team!"
                : "Invite Link Expired"}
            </CardTitle>
            <CardDescription className="text-xs">
              {signedIn
                ? isClient
                  ? "Set your details to access your project dashboard, files, and start your creative brief."
                  : "Set your password to access time tracking, clients, and team scheduling."
                : "This link has expired or has already been used. Please request a new invite or reset password."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {signedIn ? (
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="user-name" className="text-xs font-semibold">
                    Your Name / Contact Person
                  </Label>
                  <Input
                    id="user-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sarah Jenkins"
                    className="rounded-xl text-sm"
                    required
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold">
                    Create Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Minimum 8 characters"
                    className="rounded-xl text-sm"
                    minLength={8}
                    required
                  />
                </div>

                {isClient && (
                  <div className="flex items-center gap-2 rounded-xl bg-accent/40 p-3 text-xs text-muted-foreground">
                    <CheckCircle2 className="size-4 text-[#FF4B33] shrink-0" />
                    <span>Next step: Fill out your brand's creative project brief.</span>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={pending}
                  aria-busy={pending}
                  className="brand-gradient mt-2 h-11 w-full rounded-xl font-semibold text-white shadow-md hover:opacity-95"
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      Setting up account…
                    </>
                  ) : (
                    "Save & Get Started"
                  )}
                </Button>
              </form>
            ) : (
              <Button asChild className="w-full brand-gradient rounded-xl text-white">
                <Link to="/login">Go to Sign In</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
