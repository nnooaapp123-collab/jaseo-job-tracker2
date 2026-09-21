import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/PmAuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatRupiah(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

type Deposit = {
  id: number;
  amount: number;
  status: string;
  note: string | null;
  created_at: string;
};

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];

export default function BuyerWallet() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [balance, setBalance] = useState<number | null>(null);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [paymentMode, setPaymentMode] = useState<string>("direct");

  useEffect(() => {
    if (!isLoading && !user) navigate("/login");
    if (!isLoading && user && user.role !== "buyer") navigate("/");
  }, [user, isLoading, navigate]);

  const load = useCallback(async () => {
    try {
      const [balRes, depRes, settingRes] = await Promise.all([
        fetch(`${BASE}/api/pm/wallet/balance`, { credentials: "include" }),
        fetch(`${BASE}/api/pm/wallet/deposits`, { credentials: "include" }),
        fetch(`${BASE}/api/pm/admin/settings`, { credentials: "include" }).catch(() => null),
      ]);
      if (balRes.ok) {
        const d = await balRes.json() as { balance: number };
        setBalance(d.balance);
      }
      if (depRes.ok) {
        const d = await depRes.json() as Deposit[];
        setDeposits(d);
      }
      if (settingRes?.ok) {
        const s = await settingRes.json() as Record<string, string>;
        setPaymentMode(s.payment_mode ?? "direct");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const handleDeposit = async () => {
    const num = parseInt(amount.replace(/\D/g, ""), 10);
    if (!num || num < 10000) {
      toast({ title: "Minimal deposit Rp10.000", variant: "destructive" });
      return;
    }
    setDepositing(true);
    try {
      const r = await fetch(`${BASE}/api/pm/wallet/deposit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: num }),
      });
      const data = await r.json() as { ok?: boolean; balance?: number; error?: string };
      if (r.ok) {
        setBalance(data.balance ?? null);
        setAmount("");
        toast({ title: `Saldo berhasil ditambahkan ${formatRupiah(num)}` });
        load();
      } else {
        toast({ title: data.error ?? "Deposit gagal", variant: "destructive" });
      }
    } finally {
      setDepositing(false);
    }
  };

  const statusLabel: Record<string, string> = {
    completed: "Berhasil",
    pending: "Diproses",
    failed: "Gagal",
  };

  const statusVariant: Record<string, "default" | "secondary" | "destructive"> = {
    completed: "default",
    pending: "secondary",
    failed: "destructive",
  };

  if (isLoading || loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-[40vh] text-muted-foreground">
          Memuat dompet…
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dompet Saya</h1>
          <p className="text-sm text-muted-foreground mt-1">Kelola saldo untuk pembelian proposal</p>
        </div>

        {/* Balance card */}
        <div className="bg-primary rounded-2xl p-6 text-white mb-6 shadow-lg">
          <p className="text-white/70 text-sm mb-1">Saldo tersedia</p>
          <div className="text-4xl font-bold tracking-tight">
            {balance !== null ? formatRupiah(balance) : "—"}
          </div>
          {paymentMode === "deposit" ? (
            <p className="text-white/70 text-xs mt-3">Mode: Wajib deposit saldo sebelum membeli</p>
          ) : (
            <p className="text-white/70 text-xs mt-3">Mode: Beli langsung via payment gateway</p>
          )}
        </div>

        {/* Top up form */}
        <div className="bg-white rounded-xl border p-6 shadow-sm mb-6">
          <h2 className="font-semibold mb-1">Tambah Saldo</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Isi saldo dompet Anda untuk digunakan membeli proposal.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {QUICK_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(String(a))}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                  amount === String(a)
                    ? "border-primary bg-primary text-white"
                    : "border-border hover:border-primary/50 hover:bg-accent"
                }`}
              >
                {formatRupiah(a)}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="amount" className="sr-only">Jumlah deposit</Label>
              <Input
                id="amount"
                placeholder="Atau masukkan nominal lain…"
                value={amount ? formatRupiah(parseInt(amount.replace(/\D/g, ""), 10) || 0).replace("Rp", "Rp ") : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "");
                  setAmount(raw);
                }}
              />
            </div>
            <Button onClick={handleDeposit} disabled={depositing || !amount}>
              {depositing ? "Memproses…" : "Deposit"}
            </Button>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
            Saat ini pembayaran menggunakan mode <strong>Demo/Sandbox</strong>. Integrasi Midtrans aktif setelah admin mengisi Client Key & Server Key di pengaturan.
          </div>
        </div>

        {/* History */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Riwayat Deposit</h2>
          </div>
          {deposits.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              Belum ada riwayat deposit.
            </div>
          ) : (
            <div className="divide-y">
              {deposits.map((d) => (
                <div key={d.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{formatRupiah(d.amount)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(d.created_at).toLocaleDateString("id-ID", {
                        day: "numeric", month: "long", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                      {d.note && ` • ${d.note}`}
                    </div>
                  </div>
                  <Badge variant={statusVariant[d.status] ?? "secondary"}>
                    {statusLabel[d.status] ?? d.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
