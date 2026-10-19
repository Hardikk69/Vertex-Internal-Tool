import { LogOut, Moon, Sun, User } from "lucide-react";
import { Link, NavLink } from "react-router";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

// Floating glass bar with brand styling, theme switch and profile status.
export function AppHeader({
  name,
  links = [],
}: {
  name: string;
  links?: { href: string; label: string; short?: string }[]; // short = label on phones
}) {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="group flex shrink-0 items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-bold tracking-tight text-foreground text-sm flex items-center gap-1.5">
            Vertex <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Studio</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-xs sm:gap-1.5 ml-2 scrollbar-none">
          {links.map((l) => (
            <NavLink
              key={l.href}
              to={l.href}
              className={({ isActive }) =>
                cn(
                  "relative whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-accent text-foreground font-semibold"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )
              }
            >
              <span className="sm:hidden">{l.short ?? l.label}</span>
              <span className="hidden sm:inline">{l.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-1.5 text-sm sm:gap-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="size-8 rounded-xl text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun className="size-4 text-amber-400 transition-transform duration-300 hover:rotate-45" />
            ) : (
              <Moon className="size-4 text-slate-700 transition-transform duration-300 hover:-rotate-12" />
            )}
          </Button>

          {/* User profile tag */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-accent/60 px-2.5 py-1 text-xs text-foreground/80 max-w-44 border border-border/50">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#FF4B33]/20 text-[10px] font-bold text-[#FF4B33]">
              <User className="size-2.5" />
            </span>
            <span className="truncate font-medium">{name}</span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label="Sign out"
            className="shrink-0 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="size-3.5" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
