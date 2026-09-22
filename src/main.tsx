import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AuthProvider, useAuth, type Profile } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import ClientsPage from "@/pages/clients";
import LoginPage from "@/pages/login";
import PortalPage from "@/pages/portal";
import TimePage from "@/pages/time";
import TodosPage from "@/pages/todos";
import "./styles.css";

const teamLinks = [
  { href: "/time", label: "Time Tracking" },
  { href: "/todos", label: "To-Do" },
  { href: "/clients", label: "Clients" },
];

// UX gate only: RLS is what actually keeps each role to its own data.
function RoleLayout({ role }: { role: Profile["role"] }) {
  const { loading, profile } = useAuth();
  if (loading) return null;
  if (profile?.role !== role) return <Navigate to="/" replace />;
  return (
    <>
      <AppHeader name={profile.client?.name ?? profile.name} links={role === "team" ? teamLinks : []} />
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4">
        <Outlet />
      </main>
    </>
  );
}

// Routes everyone to /login, /time or /portal.
function Home() {
  const { loading, signedIn, profile } = useAuth();
  if (loading) return null;
  if (!signedIn) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to={profile.role === "team" ? "/time" : "/portal"} replace />;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold">Your account isn&apos;t set up yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a VMH admin to link your login to the team or to your project.
        </p>
        <Button variant="outline" className="mt-6" onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RoleLayout role="team" />}>
            <Route path="/time" element={<TimePage />} />
            <Route path="/todos" element={<TodosPage />} />
            <Route path="/clients" element={<ClientsPage />} />
          </Route>
          <Route element={<RoleLayout role="client" />}>
            <Route path="/portal" element={<PortalPage />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
