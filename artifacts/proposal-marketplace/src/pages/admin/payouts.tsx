import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/contexts/PmAuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatRupiah } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminPayouts,
  useUpdatePmPayout,
  useRequestUploadUrl,
  getListAdminPayoutsQueryKey,
} from "@workspace/api-client-react";
import { useState, useRef } from "react";
import type { PmPayout } from "@workspace/api-client-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Menunggu", variant: "outline" },
  approved: { label: "Disetujui", variant: "default" },
  paid: { label: "Dibayar", variant: "default" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

function SellerBankInfo({ payout }: { payout: PmPayout }) {
  const hasBank = !!(payout.sellerBankAccount);
  if (!hasBank) {
    return (
      <p className="text-xs text-amber-600 italic mt-1">Seller belum mendaftarkan rekening bank.</p>
    );
  }
  return (
    <div className="mt-2 bg-muted/50 rounded p-2 text-xs space-y-0.5">
      {payout.sellerBankName && (
        <div className="flex gap-2">
          <span className="text-muted-foreground w-20 shrink-0">Bank</span>
          <span className="font-medium">{payout.sellerBankName}</span>
        </div>
      )}
      <div className="flex gap-2">
        <span className="text-muted-foreground w-20 shrink-0">No. Rek</span>
        <span className="font-mono font-medium">{payout.sellerBankAccount}</span>
      </div>
      {payout.sellerAccountOwner && (
        <div className="flex gap-2">
          <span className="text-muted-foreground w-20 shrink-0">Atas Nama</span>
          <span className="font-medium">{payout.sellerAccountOwner}</span>
        </div>
      )}
    </div>
  );
}

function TransferProofSection({ payout }: { payout: PmPayout }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const requestUploadUrl = useRequestUploadUrl();
  const updatePayout = useUpdatePmPayout();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "Format file tidak didukung. Gunakan JPG, PNG, atau WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Ukuran file maksimal 5 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const urlData = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadUrl.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type } },
          {
            onSuccess: (data) => resolve(data as { uploadURL: string; objectPath: string }),
            onError: reject,
          }
        );
      });

      await fetch(urlData.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      await new Promise<void>((resolve, reject) => {
        updatePayout.mutate(
          {
            id: payout.id,
            data: { status: payout.status as "approved" | "rejected", adminNote: payout.adminNote ?? undefined, transferProofKey: urlData.objectPath },
          },
          {
            onSuccess: () => resolve(),
            onError: reject,
          }
        );
      });

      queryClient.invalidateQueries({ queryKey: getListAdminPayoutsQueryKey() });
      toast({ title: "Bukti transfer berhasil diupload" });
    } catch {
      toast({ title: "Gagal mengupload bukti transfer", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">Bukti Transfer</p>
      {payout.transferProofKey ? (
        <div className="space-y-2">
          <a
            href={`/api/pm/payouts/${payout.id}/proof-image`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              src={`/api/pm/payouts/${payout.id}/proof-image`}
              alt="Bukti transfer"
              className="max-h-48 rounded border object-contain cursor-pointer hover:opacity-90 transition-opacity"
            />
          </a>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Mengupload..." : "Ganti Bukti"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Mengupload..." : "Upload Bukti Transfer"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <span className="text-xs text-muted-foreground">JPG, PNG, WebP maks. 5 MB</span>
        </div>
      )}
    </div>
  );
}

function PayoutRow({ payout }: { payout: PmPayout }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState(payout.adminNote ?? "");
  const [showRejectNote, setShowRejectNote] = useState(false);
  const updatePayout = useUpdatePmPayout();

  const handleUpdate = (status: "approved" | "rejected") => {
    updatePayout.mutate(
      { id: payout.id, data: { status, adminNote: note || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListAdminPayoutsQueryKey() });
          toast({ title: status === "approved" ? "Penarikan disetujui" : "Penarikan ditolak" });
          setShowRejectNote(false);
        },
        onError: () => toast({ title: "Gagal memproses", variant: "destructive" }),
      }
    );
  };

  const isPending = payout.status === "pending";
  const canUploadProof = payout.status === "approved" || payout.status === "paid";
  const statusInfo = STATUS_LABELS[payout.status] ?? { label: payout.status, variant: "secondary" as const };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
          <p className="font-semibold text-lg">{formatRupiah(payout.amount)}</p>
          <p className="text-sm text-muted-foreground">Seller: {payout.sellerName ?? `#${payout.sellerId}`}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Diajukan: {new Date(payout.requestedAt).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric" })}
          </p>
          {payout.processedAt && (
            <p className="text-xs text-muted-foreground">
              Diproses: {new Date(payout.processedAt).toLocaleDateString("id-ID")}
            </p>
          )}
          {payout.adminNote && !showRejectNote && (
            <p className="text-xs text-muted-foreground italic mt-1">Catatan: {payout.adminNote}</p>
          )}
          <SellerBankInfo payout={payout} />
        </div>
      </div>

      {isPending && (
        <>
          {showRejectNote && (
            <Textarea
              placeholder="Alasan penolakan (opsional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="text-sm"
            />
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => handleUpdate("approved")}
              disabled={updatePayout.isPending}
            >
              Setujui
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (!showRejectNote) { setShowRejectNote(true); return; }
                handleUpdate("rejected");
              }}
              disabled={updatePayout.isPending}
            >
              {!showRejectNote ? "Tolak" : "Konfirmasi Tolak"}
            </Button>
            {showRejectNote && (
              <Button size="sm" variant="ghost" onClick={() => setShowRejectNote(false)}>
                Batal
              </Button>
            )}
          </div>
        </>
      )}

      {canUploadProof && <TransferProofSection payout={payout} />}
    </div>
  );
}

export default function AdminPayouts() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: payouts, isLoading } = useListAdminPayouts({
    query: { enabled: !!user && user.role === "admin", queryKey: getListAdminPayoutsQueryKey() },
  });

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  const pending = payouts?.filter(p => p.status === "pending") ?? [];
  const others = payouts?.filter(p => p.status !== "pending") ?? [];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Kelola Penarikan</h1>

        {pending.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold mb-3 text-amber-700">
              {pending.length} Permintaan Menunggu
            </h2>
            <div className="space-y-3">
              {pending.map(p => <PayoutRow key={p.id} payout={p} />)}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "Memuat..." : `Riwayat (${others.length})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : others.length === 0 && !pending.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">Belum ada permintaan penarikan.</p>
            ) : others.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Tidak ada riwayat selesai.</p>
            ) : (
              <div className="space-y-3">
                {others.map(p => <PayoutRow key={p.id} payout={p} />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
