import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatRupiah } from "@/lib/format";
import { useGetPmProposal, getGetPmProposalQueryKey } from "@workspace/api-client-react";

const METHOD_LABELS: Record<string, string> = {
  bca_va:       "BCA Virtual Account",
  bni_va:       "BNI Virtual Account",
  bri_va:       "BRI Virtual Account",
  mandiri_bill: "Mandiri Bill Payment",
  permata_va:   "Permata Virtual Account",
  other_va:     "Bank Lainnya (VA)",
  gopay:        "GoPay",
  shopeepay:    "ShopeePay",
  qris:         "QRIS",
  credit_card:  "Kartu Kredit",
  alfamart:     "Alfamart",
  indomaret:    "Indomaret",
};

export default function StubPaymentPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const searchParams = new URLSearchParams(window.location.search);
  const paymentId = searchParams.get("paymentId") ?? "";
  const txId = searchParams.get("txId") ?? "";
  const proposalId = Number(searchParams.get("proposalId") ?? "0");
  const methodKey = searchParams.get("method") ?? "";
  const fee = Number(searchParams.get("fee") ?? "0");
  const methodLabel = methodKey ? (METHOD_LABELS[methodKey] ?? methodKey) : null;

  const { data: proposal } = useGetPmProposal(proposalId, {
    query: { enabled: !!proposalId, queryKey: getGetPmProposalQueryKey(proposalId) },
  });

  useEffect(() => {
    if (!paymentId || !txId) {
      navigate("/browse");
    }
  }, [paymentId, txId, navigate]);

  const handlePay = async () => {
    setIsProcessing(true);
    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${BASE}/api/pm/payments/stub-initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId }),
        credentials: "include",
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Gagal" }));
        throw new Error(err.error ?? "Pembayaran gagal");
      }

      setIsPaid(true);
      toast({ title: "Pembayaran berhasil!", description: "Proposal siap diunduh." });

      // Langsung ambil download token agar tombol unduh muncul di sini
      try {
        const tokenResp = await fetch(`${BASE}/api/pm/transactions/${txId}/download-token`, {
          credentials: "include",
        });
        if (tokenResp.ok) {
          const tokenData = await tokenResp.json();
          setDownloadUrl(tokenData.downloadUrl ?? null);
        }
      } catch { /* abaikan — user tetap bisa unduh via halaman pembelian */ }
    } catch (err) {
      toast({
        title: "Gagal memproses pembayaran",
        description: err instanceof Error ? err.message : "Coba lagi",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const basePrice = proposal?.price ?? 0;
  const total = basePrice + fee;

  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="border rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-primary px-6 py-4">
            <p className="text-xs text-primary-foreground/70 font-medium uppercase tracking-wider">Simulasi Gateway Pembayaran</p>
            <h1 className="text-xl font-bold text-primary-foreground mt-1">ProposalHub Pay</h1>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Membeli</p>
              <p className="font-semibold text-base">{proposal?.title ?? "Proposal"}</p>
              {proposal?.sellerName && (
                <p className="text-sm text-muted-foreground">oleh {proposal.sellerName}</p>
              )}
            </div>

            {methodLabel && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                <span>Metode pembayaran:</span>
                <span className="font-medium text-foreground">{methodLabel}</span>
              </div>
            )}

            <div className="bg-muted/40 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Harga proposal</span>
                <span className="font-medium">{proposal ? formatRupiah(basePrice) : "—"}</span>
              </div>
              {fee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Biaya layanan {methodLabel ? `(${methodLabel})` : ""}</span>
                  <span className="font-medium">{formatRupiah(fee)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total pembayaran</span>
                <span className="text-primary">{proposal ? formatRupiah(total) : "—"}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <strong>Mode Simulasi</strong> — Ini adalah gateway pembayaran stub. Klik tombol di bawah untuk mensimulasikan pembayaran berhasil.
            </div>

            <div className="text-xs text-muted-foreground font-mono bg-muted/30 rounded p-2 break-all">
              ID Pembayaran: {paymentId}
            </div>

            {isPaid ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 font-medium text-center">
                  Pembayaran berhasil!
                </div>
                {downloadUrl ? (
                  <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="block">
                    <Button className="w-full" size="lg">
                      Unduh Proposal Sekarang
                    </Button>
                  </a>
                ) : (
                  <div className="text-xs text-center text-muted-foreground animate-pulse">Menyiapkan link unduhan...</div>
                )}
                <Button variant="outline" className="w-full" onClick={() => navigate("/buyer/purchases")}>
                  Lihat Semua Pembelian
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <Button className="w-full" size="lg" onClick={handlePay} disabled={isProcessing}>
                  {isProcessing ? "Memproses..." : `Bayar ${proposal ? formatRupiah(total) : "Sekarang"} (Simulasi)`}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => navigate(`/proposals/${proposalId}`)}>
                  Batal
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
