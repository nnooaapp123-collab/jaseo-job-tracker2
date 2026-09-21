import { useState } from "react";
import { Link, useLocation } from "wouter";
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
  useListPmProposals,
  useModeratePmProposal,
  getListPmProposalsQueryKey,
} from "@workspace/api-client-react";
import type { PmProposal } from "@workspace/api-client-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Review",
  active: "Aktif",
  rejected: "Ditolak",
  draft: "Draft",
  archived: "Diarsipkan",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  pending: "outline",
  rejected: "destructive",
  draft: "secondary",
  archived: "secondary",
};

function ProposalModerationRow({ proposal }: { proposal: PmProposal }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const moderate = useModeratePmProposal();

  const handleModerate = (status: "active" | "rejected") => {
    moderate.mutate(
      { id: proposal.id, data: { status, adminNote: note || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPmProposalsQueryKey() });
          toast({ title: status === "active" ? "Proposal disetujui" : "Proposal ditolak" });
          setNote("");
          setShowNote(false);
        },
        onError: () => toast({ title: "Gagal memproses", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={STATUS_VARIANT[proposal.status] ?? "secondary"}>
              {STATUS_LABEL[proposal.status] ?? proposal.status}
            </Badge>
            {proposal.categoryName && (
              <span className="text-xs text-muted-foreground">{proposal.categoryName}</span>
            )}
          </div>
          <p className="font-semibold">{proposal.title}</p>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{proposal.description}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
            <span>Harga: {formatRupiah(proposal.price)}</span>
            <span>Seller: {proposal.sellerName ?? "-"}</span>
            <span>Diunggah: {new Date(proposal.createdAt).toLocaleDateString("id-ID")}</span>
          </div>
        </div>
        <Link href={`/proposals/${proposal.id}`}>
          <Button size="sm" variant="outline" className="shrink-0">
            Lihat Detail
          </Button>
        </Link>
      </div>

      {showNote && (
        <Textarea
          placeholder="Catatan untuk seller (opsional untuk penolakan)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="text-sm"
        />
      )}

      {proposal.status === "pending" && (
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => handleModerate("active")}
            disabled={moderate.isPending}
          >
            Setujui
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!showNote) { setShowNote(true); return; }
              handleModerate("rejected");
            }}
            disabled={moderate.isPending}
          >
            {!showNote ? "Tolak" : "Konfirmasi Tolak"}
          </Button>
          {showNote && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowNote(false); setNote(""); }}
            >
              Batal
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminProposals() {
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: allProposals, isLoading } = useListPmProposals(
    undefined,
    { query: { enabled: !!user && user.role === "admin", queryKey: getListPmProposalsQueryKey() } }
  );

  if (authLoading) return <Layout><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>;
  if (!user || user.role !== "admin") {
    navigate("/login");
    return null;
  }

  const pending = allProposals?.filter(p => p.status === "pending") ?? [];
  const others = allProposals?.filter(p => p.status !== "pending") ?? [];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Moderasi Proposal</h1>

        {pending.length > 0 && (
          <div className="mb-6">
            <h2 className="text-base font-semibold mb-3 text-amber-700">
              {pending.length} Proposal Menunggu Moderasi
            </h2>
            <div className="space-y-4">
              {pending.map((p) => (
                <ProposalModerationRow key={p.id} proposal={p} />
              ))}
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "Memuat..." : `Semua Proposal (${allProposals?.length ?? 0})`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
              </div>
            ) : others.length === 0 && pending.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Belum ada proposal.</p>
            ) : others.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Tidak ada proposal lain.</p>
            ) : (
              <div className="space-y-4">
                {others.map((p) => (
                  <ProposalModerationRow key={p.id} proposal={p} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
