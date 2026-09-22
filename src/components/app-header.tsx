import { LogOut } from "lucide-react";
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
  links?: { href: string; label: string; short?: string }[]; // short = label on phones
}) {
  return (
    <header className="sticky top-0 z-50 flex w-full justify-center px-4 py-4">
      <nav
        aria-label="Primary"
        className="liquid-glass flex w-full max-w-5xl items-center gap-2 rounded-2xl border border-white/40 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 shadow-lg shadow-black/5 backdrop-blur-2xl dark:border-white/10 dark:!bg-neutral-900/80 md:px-6"
      >
        <Link to="/" className="shrink-0">
          <Logo />
        </Link>
        <div className="flex min-w-0 gap-0.5 overflow-x-auto text-sm sm:gap-1">
          {links.map((l) => (
            <NavLink
              key={l.href}
              to={l.href}
              className={({ isActive }) =>
                cn(
                  "whitespace-nowrap rounded-full px-2.5 py-2 transition-colors sm:px-3",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
                )
              }
            >
              <span className="sm:hidden">{l.short ?? l.label}</span>
              <span className="hidden sm:inline">{l.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1 text-sm sm:gap-3">
          {/* on phones the tabs need the room, so the name only shows when there are none */}
          <span className={cn("truncate text-muted-foreground", links.length > 0 && "hidden sm:inline")}>
            {name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            className="shrink-0"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
