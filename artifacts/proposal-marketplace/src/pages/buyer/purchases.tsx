import { Link, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRupiah } from "@/lib/format";
import {
  useListMyPurchases,
  useGetPmDownloadToken,
  getListMyPurchasesQueryKey,
  getGetPmDownloadTokenQueryKey,
} from "@workspace/api-client-react";
import type { PmTransaction } from "@workspace/api-client-react";

function PurchaseRow({ transaction }: { transaction: PmTransaction }) {
  const [, navigate] = useLocation();
  const isPaid = transaction.paymentStatus === "paid";

  const { data: downloadData } = useGetPmDownloadToken(transaction.id, {
    query: {
      enabled: isPaid,
      queryKey: getGetPmDownloadTokenQueryKey(transaction.id),
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <Link href={`/proposals/${transaction.proposalId}`}>
              <p className="font-medium text-sm hover:text-primary cursor-pointer line-clamp-1">
                {transaction.proposalTitle ?? `Proposal #${transaction.proposalId}`}
              </p>
            </Link>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(transaction.createdAt).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="font-semibold text-sm">{formatRupiah(transaction.amount)}</span>
            <Badge variant={isPaid ? "default" : "secondary"}>
              {isPaid ? "Lunas" : "Menunggu"}
            </Badge>
            {isPaid && downloadData ? (
              <a href={downloadData.downloadUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm">Unduh</Button>
              </a>
            ) : isPaid ? (
              <Skeleton className="h-8 w-20" />
            ) : transaction.paymentId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/payment/stub?paymentId=${transaction.paymentId}&txId=${transaction.id}&proposalId=${transaction.proposalId}`)}
              >
                Bayar
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BuyerPurchases() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: purchases, isLoading } = useListMyPurchases({
    query: {
      enabled: !!user && user.role === "buyer",
      queryKey: getListMyPurchasesQueryKey(),
      staleTime: 0,
      refetchOnMount: "always",
    },
  });

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "buyer") {
    navigate("/login");
    return null;
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Pembelian Saya</h1>
          <Link href="/browse"><Button variant="outline" size="sm">Cari Proposal</Button></Link>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : purchases?.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg mb-2">Belum ada pembelian</p>
            <p className="text-sm mb-4">Jelajahi proposal dan beli yang Anda butuhkan</p>
            <Link href="/browse"><Button>Mulai Belanja</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">
            {purchases?.map((tx) => (
              <PurchaseRow key={tx.id} transaction={tx} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
