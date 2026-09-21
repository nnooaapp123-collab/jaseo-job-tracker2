import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/PmAuthContext";
import { useRequestUploadUrl } from "@workspace/api-client-react";
import { SITE_IDENTITY_KEY } from "@/hooks/useSiteIdentity";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type IdentitySettings = {
  site_title: string;
  site_tagline: string;
  site_description: string;
  footer_brand: string;
  footer_text: string;
  footer_note: string;
  logo_key: string;
  favicon_key: string;
};

const DEFAULT: IdentitySettings = {
  site_title: "ProposalHub",
  site_tagline: "Marketplace Proposal Bisnis Indonesia",
  site_description: "ProposalHub: Marketplace proposal bisnis terpercaya. Temukan, beli, dan jual proposal bisnis berkualitas tinggi.",
  footer_brand: "ProposalHub",
  footer_text: "Marketplace proposal bisnis terpercaya Indonesia",
  footer_note: "Platform mengambil 35% per transaksi. Seller mendapat 65%.",
  logo_key: "",
  favicon_key: "",
};

export default function AdminSiteIdentity() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const requestUploadUrl = useRequestUploadUrl();

  const [settings, setSettings] = useState<IdentitySettings>(DEFAULT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [bust, setBust] = useState(Date.now());
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoading && user?.role !== "admin") navigate("/");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    fetch(`${BASE}/api/pm/admin/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: Partial<IdentitySettings>) => {
        setSettings({ ...DEFAULT, ...data });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const uploadFile = async (file: File): Promise<string> => {
    const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
      requestUploadUrl.mutate(
        { data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } },
        {
          onSuccess: (data) => resolve(data as { uploadURL: string; objectPath: string }),
          onError: reject,
        }
      );
    });
    const putResp = await fetch(result.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    if (!putResp.ok) {
      throw new Error(`Upload gagal (${putResp.status})`);
    }
    return result.objectPath;
  };

  const handleAssetChange = async (kind: "logo" | "favicon", file: File | null) => {
    if (!file) return;
    const setUploading = kind === "logo" ? setUploadingLogo : setUploadingFavicon;
    setUploading(true);
    try {
      const objectPath = await uploadFile(file);
      const patchKey = kind === "logo" ? "logo_key" : "favicon_key";
      const r = await fetch(`${BASE}/api/pm/admin/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [patchKey]: objectPath }),
      });
      if (!r.ok) throw new Error("Gagal menyimpan");
      setSettings((s) => ({ ...s, [patchKey]: objectPath }));
      setBust(Date.now());
      await queryClient.invalidateQueries({ queryKey: SITE_IDENTITY_KEY });
      toast({ title: `${kind === "logo" ? "Logo" : "Favicon"} berhasil diunggah` });
    } catch (err) {
      toast({
        title: "Gagal mengunggah",
        description: err instanceof Error ? err.message : "Coba lagi",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removeAsset = async (kind: "logo" | "favicon") => {
    const patchKey = kind === "logo" ? "logo_key" : "favicon_key";
    try {
      await fetch(`${BASE}/api/pm/admin/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [patchKey]: "" }),
      });
      setSettings((s) => ({ ...s, [patchKey]: "" }));
      await queryClient.invalidateQueries({ queryKey: SITE_IDENTITY_KEY });
      toast({ title: `${kind === "logo" ? "Logo" : "Favicon"} dihapus` });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { logo_key: _l, favicon_key: _f, ...textOnly } = settings;
      const r = await fetch(`${BASE}/api/pm/admin/settings`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(textOnly),
      });
      if (r.ok) {
        await queryClient.invalidateQueries({ queryKey: SITE_IDENTITY_KEY });
        toast({ title: "Identitas web disimpan" });
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

  const logoUrl = settings.logo_key ? `${BASE}/api/pm/identity/logo?v=${bust}` : null;
  const faviconUrl = settings.favicon_key ? `${BASE}/api/pm/identity/favicon?v=${bust}` : null;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Identitas Web</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Atur logo, favicon, judul halaman, deskripsi, dan footer situs.
          </p>
        </div>

        <div className="space-y-6">
          {/* Logo & Favicon */}
          <div className="bg-white rounded-xl border p-6 shadow-sm">
            <h2 className="font-semibold mb-1">Logo & Favicon</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Logo tampil di header navbar. Favicon tampil di tab browser. Disarankan format PNG/SVG.
            </p>

            <div className="grid sm:grid-cols-2 gap-5">
              {/* Logo */}
              <div>
                <Label className="mb-2 block text-sm">Logo</Label>
                <div className="border rounded-lg p-4 flex flex-col items-center gap-3 bg-muted/30">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="h-16 object-contain" />
                  ) : (
                    <div className="h-16 flex items-center text-xs text-muted-foreground">Belum ada logo</div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAssetChange("logo", e.target.files?.[0] ?? null)}
                  />
                  <div className="flex gap-2 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                    >
                      {uploadingLogo ? "Mengunggah…" : settings.logo_key ? "Ganti Logo" : "Unggah Logo"}
                    </Button>
                    {settings.logo_key && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAsset("logo")}>
                        Hapus
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Favicon */}
              <div>
                <Label className="mb-2 block text-sm">Favicon</Label>
                <div className="border rounded-lg p-4 flex flex-col items-center gap-3 bg-muted/30">
                  {faviconUrl ? (
                    <img src={faviconUrl} alt="Favicon" className="h-16 w-16 object-contain" />
                  ) : (
                    <div className="h-16 flex items-center text-xs text-muted-foreground">Belum ada favicon</div>
                  )}
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png,image/x-icon,image/svg+xml,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleAssetChange("favicon", e.target.files?.[0] ?? null)}
                  />
                  <div className="flex gap-2 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => faviconInputRef.current?.click()}
                      disabled={uploadingFavicon}
                    >
                      {uploadingFavicon ? "Mengunggah…" : settings.favicon_key ? "Ganti Favicon" : "Unggah Favicon"}
                    </Button>
                    {settings.favicon_key && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeAsset("favicon")}>
                        Hapus
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Judul & Deskripsi */}
          <div className="bg-white rounded-xl border p-6 shadow-sm space-y-4">
            <div>
              <h2 className="font-semibold mb-1">Judul & Deskripsi</h2>
              <p className="text-sm text-muted-foreground mb-2">
                Muncul di tab browser, hasil pencarian Google, dan saat dibagikan ke media sosial.
              </p>
            </div>

            <div>
              <Label htmlFor="site-title" className="mb-1 block text-sm">Nama Situs (Judul)</Label>
              <Input
                id="site-title"
                placeholder="ProposalHub"
                value={settings.site_title}
                onChange={(e) => setSettings((s) => ({ ...s, site_title: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="site-tagline" className="mb-1 block text-sm">
                Tagline <span className="text-muted-foreground font-normal">(opsional, muncul setelah judul di tab browser)</span>
              </Label>
              <Input
                id="site-tagline"
                placeholder="Marketplace Proposal Bisnis Indonesia"
                value={settings.site_tagline}
                onChange={(e) => setSettings((s) => ({ ...s, site_tagline: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="site-description" className="mb-1 block text-sm">
                Deskripsi Meta <span className="text-muted-foreground font-normal">(untuk SEO, ideal 120-160 karakter)</span>
              </Label>
              <Textarea
                id="site-description"
                rows={3}
                placeholder="Deskripsi singkat tentang situs Anda…"
                value={settings.site_description}
                onChange={(e) => setSettings((s) => ({ ...s, site_description: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">{settings.site_description.length} karakter</p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-white rounded-xl border p-6 shadow-sm space-y-4">
            <div>
              <h2 className="font-semibold mb-1">Footer</h2>
              <p className="text-sm text-muted-foreground mb-2">
                Teks di bagian bawah seluruh halaman.
              </p>
            </div>

            <div>
              <Label htmlFor="footer-brand" className="mb-1 block text-sm">Nama Brand di Footer</Label>
              <Input
                id="footer-brand"
                placeholder="ProposalHub"
                value={settings.footer_brand}
                onChange={(e) => setSettings((s) => ({ ...s, footer_brand: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="footer-text" className="mb-1 block text-sm">Tagline Footer</Label>
              <Input
                id="footer-text"
                placeholder="Marketplace proposal bisnis terpercaya Indonesia"
                value={settings.footer_text}
                onChange={(e) => setSettings((s) => ({ ...s, footer_text: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="footer-note" className="mb-1 block text-sm">
                Catatan Footer <span className="text-muted-foreground font-normal">(boleh kosong, bisa multi-baris)</span>
              </Label>
              <Textarea
                id="footer-note"
                rows={2}
                placeholder="Contoh: Platform mengambil 35% per transaksi…"
                value={settings.footer_note}
                onChange={(e) => setSettings((s) => ({ ...s, footer_note: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving} className="px-8">
              {saving ? "Menyimpan…" : "Simpan Identitas Web"}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
