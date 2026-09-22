import { useState, type FormEvent } from "react";
import { Navigate } from "react-router";
import { useAuth } from "@/auth";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

// Shared login for team and clients; "/" routes by role afterwards.
export default function LoginPage() {
  const { loading, signedIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
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
    // on success AuthProvider picks up the session and the check below redirects
  }

  if (!loading && signedIn) return <Navigate to="/" replace />;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="hero-checker absolute inset-0" aria-hidden />
      <div className="hero-checker-fade absolute inset-0" aria-hidden />
      <Card className="relative w-full max-w-sm">
        <CardHeader>
          <Logo className="mb-2 h-10 w-10" />
          <CardTitle className="text-2xl">Sign in</CardTitle>
          <CardDescription>Vertex Media House workspace</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
