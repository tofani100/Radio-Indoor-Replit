import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, Monitor, Music, ListMusic, BarChart2, LogOut, Radio, Menu, X,
} from "lucide-react";
import { useAdminLogout } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export const APP_VERSION = "V21";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/clients", icon: Users, label: "Clientes" },
  { href: "/devices", icon: Monitor, label: "Dispositivos" },
  { href: "/media", icon: Music, label: "Biblioteca" },
  { href: "/playlists", icon: ListMusic, label: "Playlists" },
  { href: "/reports", icon: BarChart2, label: "Relatorios" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, setUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close drawer whenever the route changes (user tapped a nav link)
  useEffect(() => { setSidebarOpen(false); }, [location]);

  const logout = useAdminLogout({
    mutation: { onSuccess: () => { setUser(null); qc.clear(); } },
  });

  const currentLabel = NAV_ITEMS.find(
    (n) => location === n.href || location.startsWith(n.href + "/"),
  )?.label ?? "Painel Admin";

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border flex-none">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-sidebar-primary flex-none">
          <Radio className="w-4 h-4 text-sidebar-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-sidebar-foreground tracking-tight">Radio Indoor</p>
            <span
              data-testid="badge-version"
              className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-mono text-[11px] font-bold tracking-wide shadow-sm"
            >
              {APP_VERSION}
            </span>
          </div>
          <p className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">Painel Admin</p>
        </div>
        {/* Close button — mobile only */}
        <button
          className="ml-auto md:hidden text-sidebar-foreground/60 hover:text-sidebar-foreground"
          onClick={() => setSidebarOpen(false)}
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2" data-testid="sidebar-nav">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = location === href || location.startsWith(href + "/");
          return (
            <Link key={href} href={href}>
              <div
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md mb-0.5 text-sm font-medium transition-colors cursor-pointer",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="w-4 h-4 flex-none" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User / Logout */}
      <div className="p-3 border-t border-sidebar-border flex-none">
        <div className="flex items-center gap-2 px-2 py-1 mb-1">
          <div className="w-6 h-6 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-[10px] font-bold text-sidebar-primary uppercase flex-none">
            {user?.name?.[0] ?? "A"}
          </div>
          <span className="text-xs text-sidebar-foreground/70 truncate flex-1">{user?.email}</span>
        </div>
        <button
          data-testid="button-logout"
          onClick={() => logout.mutate()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-destructive transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>
        <div className="mt-2 pt-2 border-t border-sidebar-border/50 text-center">
          <span className="text-[10px] text-sidebar-foreground/50 font-mono font-medium">Radio-Indoor {APP_VERSION}</span>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Desktop sidebar (always visible ≥ md) ── */}
      <aside className="hidden md:flex w-60 flex-none flex-col bg-sidebar border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile drawer panel ── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-sidebar border-r border-sidebar-border",
          "transition-transform duration-200 ease-in-out md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <SidebarContent />
      </aside>

      {/* ── Right side: top bar + content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex-none flex items-center gap-3 px-4 h-14 bg-sidebar border-b border-sidebar-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded bg-sidebar-primary flex-none">
              <Radio className="w-3 h-3 text-sidebar-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-sidebar-foreground truncate">{currentLabel}</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
