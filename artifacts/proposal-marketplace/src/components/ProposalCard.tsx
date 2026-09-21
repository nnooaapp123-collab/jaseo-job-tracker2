import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import type { PmProposal } from "@workspace/api-client-react";

interface ProposalCardProps {
  proposal: PmProposal;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Aktif", variant: "default" },
  draft: { label: "Draf", variant: "secondary" },
  pending: { label: "Menunggu Review", variant: "outline" },
  archived: { label: "Diarsipkan", variant: "secondary" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

export default function ProposalCard({ proposal }: ProposalCardProps) {
  const status = STATUS_LABELS[proposal.status] ?? { label: proposal.status, variant: "secondary" as const };

  return (
    <Link href={`/proposals/${proposal.id}`}>
      <Card className="cursor-pointer hover:shadow-md transition-all duration-200 h-full group border border-border/60">
        <div className="aspect-video bg-gradient-to-br from-primary/10 to-primary/5 rounded-t-lg overflow-hidden relative">
          {proposal.previewImageKey ? (
            <img
              src={`/api/pm/proposals/${proposal.id}/preview-image`}
              alt={proposal.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center px-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-xs text-muted-foreground">Dokumen Proposal</p>
              </div>
            </div>
          )}
          {proposal.categoryName && (
            <div className="absolute top-2 left-2">
              <span className="bg-white/90 text-xs font-medium px-2 py-0.5 rounded-full text-foreground shadow-sm">
                {proposal.categoryName}
              </span>
            </div>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm leading-snug line-clamp-2 mb-1 group-hover:text-primary transition-colors">
            {proposal.title}
          </h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {proposal.description}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-primary">
              {formatRupiah(proposal.price)}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {proposal.totalSales} terjual
            </div>
          </div>
          {proposal.sellerName && (
            <p className="text-xs text-muted-foreground mt-2">oleh {proposal.sellerName}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export { STATUS_LABELS };
