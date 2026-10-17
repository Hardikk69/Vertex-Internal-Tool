import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AuthProvider, useAuth, type Profile } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { Loading } from "@/components/async-state";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/lib/supabase";
import ClientsPage from "@/pages/clients";
import DashboardPage from "@/pages/dashboard";
import LoginPage from "@/pages/login";
import PeoplePage from "@/pages/people";
import PortalPage from "@/pages/portal";
import BriefPage from "@/pages/brief";
import CalendarPage from "@/pages/calendar";
import SetPasswordPage from "@/pages/set-password";
import TimePage from "@/pages/time";
import TodosPage from "@/pages/todos";
import "./styles.css";

const teamLinks = [
  { href: "/dashboard", label: "Dashboard", short: "Dash" },
  { href: "/calendar", label: "Calendar", short: "Plan" },
  { href: "/time", label: "Time Tracking", short: "Time" },
  { href: "/todos", label: "To-Do" },
  { href: "/clients", label: "Clients" },
];
const clientLinks = [
  { href: "/portal", label: "Messages" },
  { href: "/brief", label: "Brief" },
];
const adminLinks = [
  ...teamLinks,
  { href: "/people", label: "People" },
];

// UX gate only: RLS is what actually keeps each role to its own data.
function RoleLayout({ role }: { role: Profile["role"] }) {
  const { loading, profile } = useAuth();
  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loading />
      </main>
    );
  if (profile?.role !== role) return <Navigate to="/" replace />;
  return (
    <>
      <AppHeader name={profile.client?.name ?? profile.name} links={role === "team" ? (profile.is_admin ? adminLinks : teamLinks) : clientLinks} />
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4">
        <Outlet />
      </main>
    </>
  );
}

// Routes everyone to /login, /dashboard or /portal.
function Home() {
  const { loading, signedIn, profile } = useAuth();
  if (loading)
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loading />
      </main>
    );
  if (!signedIn) return <Navigate to="/login" replace />;
  if (profile) return <Navigate to={profile.role === "team" ? "/dashboard" : "/portal"} replace />;
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
          <Route path="/set-password" element={<SetPasswordPage />} />
          <Route element={<RoleLayout role="team" />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/time" element={<TimePage />} />
            <Route path="/todos" element={<TodosPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/people" element={<PeoplePage />} />
          </Route>
          <Route element={<RoleLayout role="client" />}>
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/brief" element={<BriefPage />} />
          </Route>
          <Route path="*" element={<Home />} />
        </Routes>
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
