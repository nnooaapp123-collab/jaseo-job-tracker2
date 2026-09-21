import { Link, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/format";
import {
  useGetPmSellerStats,
  useListMyProposals,
  getGetPmSellerStatsQueryKey,
  getListMyProposalsQueryKey,
} from "@workspace/api-client-react";
import { STATUS_LABELS } from "@/components/ProposalCard";

export default function SellerDashboard() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetPmSellerStats({
    query: { enabled: !!user && user.role === "seller", queryKey: getGetPmSellerStatsQueryKey() },
  });
  const { data: proposals, isLoading: proposalsLoading } = useListMyProposals({
    query: { enabled: !!user && user.role === "seller", queryKey: getListMyProposalsQueryKey() },
  });

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "seller") {
    navigate("/login");
    return null;
  }

  const statCards = [
    { label: "Total Penjualan", value: stats ? stats.totalSales.toString() : "-", sub: "transaksi" },
    { label: "Total Pendapatan", value: stats ? formatRupiah(stats.totalEarnings) : "-", sub: "65% per transaksi" },
    { label: "Saldo Tersedia", value: stats ? formatRupiah(stats.availableBalance) : "-", sub: "siap ditarik" },
    { label: "Total Proposal", value: stats ? stats.totalProposals.toString() : "-", sub: "proposal" },
  ];

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Seller</h1>
            <p className="text-sm text-muted-foreground mt-1">Selamat datang, {user.name}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/seller/earnings"><Button variant="outline" size="sm">Pendapatan</Button></Link>
            <Link href="/seller/proposals/new"><Button size="sm">Upload Proposal</Button></Link>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                {statsLoading ? (
                  <Skeleton className="h-8 w-full mb-1" />
                ) : (
                  <div className="text-xl font-bold">{s.value}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                <div className="text-xs text-muted-foreground">{s.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Proposal Saya</CardTitle>
            <Link href="/seller/proposals/new">
              <Button variant="ghost" size="sm">+ Tambah</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {proposalsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : proposals?.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <p className="mb-3">Belum ada proposal. Mulai jual sekarang!</p>
                <Link href="/seller/proposals/new">
                  <Button>Upload Proposal Pertama</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y">
                {proposals?.map((p) => {
                  const statusInfo = STATUS_LABELS[p.status] ?? { label: p.status, variant: "secondary" as const };
                  return (
                    <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-1">{p.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRupiah(p.price)} &middot; {p.totalSales} terjual &middot; {new Date(p.createdAt).toLocaleDateString("id-ID")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        <Link href={`/seller/proposals/${p.id}/edit`}>
                          <Button size="sm" variant="ghost">Edit</Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
