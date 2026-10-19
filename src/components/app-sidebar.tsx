import {
  BarChart3,
  Calendar,
  CheckSquare,
  ChevronRight,
  Clock,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { Link, NavLink, useLocation } from "react-router";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type NavItem = {
  href: string;
  label: string;
  short?: string;
};

const ICON_MAP: Record<string, any> = {
  "/dashboard": LayoutDashboard,
  "/calendar": Calendar,
  "/time": Clock,
  "/todos": CheckSquare,
  "/clients": FolderKanban,
  "/portal": MessageSquare,
  "/brief": Sparkles,
  "/reports": BarChart3,
};

// Group labels for sidebar sections
const MAIN_SECTION = ["/dashboard", "/calendar", "/time", "/todos"];
const WORKSPACE_SECTION = ["/clients", "/reports"];
const CLIENT_SECTION = ["/portal", "/brief"];

export function AppSidebar({
  name,
  links = [],
}: {
  name: string;
  links?: NavItem[];
}) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Split links into sections
  const mainLinks = links.filter((l) => MAIN_SECTION.includes(l.href));
  const workspaceLinks = links.filter((l) => WORKSPACE_SECTION.includes(l.href));
  const clientSectionLinks = links.filter((l) => CLIENT_SECTION.includes(l.href));

  // Links that don't match any section
  const otherLinks = links.filter(
    (l) => !MAIN_SECTION.includes(l.href) && !WORKSPACE_SECTION.includes(l.href) && !CLIENT_SECTION.includes(l.href),
  );

  const renderLinkGroup = (label: string, items: NavItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className="px-2 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          {label}
        </div>
        {items.map((l) => {
          const Icon = ICON_MAP[l.href] || FolderKanban;
          return (
            <NavLink
              key={l.href}
              to={l.href}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
                  isActive
                    ? "bg-foreground text-background font-semibold shadow-xs"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 truncate">{l.label}</span>
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 text-muted-foreground/40 transition-transform",
                  location.pathname === l.href && "text-background/40",
                )}
              />
            </NavLink>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="sticky top-0 flex h-screen w-[260px] shrink-0 flex-col border-r border-border/60 bg-card/50 backdrop-blur-xl">
      {/* Brand Header */}
      <div className="flex h-[60px] items-center gap-2.5 border-b border-border/50 px-5">
        <Link to="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-foreground flex items-center gap-1.5 leading-tight">
              Vertex{" "}
              <span className="rounded bg-[#FF4B33]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#FF4B33] uppercase tracking-widest">
                Studio
              </span>
            </span>
            <span className="text-[10px] text-muted-foreground/70 leading-tight">Workspace OS</span>
          </div>
        </Link>
      </div>

      {/* Main Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {renderLinkGroup("Overview", mainLinks)}
        {renderLinkGroup("Workspaces", workspaceLinks)}
        {renderLinkGroup("Client Portal", clientSectionLinks)}
        {renderLinkGroup("More", otherLinks)}
      </div>

      {/* Workspace Badge */}
      <div className="mx-3 mb-2 rounded-xl border border-border/50 bg-accent/30 p-3 space-y-2">
        <div className="flex items-center gap-2 text-[11px]">
          <div className="flex size-5 items-center justify-center rounded bg-[#FF4B33]/20">
            <Settings className="size-3 text-[#FF4B33]" />
          </div>
          <span className="font-semibold text-foreground/80">Agency Plan</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>All systems operational</span>
        </div>
      </div>

      {/* User & Settings Footer */}
      <div className="border-t border-border/50 p-3 space-y-2">
        {/* User Card */}
        <div className="flex items-center justify-between rounded-xl bg-accent/30 p-2.5 text-xs">
          <div className="flex items-center gap-2.5 min-w-0 pr-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF4B33] to-[#FF6B55] font-bold text-xs text-white shadow-sm">
              {name ? name.charAt(0).toUpperCase() : <User className="size-3.5" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
              <p className="text-[10px] text-muted-foreground/70 truncate">Agency Member</p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="size-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun className="size-3.5 text-amber-400" />
            ) : (
              <Moon className="size-3.5 text-slate-700" />
            )}
          </Button>
        </div>

        {/* Sign Out Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => supabase.auth.signOut()}
          className="w-full justify-start rounded-lg text-xs h-8 text-muted-foreground/80 hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="mr-2 size-3.5" />
          <span>Sign out</span>
        </Button>
      </div>
    </aside>
  );
}
