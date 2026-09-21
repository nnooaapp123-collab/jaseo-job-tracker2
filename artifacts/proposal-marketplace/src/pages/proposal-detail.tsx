import { useState, useEffect } from "react";
import { useParams, useLocation, Link } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatRupiah } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPmProposal,
  useCreatePmTransaction,
  useGetPmDownloadToken,
  useModeratePmProposal,
  getGetPmProposalQueryKey,
  getGetPmDownloadTokenQueryKey,
} from "@workspace/api-client-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Review",
  active: "Aktif",
  rejected: "Ditolak",
  draft: "Draft",
  archived: "Diarsipkan",
};

export default function ProposalDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transactionId, setTransactionId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [balance, setBalance] = useState(0);
  const [payMethod, setPayMethod] = useState<"direct" | "wallet" | "hybrid">("direct");
  const [paying, setPaying] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [paymentMode, setPaymentMode] = useState<"direct" | "gabungan" | "deposit">("direct");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null);

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${BASE}/api/pm/payment-mode`)
      .then((r) => r.json())
      .then((d: { payment_mode: string }) => {
        const m = d.payment_mode;
        if (m === "gabungan" || m === "deposit") setPaymentMode(m);
        else setPaymentMode("direct");
      })
      .catch(() => {});
  }, [BASE]);

  useEffect(() => {
    if (paymentMode === "deposit" && payMethod === "direct") {
      setPayMethod(balance > 0 ? "hybrid" : "wallet");
    } else if (paymentMode === "direct") {
      setPayMethod("direct");
    }
  }, [paymentMode, balance]);

  useEffect(() => {
    if (user?.role === "buyer") {
      fetch(`${BASE}/api/pm/wallet/balance`, { credentials: "include" })
        .then((r) => r.json())
        .then((d: { balance: number }) => setBalance(d.balance ?? 0))
        .catch(() => {});
    }
  }, [user, BASE]);

  const handleWalletPay = async (walletAmount: number) => {
    setPaying(true);
    try {
      const r = await fetch(`${BASE}/api/pm/wallet/pay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: id, walletAmount }),
      });
      const data = await r.json() as { txId?: number; paymentId?: string; remaining?: number; paid?: boolean; error?: string };
      if (!r.ok) {
        toast({ title: data.error ?? "Pembayaran gagal", variant: "destructive" });
        return;
      }
      if (data.paid) {
        setTransactionId(data.txId!);
      } else {
        navigate(`/payment/stub?paymentId=${data.paymentId}&txId=${data.txId}&proposalId=${id}`);
      }
    } catch {
      toast({ title: "Terjadi kesalahan", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };
  const moderate = useModeratePmProposal();

  const { data: proposal, isLoading } = useGetPmProposal(id, {
    query: { enabled: !!id, queryKey: getGetPmProposalQueryKey(id) },
  });

  const createTransaction = useCreatePmTransaction();

  const { data: downloadData } = useGetPmDownloadToken(transactionId ?? 0, {
    query: {
      enabled: transactionId !== null,
      queryKey: getGetPmDownloadTokenQueryKey(transactionId ?? 0),
    },
  });

  type FeeType = "flat" | "percent" | "percent_plus_flat";
  interface PaymentMethodDef {
    id: string; label: string; group: string; feeType: FeeType;
    feeAmount?: number; feeRate?: number; feeFixed?: number; minFee?: number;
  }
  const PAYMENT_METHODS: PaymentMethodDef[] = [
    { id: "bca_va",       label: "BCA Virtual Account",     group: "Transfer Bank", feeType: "flat",              feeAmount: 4000 },
    { id: "bni_va",       label: "BNI Virtual Account",     group: "Transfer Bank", feeType: "flat",              feeAmount: 4000 },
    { id: "bri_va",       label: "BRI Virtual Account",     group: "Transfer Bank", feeType: "flat",              feeAmount: 4000 },
    { id: "mandiri_bill", label: "Mandiri Bill Payment",    group: "Transfer Bank", feeType: "flat",              feeAmount: 4000 },
    { id: "permata_va",   label: "Permata Virtual Account", group: "Transfer Bank", feeType: "flat",              feeAmount: 4000 },
    { id: "other_va",     label: "Bank Lainnya (VA)",       group: "Transfer Bank", feeType: "flat",              feeAmount: 4000 },
    { id: "gopay",        label: "GoPay",                   group: "E-Wallet",      feeType: "percent",           feeRate: 0.02 },
    { id: "shopeepay",    label: "ShopeePay",               group: "E-Wallet",      feeType: "percent",           feeRate: 0.02 },
    { id: "qris",         label: "QRIS",                    group: "E-Wallet",      feeType: "percent",           feeRate: 0.007, minFee: 300 },
    { id: "credit_card",  label: "Kartu Kredit",            group: "Kartu",         feeType: "percent_plus_flat", feeRate: 0.029, feeFixed: 2000 },
    { id: "alfamart",     label: "Alfamart",                group: "Gerai Ritel",   feeType: "flat",              feeAmount: 5000 },
    { id: "indomaret",    label: "Indomaret",               group: "Gerai Ritel",   feeType: "flat",              feeAmount: 5000 },
  ];
  const calcFee = (m: PaymentMethodDef, base: number): number => {
    if (m.feeType === "flat") return m.feeAmount ?? 0;
    if (m.feeType === "percent") return Math.max(m.minFee ?? 0, Math.ceil(base * (m.feeRate ?? 0)));
    return Math.ceil(base * (m.feeRate ?? 0)) + (m.feeFixed ?? 0);
  };
  const formatFeeLabel = (m: PaymentMethodDef, base: number): string => {
    if (m.feeType === "flat") return formatRupiah(m.feeAmount ?? 0);
    if (m.feeType === "percent") return `${((m.feeRate ?? 0) * 100).toFixed(1).replace(/\.0$/, "")}%`;
    return `${((m.feeRate ?? 0) * 100).toFixed(1).replace(/\.0$/, "")}% + ${formatRupiah(m.feeFixed ?? 0)}`;
  };

  const handleBuy = () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (user.role !== "buyer") {
      toast({ title: "Hanya pembeli yang bisa membeli", variant: "destructive" });
      return;
    }
    const methodDef = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod);
    const fee = methodDef ? calcFee(methodDef, proposal?.price ?? 0) : 0;
    createTransaction.mutate(
      { data: { proposalId: id, paymentMethod: selectedPaymentMethod ?? undefined, paymentFee: fee } },
      {
        onSuccess: (tx) => {
          navigate(`/payment/stub?paymentId=${tx.paymentId}&txId=${tx.id}&proposalId=${id}&method=${selectedPaymentMethod ?? ""}&fee=${fee}`);
        },
        onError: () => {
          toast({ title: "Gagal membuat pesanan", variant: "destructive" });
        },
      }
    );
  };

  const handleModerate = (status: "active" | "rejected") => {
    moderate.mutate(
      { id, data: { status, adminNote: adminNote || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPmProposalQueryKey(id) });
          toast({ title: status === "active" ? "Proposal disetujui dan dipublikasikan" : "Proposal ditolak" });
          setAdminNote("");
        },
        onError: () => toast({ title: "Gagal memproses", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-10 grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-video rounded-lg" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!proposal) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-20 text-center">
          <p className="text-lg text-muted-foreground">Proposal tidak ditemukan.</p>
          <Link href="/browse"><Button className="mt-4">Kembali ke Browse</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            {/* Image gallery — up to 3 preview images */}
            {(() => {
              const imgUrls = [
                proposal.previewImageKey ? `/api/pm/proposals/${id}/preview-image` : null,
                proposal.previewImageKey2 ? `/api/pm/proposals/${id}/preview-image-2` : null,
                proposal.previewImageKey3 ? `/api/pm/proposals/${id}/preview-image-3` : null,
              ].filter(Boolean) as string[];
              const safeIdx = Math.min(activeImg, Math.max(imgUrls.length - 1, 0));
              return (
                <div className="space-y-2">
                  <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl overflow-hidden">
                    {imgUrls.length > 0 ? (
                      <img
                        src={imgUrls[safeIdx]}
                        alt={`${proposal.title} — gambar ${safeIdx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                          <svg className="w-16 h-16 text-primary/30 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <p className="text-sm text-muted-foreground">Dokumen Proposal</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {imgUrls.length > 1 && (
                    <div className="flex gap-2">
                      {imgUrls.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setActiveImg(idx)}
                          className={`w-16 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${safeIdx === idx ? "border-primary" : "border-transparent opacity-60 hover:opacity-90"}`}
                        >
                          <img src={url} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-4 p-4 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Tentang Seller</p>
              <p className="text-sm font-medium">{proposal.sellerName ?? "Seller Anonim"}</p>
            </div>

            {/* Admin / seller: tombol lihat file proposal */}
            {(user?.role === "admin" || (user?.role === "seller" && (proposal as unknown as { sellerId: number }).sellerId === user?.id)) && (proposal as unknown as { hasFile: boolean }).hasFile && (
              <div className="mt-3">
                <a
                  href={`/api/pm/proposals/${id}/admin-file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Unduh / Lihat File Proposal
                </a>
                <p className="text-xs text-muted-foreground mt-0.5">Hanya terlihat oleh admin dan seller</p>
              </div>
            )}
          </div>

          <div className="flex flex-col">
            <div className="flex gap-2 flex-wrap mb-3">
              {proposal.categoryName && (
                <Badge variant="secondary">{proposal.categoryName}</Badge>
              )}
              <Badge variant={proposal.status === "active" ? "default" : proposal.status === "rejected" ? "destructive" : "secondary"}>
                {STATUS_LABEL[proposal.status] ?? proposal.status}
              </Badge>
            </div>

            <h1 className="text-2xl font-bold leading-tight mb-3">{proposal.title}</h1>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">{proposal.description}</p>

            <div className="flex items-center gap-4 mb-6 text-sm text-muted-foreground">
              <span>{proposal.totalSales} kali terjual</span>
              <span>Diunggah {new Date(proposal.createdAt).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}</span>
            </div>

            {/* Panel moderasi khusus admin */}
            {user?.role === "admin" && proposal.status === "pending" && (
              <div className="border-2 border-amber-300 bg-amber-50 rounded-xl p-5 mb-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">Panel Moderasi Admin</p>
                <p className="text-xs text-amber-700">Tinjau proposal di atas lalu setujui atau tolak.</p>
                <Textarea
                  placeholder="Catatan untuk seller (opsional untuk penolakan)"
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={2}
                  className="text-sm bg-white"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleModerate("active")}
                    disabled={moderate.isPending}
                    className="flex-1"
                  >
                    Setujui & Publikasikan
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleModerate("rejected")}
                    disabled={moderate.isPending}
                    className="flex-1"
                  >
                    Tolak Proposal
                  </Button>
                </div>
                <Link href="/admin/proposals">
                  <span className="text-xs text-amber-700 hover:underline cursor-pointer">← Kembali ke daftar moderasi</span>
                </Link>
              </div>
            )}

            {user?.role === "admin" && proposal.status !== "pending" && (
              <div className="border rounded-xl p-4 mb-4 bg-muted/30 text-sm">
                <p className="font-medium mb-1">Info Admin</p>
                <p className="text-muted-foreground">Status: <span className="font-medium">{STATUS_LABEL[proposal.status] ?? proposal.status}</span></p>
                <Link href="/admin/proposals">
                  <span className="text-xs text-primary hover:underline cursor-pointer mt-1 block">← Kembali ke daftar moderasi</span>
                </Link>
              </div>
            )}

            <div className="border rounded-xl p-5 bg-white">
              <div className="text-3xl font-bold text-primary mb-4">
                {formatRupiah(proposal.price)}
              </div>

              {user?.role === "admin" ? (
                <Button className="w-full" size="lg" disabled variant="outline">
                  Admin tidak membeli proposal
                </Button>
              ) : transactionId && downloadData ? (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 font-medium">
                    Pembayaran berhasil! Proposal siap diunduh.
                  </div>
                  <a href={downloadData.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Button className="w-full" size="lg">Unduh Proposal</Button>
                  </a>
                </div>
              ) : proposal.status === "active" && user?.role === "buyer" ? (
                <div className="space-y-3">
                  {/* payment_mode: "deposit" → hanya saldo/gabungan; "gabungan" → semua tab; "direct" → hanya Midtrans */}

                  {/* Info mode deposit */}
                  {paymentMode === "deposit" && balance === 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                      Platform menggunakan mode deposit. Isi saldo dompet Anda terlebih dahulu sebelum membeli.
                    </div>
                  )}

                  {/* Tabs — tampil sesuai paymentMode */}
                  {(() => {
                    const showMidtrans = paymentMode !== "deposit";
                    const showWallet = (paymentMode === "gabungan" || paymentMode === "deposit") && balance >= proposal.price;
                    const showHybrid = (paymentMode === "gabungan" || paymentMode === "deposit") && balance > 0 && balance < proposal.price;
                    const tabCount = [showMidtrans, showWallet, showHybrid].filter(Boolean).length;
                    if (tabCount <= 1) return null;
                    return (
                      <div className="flex rounded-lg bg-muted p-1 gap-1">
                        {showMidtrans && (
                          <button
                            type="button"
                            onClick={() => setPayMethod("direct")}
                            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${payMethod === "direct" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            Midtrans
                          </button>
                        )}
                        {showWallet && (
                          <button
                            type="button"
                            onClick={() => setPayMethod("wallet")}
                            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${payMethod === "wallet" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            Pakai Saldo
                          </button>
                        )}
                        {showHybrid && (
                          <button
                            type="button"
                            onClick={() => setPayMethod("hybrid")}
                            className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all cursor-pointer ${payMethod === "hybrid" ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            Gabungan
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Breakdown for hybrid */}
                  {payMethod === "hybrid" && balance > 0 && (
                    <div className="bg-blue-50 rounded-lg p-3 text-xs space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Dari saldo</span>
                        <span className="font-medium text-foreground">{formatRupiah(balance)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Via Midtrans</span>
                        <span className="font-medium text-foreground">{formatRupiah(proposal.price - balance)}</span>
                      </div>
                    </div>
                  )}

                  {/* Saldo info for wallet mode */}
                  {payMethod === "wallet" && (
                    <div className="bg-green-50 rounded-lg p-3 text-xs text-green-800">
                      Bayar penuh dengan saldo dompet — tidak perlu ke halaman pembayaran.
                    </div>
                  )}

                  {payMethod === "direct" && (() => {
                    if (!proposal) return null;
                    const groups = Array.from(new Set(PAYMENT_METHODS.map(m => m.group)));
                    const selectedDef = PAYMENT_METHODS.find(m => m.id === selectedPaymentMethod);
                    const fee = selectedDef ? calcFee(selectedDef, proposal.price) : 0;
                    if (!selectedPaymentMethod) {
                      return (
                        <div className="space-y-3">
                          <p className="text-xs font-medium text-muted-foreground">Pilih metode pembayaran:</p>
                          {groups.map(group => (
                            <div key={group}>
                              <p className="text-xs text-muted-foreground mb-1">{group}</p>
                              <div className="space-y-1">
                                {PAYMENT_METHODS.filter(m => m.group === group).map(m => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setSelectedPaymentMethod(m.id)}
                                    className="w-full flex items-center justify-between text-sm px-3 py-2 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all cursor-pointer text-left"
                                  >
                                    <span className="font-medium">{m.label}</span>
                                    <span className="text-xs text-muted-foreground shrink-0 ml-2">+{formatFeeLabel(m, proposal.price)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        <div className="bg-muted/40 rounded-xl p-3 text-sm space-y-1.5">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Harga proposal</span>
                            <span className="font-medium text-foreground">{formatRupiah(proposal.price)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Biaya layanan ({selectedDef?.label})</span>
                            <span className="font-medium text-foreground">{formatRupiah(fee)}</span>
                          </div>
                          <div className="border-t pt-1.5 flex justify-between font-bold text-base">
                            <span>Total pembayaran</span>
                            <span className="text-primary">{formatRupiah(proposal.price + fee)}</span>
                          </div>
                        </div>
                        <Button
                          className="w-full"
                          size="lg"
                          onClick={handleBuy}
                          disabled={createTransaction.isPending || paying}
                        >
                          {createTransaction.isPending ? "Memproses..." : `Bayar ${formatRupiah(proposal.price + fee)}`}
                        </Button>
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentMethod(null)}
                          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                          ← Ganti metode pembayaran
                        </button>
                      </div>
                    );
                  })()}
                  {payMethod === "wallet" && (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => handleWalletPay(proposal.price)}
                      disabled={paying}
                    >
                      {paying ? "Memproses..." : `Bayar dengan Saldo (${formatRupiah(proposal.price)})`}
                    </Button>
                  )}
                  {payMethod === "hybrid" && (
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => handleWalletPay(balance)}
                      disabled={paying}
                    >
                      {paying ? "Memproses..." : `Pakai Saldo + Lanjut ke Midtrans`}
                    </Button>
                  )}
                </div>
              ) : proposal.status === "active" ? (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleBuy}
                  disabled={!user}
                >
                  {!user ? "Masuk untuk Membeli" : "Hanya Pembeli yang Bisa Membeli"}
                </Button>
              ) : (
                <Button className="w-full" size="lg" disabled>
                  Tidak Tersedia
                </Button>
              )}

              {!user && (
                <p className="text-xs text-center text-muted-foreground mt-3">
                  <Link href="/login"><span className="text-primary cursor-pointer hover:underline">Masuk</span></Link> atau{" "}
                  <Link href="/register"><span className="text-primary cursor-pointer hover:underline">daftar</span></Link> sebagai pembeli
                </p>
              )}

              {/* Fee breakdown — hanya untuk seller sendiri atau admin */}
              {(user?.role === "admin" || (user?.role === "seller" && (proposal as unknown as { sellerId: number }).sellerId === user?.id)) && (
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground text-xs mb-1">Rincian Fee</p>
                  <div className="flex justify-between">
                    <span>Bagian seller (65%)</span>
                    <span>{formatRupiah(Math.floor(proposal.price * 0.65))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Biaya platform (35%)</span>
                    <span>{formatRupiah(proposal.price - Math.floor(proposal.price * 0.65))}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
