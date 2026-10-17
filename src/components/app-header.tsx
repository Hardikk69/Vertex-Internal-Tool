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
    <header className="sticky top-0 z-50 flex w-full justify-center px-3 py-3 sm:px-4 sm:py-4">
      <nav
        aria-label="Primary"
        className="liquid-glass flex w-full max-w-6xl items-center gap-2 rounded-2xl border border-white/50 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5 shadow-xl shadow-black/5 backdrop-blur-2xl dark:border-white/10 dark:!bg-neutral-900/85 md:px-5"
      >
        <Link to="/" className="group flex shrink-0 items-center gap-2">
          <Logo className="h-8 w-8 transition-transform duration-300 group-hover:scale-105" />
          <span className="hidden font-bold tracking-tight text-foreground lg:inline text-sm">
            VMH <span className="text-[#FF4B33] font-normal text-xs uppercase tracking-wider">Workspace</span>
          </span>
        </Link>
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm sm:gap-1.5 scrollbar-none">
          {links.map((l) => (
            <NavLink
              key={l.href}
              to={l.href}
              className={({ isActive }) =>
                cn(
                  "relative whitespace-nowrap rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-medium transition-all duration-200 sm:px-3 sm:py-2",
                  isActive
                    ? "bg-foreground text-background shadow-sm dark:bg-white dark:text-neutral-950 font-semibold"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
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
            className="shrink-0 rounded-xl text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="size-3.5" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
