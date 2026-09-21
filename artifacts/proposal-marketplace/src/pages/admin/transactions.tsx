import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/format";
import { useListAdminTransactions, getListAdminTransactionsQueryKey } from "@workspace/api-client-react";

export default function AdminTransactions() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: transactions, isLoading } = useListAdminTransactions({
    query: { enabled: !!user && user.role === "admin", queryKey: getListAdminTransactionsQueryKey() },
  });

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  const totalRevenue = transactions?.filter(t => t.paymentStatus === "paid").reduce((a, t) => a + t.amount, 0) ?? 0;
  const totalPlatform = transactions?.filter(t => t.paymentStatus === "paid").reduce((a, t) => a + t.platformShare, 0) ?? 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Semua Transaksi</h1>

        {!isLoading && transactions && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card><CardContent className="p-4">
              <div className="text-xl font-bold">{transactions.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Transaksi</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xl font-bold">{formatRupiah(totalRevenue)}</div>
              <div className="text-xs text-muted-foreground mt-1">Gross Revenue</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xl font-bold text-green-600">{formatRupiah(totalPlatform)}</div>
              <div className="text-xs text-muted-foreground mt-1">Platform Revenue (35%)</div>
            </CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "Memuat..." : `${transactions?.length ?? 0} transaksi`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : transactions?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Belum ada transaksi.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4">Proposal</th>
                      <th className="text-left py-2 pr-4">Pembeli</th>
                      <th className="text-right py-2 pr-4">Total</th>
                      <th className="text-right py-2 pr-4">Seller (65%)</th>
                      <th className="text-right py-2 pr-4">Platform (35%)</th>
                      <th className="text-right py-2 pr-4">Status</th>
                      <th className="text-right py-2">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transactions?.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 pr-4 font-medium max-w-[150px] truncate">
                          {tx.proposalTitle ?? `#${tx.proposalId}`}
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{tx.buyerName ?? "-"}</td>
                        <td className="py-2.5 pr-4 text-right font-semibold">{formatRupiah(tx.amount)}</td>
                        <td className="py-2.5 pr-4 text-right">{formatRupiah(tx.sellerShare)}</td>
                        <td className="py-2.5 pr-4 text-right text-green-600">{formatRupiah(tx.platformShare)}</td>
                        <td className="py-2.5 pr-4 text-right">
                          <Badge variant={tx.paymentStatus === "paid" ? "default" : "secondary"}>
                            {tx.paymentStatus === "paid" ? "Lunas" : tx.paymentStatus === "failed" ? "Gagal" : "Pending"}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground whitespace-nowrap">
                          {new Date(tx.createdAt).toLocaleDateString("id-ID")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
