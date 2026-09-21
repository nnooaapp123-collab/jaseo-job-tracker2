import { ReactNode, useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Settings, LayoutDashboard, LogOut, Shield, Monitor, Pencil,
  User, Wallet, FileBarChart2, CircleUser, Menu, Users, ShoppingBag, CalendarClock, CalendarDays, TrendingUp, PiggyBank, Bell, Star, Landmark, ArrowLeftRight, Receipt, FileText,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import logoJaseo from "../assets/logo-jaseo.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fmtRp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

interface PendingWithdrawal {
  id: number;
  userId: number;
  username: string;
  requestedAmount: number;
  reason: string | null;
  requestedAt: string;
}

const NAV_ITEMS = [
  { title: "Dashboard",  url: "/",           icon: LayoutDashboard, roles: null },
  { title: "Pelanggan",  url: "/pelanggan",  icon: Users,           roles: ["admin", "cs"] },
  { title: "Order",      url: "/order",      icon: ShoppingBag,     roles: ["admin", "cs"] },
  { title: "Tagihan",    url: "/tagihan",    icon: FileText,        roles: ["admin", "cs"] },
  { title: "Jadwalkan",  url: "/jadwalkan",  icon: CalendarClock,   roles: ["admin", "cs"] },
  { title: "Hari Libur", url: "/hari-libur", icon: CalendarDays,   roles: ["admin", "cs", "editor", "penulis"] },
  { title: "Pendapatan", url: "/pendapatan", icon: Wallet,          roles: ["admin", "penulis", "editor", "cs"] },
  { title: "Profil",     url: "/profil",     icon: CircleUser,      roles: ["admin", "penulis", "editor", "cs"] },
  { title: "Laporan",    url: "/laporan",    icon: FileBarChart2,   roles: ["admin", "penulis", "editor", "cs"] },
  { title: "Keuangan",        url: "/keuangan",        icon: TrendingUp, roles: ["admin"] },
  { title: "Kelola Tabungan", url: "/kelola-tabungan", icon: PiggyBank,  roles: ["admin"] },
  { title: "Laporan Bonus",   url: "/laporan-bonus",   icon: Star,       roles: ["admin"] },
  { title: "Rekap Gaji",      url: "/rekap-gaji",      icon: Receipt,    roles: ["admin"] },
  { title: "Rekening",        url: "/rekening",        icon: Landmark,   roles: ["admin"] },
  { title: "Pengaturan",      url: "/settings",        icon: Settings,   roles: ["admin", "cs"] },
] as const;

const ROLE_CONFIG = {
  admin:   { label: "Admin",            icon: Shield,  color: "text-red-600",     bg: "bg-red-500/10" },
  cs:      { label: "Customer Service", icon: Monitor, color: "text-blue-600",    bg: "bg-blue-500/10" },
  editor:  { label: "Editor",           icon: Pencil,  color: "text-purple-600",  bg: "bg-purple-500/10" },
  penulis: { label: "Penulis",          icon: User,    color: "text-emerald-600", bg: "bg-emerald-500/10" },
};

// Inner layout uses useSidebar() — must be inside SidebarProvider
function InnerLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { currentUser, logout, refresh } = useAuth();
  const queryClient = useQueryClient();
  const { state, isMobile, toggleSidebar } = useSidebar();

  // ── Notifikasi pencairan tabungan (admin only) ──
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const { data: pendingWithdrawals = [] } = useQuery<PendingWithdrawal[]>({
    queryKey: ["pending-withdrawals-notif"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/savings/withdrawals`, { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((w: any) => w.status === "pending");
    },
    enabled: currentUser?.role === "admin",
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!currentUser) return null;

  const collapsed = !isMobile && state === "collapsed";
  const roleConf = ROLE_CONFIG[currentUser.role] ?? ROLE_CONFIG.penulis;
  const RoleIcon = roleConf.icon;
  const displayName =
    currentUser.role === "penulis" ? currentUser.writerName ?? currentUser.username
    : currentUser.role === "editor" ? currentUser.editorName ?? currentUser.username
    : currentUser.username;

  const handleLogout = async () => {
    queryClient.clear();
    await logout();
  };

  const handleRestoreAdmin = async () => {
    try {
      const res = await fetch(`${BASE}/api/auth/restore-admin`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        queryClient.clear();
        await refresh();
      }
    } catch {}
  };

  const pageTitles: Record<string, string> = {
    "/pelanggan": "Data Pelanggan", "/order": "Order Artikel", "/jadwalkan": "Jadwalkan Job", "/hari-libur": "Hari Libur",
  };
  const currentTitle = pageTitles[location] ?? ([...NAV_ITEMS].find(item => item.url === location)?.title ?? "Jaseo Konten");

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* ── Sidebar ── */}
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={logoJaseo}
              alt="Jaseo"
              className="shrink-0 object-contain"
              style={{ height: collapsed ? "26px" : "30px", width: "auto" }}
            />
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-serif font-bold tracking-tight text-sidebar-foreground text-sm leading-none">
                  Jaseo Konten
                </span>
                <span className="text-xs text-sidebar-foreground/70 mt-0.5">Job Tracker</span>
              </div>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {/* ── Navigasi utama ── */}
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Menu Utama</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.filter(item =>
                  !item.roles || item.roles.includes(currentUser.role as never)
                ).map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      tooltip={item.title}
                    >
                      <Link href={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* ── Profil & Keluar — di bawah menu, bukan footer ── */}
          <SidebarGroup className="mt-auto pb-2">
            <SidebarGroupContent>
              {!collapsed ? (
                <div className="space-y-1 px-1">
                  {/* User identity */}
                  <div className={cn(
                    "flex items-center gap-2.5 rounded-lg px-3 py-2.5 mb-1",
                    roleConf.bg,
                  )}>
                    <RoleIcon className={cn("h-4 w-4 shrink-0", roleConf.color)} />
                    <div className="flex flex-col min-w-0">
                      <span className={cn("text-sm font-semibold truncate leading-tight", roleConf.color)}>
                        {displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">{roleConf.label}</span>
                    </div>
                  </div>
                  {/* Logout */}
                  <Button
                    variant="ghost" size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2 h-8"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Keluar
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 px-1">
                  <button
                    onClick={handleLogout}
                    title="Keluar"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full flex justify-center"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden h-[100dvh]">
        <header className="flex h-14 items-center gap-2 border-b bg-card px-4 shrink-0">
          {/* Mobile + desktop toggle button */}
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title={collapsed ? "Buka sidebar" : "Sembunyikan sidebar"}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-serif font-semibold text-foreground truncate">
              {currentTitle}
            </h1>
          </div>

          {/* ── Bell notifikasi pencairan (admin only) ── */}
          {currentUser.role === "admin" && (
            <div className="relative shrink-0" ref={bellRef}>
              <button
                onClick={() => setBellOpen(o => !o)}
                title="Pengajuan pencairan tabungan"
                className={cn(
                  "relative p-1.5 rounded-md transition-colors",
                  pendingWithdrawals.length > 0
                    ? "text-amber-600 hover:bg-amber-500/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <Bell className={cn("h-5 w-5", pendingWithdrawals.length > 0 && "animate-[wiggle_0.8s_ease-in-out_2]")} />
                {pendingWithdrawals.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                    {pendingWithdrawals.length > 9 ? "9+" : pendingWithdrawals.length}
                  </span>
                )}
              </button>

              {/* Dropdown panel */}
              {bellOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <span className="font-semibold text-sm flex items-center gap-2">
                      <Bell className="h-4 w-4 text-amber-500" />
                      Pengajuan Pencairan
                    </span>
                    {pendingWithdrawals.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                        {pendingWithdrawals.length} menunggu
                      </span>
                    )}
                  </div>

                  {pendingWithdrawals.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Tidak ada pengajuan yang menunggu
                    </div>
                  ) : (
                    <ul className="max-h-72 overflow-y-auto divide-y">
                      {pendingWithdrawals.map(w => (
                        <li key={w.id} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{w.username}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{w.reason ?? "Tanpa alasan"}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {new Date(w.requestedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <span className="text-sm font-bold text-amber-600 whitespace-nowrap shrink-0">
                              {fmtRp(w.requestedAmount)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="px-4 py-2.5 border-t">
                    <Link href="/kelola-tabungan" onClick={() => setBellOpen(false)}>
                      <span className="text-xs text-primary font-medium hover:underline cursor-pointer">
                        Kelola semua pengajuan →
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Role chip — nama + role */}
          <div className={cn(
            "hidden sm:flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium shrink-0",
            roleConf.bg, roleConf.color,
          )}>
            <RoleIcon className="h-3 w-3 shrink-0" />
            <span className="font-semibold">{displayName}</span>
            <span className="opacity-60">·</span>
            <span>{roleConf.label}{currentUser.isAlsoEditor ? " + Editor" : ""}</span>
          </div>

          {/* Profil quick link */}
          <Link href="/profil">
            <button
              title="Profil saya"
              className={cn(
                "p-1.5 rounded-full border-2 flex items-center justify-center shrink-0",
                roleConf.bg, roleConf.color,
              )}
            >
              <CircleUser className="h-4 w-4" />
            </button>
          </Link>
        </header>

        {/* ── Banner impersonasi ── */}
        {currentUser.isImpersonating && (
          <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-sm font-medium min-w-0">
              <ArrowLeftRight className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Mode Admin — login sebagai <strong>{displayName}</strong> ({roleConf.label})
              </span>
            </div>
            <Button
              size="sm"
              className="h-7 text-xs shrink-0 bg-white/20 hover:bg-white/30 text-white border-white/30 border"
              onClick={handleRestoreAdmin}
            >
              <ArrowLeftRight className="h-3 w-3 mr-1.5" />
              Kembali ke Admin
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <InnerLayout>{children}</InnerLayout>
    </SidebarProvider>
  );
}
