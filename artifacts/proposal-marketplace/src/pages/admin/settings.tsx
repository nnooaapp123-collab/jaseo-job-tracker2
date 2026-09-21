import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/PmAuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Settings = {
  payment_mode: string;
  midtrans_environment: string;
  midtrans_client_key: string;
  midtrans_server_key: string;
};

const DEFAULT: Settings = {
  payment_mode: "direct",
  midtrans_environment: "sandbox",
  midtrans_client_key: "",
  midtrans_server_key: "",
};

export default function AdminSettings() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && user?.role !== "admin") navigate("/");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    fetch(`${BASE}/api/pm/admin/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Partial<Settings>) => {
        setSettings({ ...DEFAULT, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const fetchSettings = async () => {
    try {
      const r = await fetch(`${BASE}/api/pm/admin/settings`, { credentials: "include" });
      const data = await r.json() as Partial<Settings>;
      setSettings({ ...DEFAULT, ...data });
    } catch {
      /* ignore */
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/pm/admin/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (r.ok) {
        await fetchSettings();
        toast({ title: "Pengaturan disimpan" });
      } else {
        toast({ title: "Gagal menyimpan", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-[40vh]">
          <div className="text-muted-foreground">Memuat pengaturan…</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Pengaturan Pembayaran</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Konfigurasi Midtrans dan mode pembayaran platform.
          </p>
        </div>

        <div className="space-y-6">
          {/* Payment Mode */}
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="font-semibold mb-1">Mode Pembayaran</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Pilih apakah pembeli bisa beli langsung atau harus deposit saldo dulu sebelum membeli.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              {[
                {
                  value: "direct",
                  label: "Beli Langsung",
                  desc: "Pembayaran dilakukan saat checkout via Midtrans",
                },
                {
                  value: "gabungan",
                  label: "Gabungan (Midtrans + Saldo)",
                  desc: "Pembeli bisa bayar via Midtrans, pakai saldo, atau kombinasi keduanya",
                },
                {
                  value: "deposit",
                  label: "Wajib Deposit Saldo",
                  desc: "Pembeli harus isi saldo dompet dulu, lalu bayar dengan saldo",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSettings((s) => ({ ...s, payment_mode: opt.value }))}
                  className={`flex-1 text-left rounded-lg border-2 p-4 transition-all cursor-pointer ${
                    settings.payment_mode === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${settings.payment_mode === opt.value ? "border-primary" : "border-muted-foreground"}`}>
                      {settings.payment_mode === opt.value && (
                        <div className="w-2 h-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <span className="font-medium text-sm">{opt.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-6">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Midtrans Config */}
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="font-semibold mb-1">Konfigurasi Midtrans</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Masukkan API key dari dashboard{" "}
              <a href="https://midtrans.com" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Midtrans
              </a>. Gunakan mode Sandbox untuk testing.
            </p>

            {/* Environment */}
            <div className="mb-5">
              <Label className="mb-2 block text-sm">Lingkungan Midtrans</Label>
              <div className="flex gap-3">
                {[
                  { value: "sandbox", label: "Sandbox (Testing)" },
                  { value: "production", label: "Production (Live)" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, midtrans_environment: opt.value }))}
                    className={`flex-1 py-2 px-4 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${
                      settings.midtrans_environment === opt.value
                        ? "border-primary bg-primary text-white"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="client-key" className="mb-1 block text-sm">
                  Client Key <span className="text-muted-foreground font-normal">(digunakan di frontend)</span>
                </Label>
                <Input
                  id="client-key"
                  placeholder={settings.midtrans_environment === "sandbox" ? "SB-Mid-client-xxxx" : "Mid-client-xxxx"}
                  value={settings.midtrans_client_key}
                  onChange={(e) => setSettings((s) => ({ ...s, midtrans_client_key: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="server-key" className="mb-1 block text-sm">
                  Server Key <span className="text-muted-foreground font-normal">(digunakan di backend)</span>
                </Label>
                <Input
                  id="server-key"
                  type="password"
                  placeholder={settings.midtrans_environment === "sandbox" ? "SB-Mid-server-xxxx" : "Mid-server-xxxx"}
                  value={settings.midtrans_server_key}
                  onChange={(e) => setSettings((s) => ({ ...s, midtrans_server_key: e.target.value }))}
                />
                <p className="text-xs text-amber-600 mt-1">
                  Untuk keamanan production, lebih disarankan menyimpan Server Key sebagai environment variable <code>MIDTRANS_SERVER_KEY</code>.
                </p>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <p className="font-semibold mb-1">Cara mendapatkan API Key Midtrans</p>
            <ol className="list-decimal pl-4 space-y-1 text-blue-700">
              <li>Login ke <a href="https://dashboard.midtrans.com" target="_blank" rel="noopener noreferrer" className="underline">dashboard.midtrans.com</a></li>
              <li>Pilih environment Sandbox (untuk testing) atau Production</li>
              <li>Buka menu Settings → Access Keys</li>
              <li>Salin Client Key dan Server Key ke form di atas</li>
            </ol>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="px-8">
              {saving ? "Menyimpan…" : "Simpan Pengaturan"}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
