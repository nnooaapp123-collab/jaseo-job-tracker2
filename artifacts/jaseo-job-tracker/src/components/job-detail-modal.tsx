import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Save, Globe, User, Lock, FileText, Layers, Hash, CheckCircle2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateJob, getListJobsQueryKey, getGetDailyStatsQueryKey, getGetSummaryStatsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";

interface Job {
  id: number;
  jobCode: string;
  website: string;
  username?: string | null;
  password?: string | null;
  notes?: string | null;
  petunjuk?: string | null;
  versionTool: string;
  wordCount: number;
  writerName?: string | null;
  editorName?: string | null;
  isChecked: boolean;
  jobDate: string;
}

interface JobDetailModalProps {
  job: Job | null;
  open: boolean;
  onClose: () => void;
  dateStr: string;
}

const versionLabel: Record<string, string> = {
  smallseotool: "SmallSEOTool",
  copyscape: "Copyscape",
  other: "Other",
};

export function JobDetailModal({ job, open, onClose, dateStr }: JobDetailModalProps) {
  const [localPetunjuk, setLocalPetunjuk] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const { currentUser } = useAuth();
  const updateJob = useUpdateJob();
  const queryClient = useQueryClient();

  const canEditPetunjuk = currentUser?.role === "cs" || currentUser?.role === "admin";

  const handleOpen = () => {
    setLocalPetunjuk(job?.petunjuk ?? "");
    setEditing(false);
  };

  const handleSave = () => {
    if (!job) return;
    updateJob.mutate({ id: job.id, data: { petunjuk: localPetunjuk || null } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListJobsQueryKey({ date: dateStr }) });
        queryClient.invalidateQueries({ queryKey: getGetDailyStatsQueryKey({ date: dateStr }) });
        queryClient.invalidateQueries({ queryKey: getGetSummaryStatsQueryKey({ date: dateStr }) });
        setEditing(false);
      }
    });
  };

  if (!job) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else handleOpen(); }}>
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        onOpenAutoFocus={handleOpen}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-xl font-serif">
            <span className="font-mono text-primary">{job.jobCode}</span>
            <Badge
              variant={job.isChecked ? "default" : "secondary"}
              className={cn(
                "text-xs",
                job.isChecked && "bg-emerald-500 hover:bg-emerald-600"
              )}
            >
              {job.isChecked ? "Selesai" : "Pending"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoRow icon={<Globe className="h-4 w-4" />} label="Website" value={job.website} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Tanggal" value={job.jobDate} mono />
            <InfoRow icon={<User className="h-4 w-4" />} label="Username" value={job.username || "-"} />
            <InfoRow icon={<Lock className="h-4 w-4" />} label="Password" value={job.password || "-"} mono />
            <InfoRow icon={<Layers className="h-4 w-4" />} label="Versi Tools" value={versionLabel[job.versionTool] ?? job.versionTool} />
            <InfoRow icon={<Hash className="h-4 w-4" />} label="Jumlah Kata" value={job.wordCount.toLocaleString()} highlight />
            <InfoRow icon={<User className="h-4 w-4" />} label="Penulis" value={job.writerName || "-"} />
            <InfoRow icon={<CheckCircle2 className="h-4 w-4" />} label="Editor" value={job.editorName || "-"} />
          </div>

          {job.notes && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Notes
              </p>
              <p className="text-sm text-amber-900 dark:text-amber-200">{job.notes}</p>
            </div>
          )}

          <Separator />

          {/* Petunjuk Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Petunjuk Penulisan
              </Label>
              {canEditPetunjuk && !editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  Edit Petunjuk
                </Button>
              )}
            </div>

            {editing && canEditPetunjuk ? (
              <div className="space-y-2">
                <Textarea
                  value={localPetunjuk}
                  onChange={e => setLocalPetunjuk(e.target.value)}
                  rows={8}
                  placeholder="Tulis petunjuk penulisan untuk artikel ini..."
                  className="resize-none font-mono text-sm leading-relaxed"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setEditing(false); setLocalPetunjuk(job.petunjuk ?? ""); }}>
                    Batal
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateJob.isPending}>
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    Simpan
                  </Button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "min-h-[120px] rounded-lg border p-4 text-sm whitespace-pre-wrap leading-relaxed",
                  !job.petunjuk
                    ? "text-muted-foreground italic border-dashed bg-muted/30"
                    : "bg-card border-border"
                )}
              >
                {job.petunjuk || "Belum ada petunjuk untuk job ini."}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {canEditPetunjuk
                ? "Perubahan petunjuk di sini akan berlaku untuk semua job dengan kode yang sama."
                : "Hanya CS yang dapat mengubah petunjuk penulisan."}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  icon, label, value, mono = false, highlight = false
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className={cn(
        "text-sm font-medium",
        mono && "font-mono",
        highlight && "text-primary text-base font-bold"
      )}>
        {value}
      </span>
    </div>
  );
}
