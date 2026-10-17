import { Loader2, Moon, Sun, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";

// Shared login for team and clients; "/" routes by role afterwards.
export default function LoginPage() {
  const { loading, signedIn } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setError(error.message);
      setPending(false);
    }
  }

  async function forgotPassword(e: React.MouseEvent<HTMLButtonElement>) {
    const email = String(new FormData(e.currentTarget.form!).get("email")).trim();
    setError(null);
    setNotice(null);
    if (!email) return setError("Enter your email above first.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/set-password`,
    });
    if (error) setError(error.message);
    else setNotice("If that email has an account, a reset link is on its way.");
  }

  if (!loading && signedIn) return <Navigate to="/" replace />;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Background patterns and glowing aura */}
      <div className="hero-checker absolute inset-0 opacity-40 dark:opacity-25" aria-hidden />
      <div className="hero-checker-fade absolute inset-0" aria-hidden />

      {/* Ambient background glow */}
      <div 
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-96 rounded-full bg-[#FF4B33]/15 blur-3xl"
        aria-hidden
      />

      {/* Top right theme toggle */}
      <div className="absolute right-4 top-4 z-20">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="size-9 rounded-full bg-card/60 backdrop-blur-md shadow-sm border-border/60"
        >
          {theme === "dark" ? (
            <Sun className="size-4 text-amber-400" />
          ) : (
            <Moon className="size-4 text-slate-700" />
          )}
        </Button>
      </div>

      <div className="relative w-full max-w-sm">
        {/* Subtle glowing halo around card */}
        <div className="absolute -inset-0.5 rounded-3xl brand-gradient opacity-30 blur-lg transition-opacity duration-500 hover:opacity-50" />

        <Card className="relative rounded-3xl border border-white/40 bg-card/85 p-2 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-neutral-900/90">
          <CardHeader className="space-y-2 pb-4">
            <div className="flex items-center justify-between">
              <Logo className="h-10 w-10 transition-transform hover:scale-105" />
              <span className="rounded-full bg-[#FF4B33]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#FF4B33]">
                VMH Workspace
              </span>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Sign in</CardTitle>
            <CardDescription className="text-xs">
              Vertex Media House team &amp; client portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-xs font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@vertexmediahouse.com"
                  autoComplete="email"
                  className="rounded-xl bg-background/50 text-sm"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">
                    Password
                  </Label>
                  <button
                    type="button"
                    onClick={forgotPassword}
                    className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  className="rounded-xl bg-background/50 text-sm"
                  required
                />
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                  {error}
                </div>
              )}
              {notice && (
                <div role="status" className="rounded-xl border border-border bg-accent/60 p-2.5 text-xs text-muted-foreground">
                  {notice}
                </div>
              )}

              <Button
                type="submit"
                disabled={pending}
                aria-busy={pending}
                className="brand-gradient mt-1 h-10 w-full rounded-xl font-medium text-white shadow-md hover:opacity-95"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
