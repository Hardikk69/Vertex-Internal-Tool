import { Link, NavLink } from "react-router";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// Same floating glass bar as the marketing site's Navbar.
export function AppHeader({
  name,
  links = [],
}: {
  name: string;
  links?: { href: string; label: string }[];
}) {
  return (
    <header className="sticky top-0 z-50 flex w-full justify-center px-4 py-4">
      <nav
        aria-label="Primary"
        className="liquid-glass flex w-full max-w-5xl items-center gap-3 rounded-2xl border border-white/40 px-4 py-2.5 shadow-lg shadow-black/5 backdrop-blur-2xl dark:border-white/10 dark:!bg-neutral-900/80 md:px-6"
      >
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>
        <div className="flex gap-1 overflow-x-auto text-sm">
          {links.map((l) => (
            <NavLink
              key={l.href}
              to={l.href}
              className={({ isActive }) =>
                cn(
                  "whitespace-nowrap rounded-full px-3 py-2 transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
                )
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{name}</span>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>
      </nav>
    </header>
  );
}
