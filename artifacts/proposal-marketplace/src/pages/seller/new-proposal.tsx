import { useState } from "react";
import { Link, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPmCategories,
  useCreatePmProposal,
  useRequestUploadUrl,
  getListMyProposalsQueryKey,
} from "@workspace/api-client-react";

export default function NewProposal() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useListPmCategories();
  const createProposal = useCreatePmProposal();
  const requestUploadUrl = useRequestUploadUrl();

  const [form, setForm] = useState({
    title: "",
    description: "",
    categoryId: "",
    price: "",
  });
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewFile2, setPreviewFile2] = useState<File | null>(null);
  const [previewFile3, setPreviewFile3] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "seller") {
    navigate("/login");
    return null;
  }

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
    await fetch(result.uploadURL, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
    return result.objectPath;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalFile) {
      toast({ title: "File proposal wajib diisi", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      let fileKey = "";
      let previewImageKey: string | undefined;
      let previewImageKey2: string | undefined;
      let previewImageKey3: string | undefined;
      fileKey = await uploadFile(proposalFile);
      if (previewFile) previewImageKey = await uploadFile(previewFile);
      if (previewFile2) previewImageKey2 = await uploadFile(previewFile2);
      if (previewFile3) previewImageKey3 = await uploadFile(previewFile3);
      createProposal.mutate(
        {
          data: {
            title: form.title,
            description: form.description,
            categoryId: form.categoryId ? Number(form.categoryId) : undefined,
            price: Number(form.price),
            fileKey,
            previewImageKey,
            previewImageKey2,
            previewImageKey3,
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMyProposalsQueryKey() });
            toast({ title: "Proposal berhasil diunggah!", description: "Proposal menunggu review admin." });
            navigate("/seller/dashboard");
          },
          onError: () => {
            toast({ title: "Gagal mengunggah proposal", variant: "destructive" });
            setUploading(false);
          },
        }
      );
    } catch {
      toast({ title: "Gagal mengunggah file", variant: "destructive" });
      setUploading(false);
    }
  };

  const isSubmitting = uploading || createProposal.isPending;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/seller/dashboard">
            <Button variant="ghost" size="sm">Kembali</Button>
          </Link>
          <h1 className="text-2xl font-bold">Upload Proposal Baru</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detail Proposal</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="title">Judul Proposal *</Label>
                <Input
                  id="title"
                  placeholder="Contoh: Proposal Bisnis Kafe Premium"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Deskripsi *</Label>
                <Textarea
                  id="description"
                  placeholder="Jelaskan isi proposal, untuk siapa cocok, keunggulannya..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="category">Kategori</Label>
                  <Select
                    value={form.categoryId}
                    onValueChange={(v) => setForm({ ...form, categoryId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="price">Harga (Rp) *</Label>
                  <Input
                    id="price"
                    type="number"
                    placeholder="150000"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    min={1000}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="file">File Proposal (PDF/DOCX) *</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={(e) => setProposalFile(e.target.files?.[0] ?? null)}
                  required
                />
                <p className="text-xs text-muted-foreground">File yang pembeli unduh setelah membeli</p>
              </div>

              <div className="space-y-2">
                <Label>Gambar Preview — hingga 3 gambar (opsional)</Label>
                <p className="text-xs text-muted-foreground">Ditampilkan di halaman proposal agar pembeli bisa melihat gambaran isi</p>
                {[
                  { id: "preview1", label: "Gambar 1", setter: setPreviewFile },
                  { id: "preview2", label: "Gambar 2", setter: setPreviewFile2 },
                  { id: "preview3", label: "Gambar 3", setter: setPreviewFile3 },
                ].map(({ id, label, setter }) => (
                  <div key={id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
                    <Input
                      id={id}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setter(e.target.files?.[0] ?? null)}
                      className="text-sm"
                    />
                  </div>
                ))}
              </div>

              <div className="bg-muted/30 rounded-lg p-3 text-xs text-muted-foreground">
                Proposal akan masuk review admin sebelum ditampilkan. Platform mengambil 35% per transaksi, Anda mendapat 65%.
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? "Mengunggah..." : "Upload Proposal"}
                </Button>
                <Link href="/seller/dashboard">
                  <Button type="button" variant="outline">Batal</Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
