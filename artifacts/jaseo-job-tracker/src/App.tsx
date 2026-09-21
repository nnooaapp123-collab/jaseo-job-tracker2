import { AppLayout } from "@/components/layout";
import { Route, Switch, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import SettingsPage from "@/pages/settings";
import LoginPage from "@/pages/login";
import PendapatanPage from "@/pages/pendapatan";
import LaporanPage from "@/pages/laporan";
import ProfilPage from "@/pages/profil";
import TabunganPage from "@/pages/tabungan";
import PelangganPage from "@/pages/pelanggan";
import OrderPage from "@/pages/order";
import JadwalkanPage from "@/pages/jadwalkan";
import HariLiburPage from "@/pages/hari-libur";
import KeuanganPage from "@/pages/keuangan";
import KelolaTabunganPage from "@/pages/kelola-tabungan";
import LaporanBonusPage from "@/pages/laporan-bonus";
import RekeningPage from "@/pages/rekening";
import RekapGajiPage from "@/pages/rekap-gaji";
import TagihanPage from "@/pages/tagihan";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function AppRoutes() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/pendapatan" component={PendapatanPage} />
        <Route path="/profil" component={ProfilPage} />
        <Route path="/tabungan" component={TabunganPage} />
        <Route path="/laporan" component={LaporanPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/pelanggan" component={PelangganPage} />
        <Route path="/order" component={OrderPage} />
        <Route path="/jadwalkan" component={JadwalkanPage} />
        <Route path="/hari-libur" component={HariLiburPage} />
        <Route path="/keuangan" component={KeuanganPage} />
        <Route path="/kelola-tabungan" component={KelolaTabunganPage} />
        <Route path="/laporan-bonus" component={LaporanBonusPage} />
        <Route path="/rekening" component={RekeningPage} />
        <Route path="/rekap-gaji" component={RekapGajiPage} />
        <Route path="/tagihan" component={TagihanPage} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
