import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/PmAuthContext";
import { useSiteIdentity } from "@/hooks/useSiteIdentity";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Navbar() {
  const { user, isLoading, logout } = useAuth();
  const [location] = useLocation();
  const identity = useSiteIdentity();

  return (
    <nav className="bg-primary sticky top-0 z-50 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer">
                {identity.logoUrl && (
                  <img
                    src={identity.logoUrl}
                    alt={identity.siteTitle}
                    className="h-8 w-8 object-contain rounded"
                  />
                )}
                <span className="text-xl font-bold text-white tracking-tight">
                  {identity.siteTitle}
                </span>
              </div>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link href="/browse">
                <span className={`text-sm font-medium cursor-pointer transition-colors hover:text-white ${location === "/browse" ? "text-white" : "text-white/70"}`}>
                  Jelajahi
                </span>
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isLoading ? null : user ? (
              <>
                {user.role === "seller" && (
                  <Link href="/seller/dashboard">
                    <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/15 border-0">
                      Dashboard Seller
                    </Button>
                  </Link>
                )}
                {user.role === "buyer" && (
                  <>
                    <Link href="/buyer/wallet">
                      <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/15 border-0">
                        Dompet
                      </Button>
                    </Link>
                    <Link href="/buyer/purchases">
                      <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/15 border-0">
                        Pembelian
                      </Button>
                    </Link>
                  </>
                )}
                {user.role === "admin" && (
                  <Link href="/admin">
                    <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/15 border-0">
                      Admin Panel
                    </Button>
                  </Link>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="font-medium text-white hover:bg-white/15 border border-white/30 hover:text-white">
                      {user.name}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                      {user.email}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {user.role === "seller" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/seller/dashboard">Dashboard</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/seller/earnings">Pendapatan</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {user.role === "buyer" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/buyer/wallet">Dompet & Saldo</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/buyer/purchases">Pembelian Saya</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {user.role === "admin" && (
                      <>
                        <DropdownMenuItem asChild>
                          <Link href="/admin">Admin Panel</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/admin/settings">Pengaturan Pembayaran</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href="/admin/site-identity">Identitas Web</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={logout}
                      className="text-destructive focus:text-destructive"
                    >
                      Keluar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="text-white/90 hover:text-white hover:bg-white/15">
                    Masuk
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="bg-white text-primary hover:bg-white/90 font-semibold">
                    Daftar
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
