import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPmCategories,
  useGetPmProposal,
  useUpdatePmProposal,
  useRequestUploadUrl,
  getListMyProposalsQueryKey,
  getGetPmProposalQueryKey,
} from "@workspace/api-client-react";

export default function EditProposal() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories } = useListPmCategories();
  const { data: proposal, isLoading: proposalLoading } = useGetPmProposal(id, {
    query: { enabled: !!id, queryKey: getGetPmProposalQueryKey(id) },
  });
  const updateProposal = useUpdatePmProposal();
  const requestUploadUrl = useRequestUploadUrl();

  const [form, setForm] = useState({
    title: "",
    description: "",
    categoryId: "",
    price: "",
  });
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [previewFile2, setPreviewFile2] = useState<File | null>(null);
  const [previewFile3, setPreviewFile3] = useState<File | null>(null);
  const [proposalFile, setProposalFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (proposal && !initialized) {
      setForm({
        title: proposal.title,
        description: proposal.description,
        categoryId: proposal.categoryId?.toString() ?? "",
        price: proposal.price.toString(),
      });
      setInitialized(true);
    }
  }, [proposal, initialized]);

  if (authLoading || proposalLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </Layout>
    );
  }

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
    setUploading(true);
    try {
      let fileKey: string | undefined;
      let previewImageKey: string | undefined;
      let previewImageKey2: string | undefined;
      let previewImageKey3: string | undefined;

      if (proposalFile) fileKey = await uploadFile(proposalFile);
      if (previewFile) previewImageKey = await uploadFile(previewFile);
      if (previewFile2) previewImageKey2 = await uploadFile(previewFile2);
      if (previewFile3) previewImageKey3 = await uploadFile(previewFile3);

      updateProposal.mutate(
        {
          id,
          data: {
            title: form.title,
            description: form.description,
            categoryId: form.categoryId ? Number(form.categoryId) : undefined,
            price: Number(form.price),
            ...(fileKey ? { fileKey } : {}),
            ...(previewImageKey ? { previewImageKey } : {}),
            ...(previewImageKey2 ? { previewImageKey2 } : {}),
            ...(previewImageKey3 ? { previewImageKey3 } : {}),
          },
        },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMyProposalsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetPmProposalQueryKey(id) });
            toast({ title: "Proposal berhasil diperbarui!" });
            navigate("/seller/dashboard");
          },
          onError: () => {
            toast({ title: "Gagal memperbarui proposal", variant: "destructive" });
            setUploading(false);
          },
        }
      );
    } catch {
      toast({ title: "Gagal mengunggah file", variant: "destructive" });
      setUploading(false);
    }
  };

  const isSubmitting = uploading || updateProposal.isPending;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/seller/dashboard">
            <Button variant="ghost" size="sm">Kembali</Button>
          </Link>
          <h1 className="text-2xl font-bold">Edit Proposal</h1>
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
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Deskripsi *</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Kategori</Label>
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
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    min={1000}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="file">Ganti File Proposal (opsional)</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx"
                  onChange={(e) => setProposalFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">Jika sudah ada file, pilih file baru hanya jika ingin menggantinya.</p>
              </div>

              <div className="space-y-2">
                <Label>Ganti Gambar Preview — hingga 3 gambar (opsional)</Label>
                <p className="text-xs text-muted-foreground">Pilih gambar baru hanya jika ingin mengganti yang sudah ada</p>
                {[
                  { id: "prev1", label: "Gambar 1", setter: setPreviewFile },
                  { id: "prev2", label: "Gambar 2", setter: setPreviewFile2 },
                  { id: "prev3", label: "Gambar 3", setter: setPreviewFile3 },
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

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
                </Button>
                <Link href="/seller/dashboard">
                  <Button type="button" variant="outline">Batal</Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        {proposal && (proposal.status === "active" || proposal.status === "archived") && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base text-destructive">
                {proposal.status === "active" ? "Arsipkan Proposal" : "Aktifkan Kembali"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {proposal.status === "active"
                  ? "Proposal yang diarsipkan tidak akan muncul di halaman jelajahi. Pembeli tidak dapat menemukannya."
                  : "Ajukan ulang proposal untuk ditinjau oleh admin. Setelah disetujui, proposal akan aktif kembali."}
              </p>
              <Button
                variant={proposal.status === "active" ? "destructive" : "default"}
                onClick={() => {
                  const nextStatus = proposal.status === "active" ? "archived" : "pending";
                  updateProposal.mutate(
                    { id, data: { status: nextStatus } },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({ queryKey: getListMyProposalsQueryKey() });
                        queryClient.invalidateQueries({ queryKey: getGetPmProposalQueryKey(id) });
                        toast({
                          title: nextStatus === "archived"
                            ? "Proposal diarsipkan."
                            : "Proposal diajukan ulang untuk review admin.",
                        });
                      },
                      onError: () => toast({ title: "Gagal mengubah status", variant: "destructive" }),
                    }
                  );
                }}
                disabled={updateProposal.isPending}
              >
                {updateProposal.isPending
                  ? "Memproses..."
                  : proposal.status === "active"
                  ? "Arsipkan Proposal"
                  : "Ajukan Ulang ke Review"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
