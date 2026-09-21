import { Link, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/format";
import {
  useGetPmAdminStats,
  useListAdminTransactions,
  getGetPmAdminStatsQueryKey,
  getListAdminTransactionsQueryKey,
} from "@workspace/api-client-react";

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetPmAdminStats({
    query: { enabled: !!user && user.role === "admin", queryKey: getGetPmAdminStatsQueryKey() },
  });
  const { data: transactions, isLoading: txLoading } = useListAdminTransactions({
    query: { enabled: !!user && user.role === "admin", queryKey: getListAdminTransactionsQueryKey() },
  });

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  const recent = transactions?.slice(0, 5) ?? [];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <div className="flex gap-2">
            <Link href="/admin/proposals"><Button variant="outline" size="sm">Moderasi</Button></Link>
            <Link href="/admin/payouts"><Button variant="outline" size="sm">Penarikan</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Transaksi", value: statsLoading ? null : stats?.totalTransactions.toString() },
            { label: "Total Revenue", value: statsLoading ? null : formatRupiah(stats?.totalRevenue ?? 0) },
            { label: "Revenue Platform", value: statsLoading ? null : formatRupiah(stats?.platformRevenue ?? 0) },
            { label: "Penarikan Pending", value: statsLoading ? null : stats?.pendingPayouts.toString() },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                {s.value === null ? (
                  <Skeleton className="h-7 w-3/4 mb-1" />
                ) : (
                  <div className="text-xl font-bold">{s.value}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Proposal", value: statsLoading ? null : stats?.totalProposals.toString() },
            { label: "Total Seller", value: statsLoading ? null : stats?.totalSellers.toString() },
            { label: "Total Pembeli", value: statsLoading ? null : stats?.totalBuyers.toString() },
            { label: "Bagian Seller", value: statsLoading ? null : formatRupiah(stats?.sellerPayouts ?? 0) },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                {s.value === null ? (
                  <Skeleton className="h-7 w-3/4 mb-1" />
                ) : (
                  <div className="text-xl font-bold">{s.value}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {[
            { label: "Kelola Pengguna", href: "/admin/users", desc: "Lihat semua buyer dan seller" },
            { label: "Semua Transaksi", href: "/admin/transactions", desc: "Riwayat seluruh transaksi" },
            { label: "Moderasi Proposal", href: "/admin/proposals", desc: "Setujui atau tolak proposal baru" },
            { label: "Kelola Penarikan", href: "/admin/payouts", desc: "Proses permintaan penarikan seller" },
            { label: "Pengaturan Pembayaran", href: "/admin/settings", desc: "Konfigurasi Midtrans & mode pembayaran" },
            { label: "Identitas Web", href: "/admin/site-identity", desc: "Logo, favicon, judul, deskripsi, footer" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="font-semibold text-sm">{item.label}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.desc}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Transaksi Terbaru</CardTitle>
            <Link href="/admin/transactions">
              <Button variant="ghost" size="sm">Lihat Semua</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {txLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Belum ada transaksi.</p>
            ) : (
              <div className="divide-y text-sm">
                {recent.map((tx) => (
                  <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{tx.proposalTitle ?? `Proposal #${tx.proposalId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.buyerName} &middot; {new Date(tx.createdAt).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-semibold">{formatRupiah(tx.amount)}</p>
                      <p className="text-xs text-muted-foreground">{tx.paymentStatus === "paid" ? "Lunas" : "Pending"}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
