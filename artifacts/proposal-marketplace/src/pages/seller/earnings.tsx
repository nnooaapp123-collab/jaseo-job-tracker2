import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatRupiah } from "@/lib/format";
import {
  useGetPmSellerStats,
  useListMyPayouts,
  useRequestPmPayout,
  getGetPmSellerStatsQueryKey,
  getListMyPayoutsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const PAYOUT_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Menunggu", variant: "outline" },
  approved: { label: "Disetujui", variant: "default" },
  paid: { label: "Dibayar", variant: "default" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

function BankCard() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    bankName: user?.bankName ?? "",
    bankAccount: user?.bankAccount ?? "",
    accountOwner: user?.accountOwner ?? "",
  });

  const hasBank = !!(user?.bankAccount);

  const handleEdit = () => {
    setForm({
      bankName: user?.bankName ?? "",
      bankAccount: user?.bankAccount ?? "",
      accountOwner: user?.accountOwner ?? "",
    });
    setEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bankAccount.trim()) {
      toast({ title: "Nomor rekening wajib diisi", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/pm/profile/bank", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bankName: form.bankName.trim() || null,
          bankAccount: form.bankAccount.trim() || null,
          accountOwner: form.accountOwner.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      await refetch();
      setEditing(false);
      toast({ title: "Rekening berhasil disimpan" });
    } catch {
      toast({ title: "Gagal menyimpan rekening", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Rekening Bank</CardTitle>
        {!editing && (
          <Button size="sm" variant="outline" onClick={handleEdit}>
            {hasBank ? "Edit" : "Tambah Rekening"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <Label htmlFor="bankName" className="text-xs text-muted-foreground mb-1 block">Nama Bank</Label>
              <Input
                id="bankName"
                placeholder="Contoh: BCA, BRI, Mandiri"
                value={form.bankName}
                onChange={(e) => setForm(f => ({ ...f, bankName: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="bankAccount" className="text-xs text-muted-foreground mb-1 block">Nomor Rekening <span className="text-red-500">*</span></Label>
              <Input
                id="bankAccount"
                placeholder="Nomor rekening"
                value={form.bankAccount}
                onChange={(e) => setForm(f => ({ ...f, bankAccount: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="accountOwner" className="text-xs text-muted-foreground mb-1 block">Nama Pemilik Rekening</Label>
              <Input
                id="accountOwner"
                placeholder="Nama sesuai buku tabungan"
                value={form.accountOwner}
                onChange={(e) => setForm(f => ({ ...f, accountOwner: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Menyimpan..." : "Simpan"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Batal
              </Button>
            </div>
          </form>
        ) : hasBank ? (
          <div className="space-y-1">
            {user?.bankName && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-28 shrink-0">Bank</span>
                <span className="font-medium">{user.bankName}</span>
              </div>
            )}
            <div className="flex gap-2 text-sm">
              <span className="text-muted-foreground w-28 shrink-0">No. Rekening</span>
              <span className="font-medium font-mono">{user?.bankAccount}</span>
            </div>
            {user?.accountOwner && (
              <div className="flex gap-2 text-sm">
                <span className="text-muted-foreground w-28 shrink-0">Atas Nama</span>
                <span className="font-medium">{user.accountOwner}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Belum ada rekening terdaftar. Tambahkan rekening bank agar admin bisa mentransfer dana penarikan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SellerEarnings() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");

  const { data: stats, isLoading: statsLoading } = useGetPmSellerStats({
    query: { enabled: !!user && user.role === "seller", queryKey: getGetPmSellerStatsQueryKey() },
  });
  const { data: payouts, isLoading: payoutsLoading } = useListMyPayouts({
    query: { enabled: !!user && user.role === "seller", queryKey: getListMyPayoutsQueryKey() },
  });
  const requestPayout = useRequestPmPayout();

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "seller") {
    navigate("/login");
    return null;
  }

  const handleRequestPayout = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt < 50000) {
      toast({ title: "Minimum penarikan Rp 50.000", variant: "destructive" });
      return;
    }
    requestPayout.mutate(
      { data: { amount: amt } },
      {
        onSuccess: () => {
          setAmount("");
          queryClient.invalidateQueries({ queryKey: getListMyPayoutsQueryKey() });
          toast({ title: "Permintaan penarikan dikirim!", description: "Admin akan memproses dalam 1-3 hari kerja." });
        },
        onError: () => toast({ title: "Gagal mengajukan penarikan", variant: "destructive" }),
      }
    );
  };

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Pendapatan & Penarikan</h1>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {statsLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
          ) : (
            <>
              <Card><CardContent className="p-4">
                <div className="text-lg font-bold">{formatRupiah(stats?.totalEarnings ?? 0)}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Pendapatan</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-lg font-bold text-green-600">{formatRupiah(stats?.availableBalance ?? 0)}</div>
                <div className="text-xs text-muted-foreground mt-1">Saldo Tersedia</div>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <div className="text-lg font-bold text-amber-600">{formatRupiah(stats?.pendingPayouts ?? 0)}</div>
                <div className="text-xs text-muted-foreground mt-1">Dalam Proses</div>
              </CardContent></Card>
            </>
          )}
        </div>

        <BankCard />

        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Ajukan Penarikan</CardTitle></CardHeader>
          <CardContent>
            {!user.bankAccount && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
                Lengkapi rekening bank kamu terlebih dahulu sebelum mengajukan penarikan.
              </div>
            )}
            <form onSubmit={handleRequestPayout} className="flex gap-3">
              <div className="flex-1">
                <Label htmlFor="amount" className="text-xs text-muted-foreground mb-1 block">
                  Jumlah (min. Rp 50.000, maks. {formatRupiah(stats?.availableBalance ?? 0)})
                </Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Jumlah penarikan"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={50000}
                  max={stats?.availableBalance ?? 0}
                />
              </div>
              <div className="pt-5">
                <Button
                  type="submit"
                  disabled={requestPayout.isPending || !stats?.availableBalance}
                >
                  {requestPayout.isPending ? "Memproses..." : "Ajukan"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Riwayat Penarikan</CardTitle></CardHeader>
          <CardContent>
            {payoutsLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : payouts?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Belum ada riwayat penarikan.</p>
            ) : (
              <div className="divide-y">
                {payouts?.map((p) => {
                  const statusInfo = PAYOUT_STATUS[p.status] ?? { label: p.status, variant: "secondary" as const };
                  return (
                    <div key={p.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{formatRupiah(p.amount)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(p.requestedAt).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}
                        </p>
                        {p.adminNote && <p className="text-xs text-muted-foreground italic mt-0.5">{p.adminNote}</p>}
                        {p.transferProofKey && (
                          <a
                            href={`/api/pm/payouts/${p.id}/proof-image`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 underline mt-1 block"
                          >
                            Lihat bukti transfer
                          </a>
                        )}
                      </div>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
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
