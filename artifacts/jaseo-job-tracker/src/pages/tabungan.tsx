import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import * as XLSX from "xlsx";
import {
  Loader2, PiggyBank, ChevronLeft, Coins, CalendarCheck,
  Upload, Download, CheckCircle, XCircle, Clock,
  Send, FileSpreadsheet, RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useListUsers } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SavingsMonth {
  id: number;
  year: number;
  month: number;
  role: string;
  amount: number;
  sourceWords: number;
  sourceJobs: number;
  paidAt: string | null;
  notes: string | null;
}

interface SavingsHistory {
  userId: number;
  role: string;
  totalDeposits: number;
  totalWithdrawn: number;
  totalSavings: number; // net = totalDeposits - totalWithdrawn
  months: SavingsMonth[];
}

interface Withdrawal {
  id: number;
  userId: number;
  username: string;
  requestedAmount: number;
  approvedAmount: number | null;
  reason: string | null;
  adminNote: string | null;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  processedAt: string | null;
}

interface ImportRow {
  userId: number;
  userName: string;
  year: number;
  month: number;
  amount: number;
  notes: string;
  valid: boolean;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const fmtNum = (n: number) => n.toLocaleString("id-ID");
const fmtDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(new Date(value))
  : "Akhir bulan";
const fmtDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value))
  : "—";

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const ROLE_LABELS: Record<string, string> = {
  penulis: "Penulis",
  editor: "Editor",
  cs: "CS",
  "penulis+editor": "Penulis + Editor",
};

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
      <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Import Excel Panel (admin) ──────────────────────────────────────────────
function ImportExcelPanel({ allUsers, base, onDone }: {
  allUsers: Array<{ id: number; username: string; displayName?: string | null; role: string }>;
  base: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  const userByName = Object.fromEntries(
    allUsers.map(u => [(u.displayName ?? u.username).toLowerCase(), u])
  );
  const userByUsername = Object.fromEntries(allUsers.map(u => [u.username.toLowerCase(), u]));

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: "binary" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const parsed: ImportRow[] = data.map((row) => {
        const nameRaw = String(row["Nama"] ?? row["nama"] ?? "").trim();
        const year = parseInt(String(row["Tahun"] ?? row["tahun"] ?? ""));
        const month = parseInt(String(row["Bulan"] ?? row["bulan"] ?? ""));
        const amount = parseInt(String(row["Masuk"] ?? row["masuk"] ?? row["Jumlah"] ?? row["jumlah"] ?? "").replace(/[^\d]/g, ""));
        const notes = String(row["Alasan Ambil"] ?? row["alasan ambil"] ?? row["Alasan"] ?? row["alasan"] ?? row["Catatan"] ?? row["catatan"] ?? "").trim();

        const user = userByUsername[nameRaw.toLowerCase()] ?? userByName[nameRaw.toLowerCase()];

        if (!user) return { userId: 0, userName: nameRaw, year, month, amount, notes, valid: false, error: `User "${nameRaw}" tidak ditemukan` };
        if (isNaN(year) || year < 2020 || year > 2030) return { userId: user.id, userName: nameRaw, year, month, amount, notes, valid: false, error: "Tahun tidak valid (2020-2030)" };
        if (isNaN(month) || month < 1 || month > 12) return { userId: user.id, userName: nameRaw, year, month, amount, notes, valid: false, error: "Bulan tidak valid (1-12)" };
        if (isNaN(amount) || amount < 1) return { userId: user.id, userName: nameRaw, year, month, amount, notes, valid: false, error: "Jumlah tidak valid" };

        return { userId: user.id, userName: user.displayName ?? user.username, year, month, amount, notes, valid: true };
      });

      setRows(parsed);
    };
    reader.readAsBinaryString(file);
  };

  const handleImport = async () => {
    const valid = rows.filter(r => r.valid);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`${base}/api/savings/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: valid.map(r => ({ userId: r.userId, year: r.year, month: r.month, amount: r.amount, notes: r.notes })) }),
      });
      const data = await res.json() as { ok?: boolean; inserted?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal import");
      toast({ title: `Import selesai — ${data.inserted} data dimasukkan, ${data.skipped} dilewati` });
      setRows([]);
      onDone();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Gagal import" });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Nama", "Bulan", "Tahun", "Masuk", "Alasan Ambil"],
      ["budi.santoso", 3, 2024, 100000, ""],
      ["siti.rahayu", 4, 2024, 100000, ""],
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Import_Tabungan.xlsx");
  };

  const validCount = rows.filter(r => r.valid).length;
  const invalidCount = rows.filter(r => !r.valid).length;

  return (
    <Card className="shadow-sm border-dashed border-2 border-primary/30">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Import Riwayat Tabungan dari Excel
          <Badge variant="secondary" className="text-xs">Admin</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Gunakan ini untuk memasukkan data tabungan lama yang belum sempat diinput.
          Format kolom: <strong>Nama</strong> (username), <strong>Bulan</strong>, <strong>Tahun</strong>, <strong>Masuk</strong>, <strong>Alasan Ambil</strong>.
          Jika bulan sudah ada, jumlahnya akan diperbarui.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Unduh Template
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Pilih File Excel
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-600 font-medium">{validCount} valid</span>
              {invalidCount > 0 && <span className="text-destructive font-medium">{invalidCount} error</span>}
            </div>
            <div className="max-h-48 overflow-y-auto rounded border text-xs">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead className="py-1 pl-2">Nama</TableHead>
                    <TableHead className="py-1">Tahun</TableHead>
                    <TableHead className="py-1">Bulan</TableHead>
                    <TableHead className="py-1 text-right">Jumlah</TableHead>
                    <TableHead className="py-1 pr-2">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i} className={r.valid ? "" : "bg-destructive/5"}>
                      <TableCell className="py-1 pl-2">{r.userName}</TableCell>
                      <TableCell className="py-1">{r.year}</TableCell>
                      <TableCell className="py-1">{MONTHS[(r.month - 1)] ?? r.month}</TableCell>
                      <TableCell className="py-1 text-right font-mono">{isNaN(r.amount) ? "?" : fmt(r.amount)}</TableCell>
                      <TableCell className="py-1 pr-2">
                        {r.valid
                          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          : <span className="text-destructive text-xs">{r.error}</span>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {validCount > 0 && (
              <Button size="sm" className="h-8 text-xs" onClick={handleImport} disabled={importing}>
                {importing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Konfirmasi Import {validCount} Data
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Withdrawal Request (user) ───────────────────────────────────────────────
function WithdrawalRequestSection({ totalSavings, base, onDone }: {
  totalSavings: number;
  base: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(amount.replace(/[^\d]/g, ""));
    if (isNaN(num) || num < 1) { toast({ variant: "destructive", title: "Jumlah tidak valid" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${base}/api/savings/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requestedAmount: num, reason: reason.trim() || undefined }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengajukan");
      toast({ title: "Pengajuan pencairan berhasil dikirim" });
      setOpen(false);
      setAmount("");
      setReason("");
      onDone();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Gagal mengajukan" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="h-9 shadow-sm" onClick={() => setOpen(true)}>
        <Send className="mr-2 h-4 w-4" />
        Ajukan Pencairan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-amber-500" />
              Ajukan Pencairan Tabungan
            </DialogTitle>
            <DialogDescription>
              Total tabungan terkumpul: <strong>{fmt(totalSavings)}</strong>. Isi formulir pencairan di bawah ini.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="wd-amount">Jumlah yang Dicairkan <span className="text-destructive">*</span></Label>
              <Input
                id="wd-amount"
                placeholder="Contoh: 500000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                type="number"
                min={1}
                max={totalSavings}
                required
              />
              <p className="text-xs text-muted-foreground">Maksimal: {fmt(totalSavings)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wd-reason">Alasan / Catatan</Label>
              <Textarea
                id="wd-reason"
                placeholder="Tuliskan alasan pencairan (opsional)"
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={submitting || !amount}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Kirim Pengajuan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Withdrawal List (user + admin) ─────────────────────────────────────────
function WithdrawalListSection({ isAdmin, base, refreshKey, filterUserId }: {
  isAdmin: boolean;
  base: string;
  refreshKey: number;
  filterUserId?: string; // when admin picks a specific user
}) {
  const { toast } = useToast();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [approveId, setApproveId] = useState<number | null>(null);
  const [approveAmount, setApproveAmount] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [approving, setApproving] = useState(false);

  const fetchWithdrawals = () => {
    setLoading(true);
    const url = `${base}/api/savings/withdrawals${isAdmin && filterUserId ? `?userId=${filterUserId}` : ""}`;
    fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then(setWithdrawals)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchWithdrawals(); }, [base, refreshKey, filterUserId]);

  const handleApprove = async (status: "approved" | "rejected") => {
    if (!approveId) return;
    const amount = status === "approved" ? parseInt(approveAmount.replace(/[^\d]/g, "")) : undefined;
    if (status === "approved" && (isNaN(amount!) || amount! < 1)) {
      toast({ variant: "destructive", title: "Jumlah disetujui tidak valid" });
      return;
    }
    setApproving(true);
    try {
      const res = await fetch(`${base}/api/savings/withdrawals/${approveId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, approvedAmount: amount, adminNote: approveNote.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Gagal memproses");
      toast({ title: status === "approved" ? "Pencairan disetujui" : "Pencairan ditolak" });
      setApproveId(null);
      setApproveAmount("");
      setApproveNote("");
      fetchWithdrawals();
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Gagal" });
    } finally {
      setApproving(false);
    }
  };

  const pending = withdrawals.filter(w => w.status === "pending");
  const processed = withdrawals.filter(w => w.status !== "pending");
  const selectedWithdrawal = withdrawals.find(w => w.id === approveId);

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (withdrawals.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Belum ada pengajuan pencairan.
        </CardContent>
      </Card>
    );
  }

  const StatusBadge = ({ status }: { status: Withdrawal["status"] }) => {
    if (status === "pending") return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />Menunggu</Badge>;
    if (status === "approved") return <Badge className="gap-1 text-xs bg-emerald-600 hover:bg-emerald-600"><CheckCircle className="h-3 w-3" />Disetujui</Badge>;
    return <Badge variant="destructive" className="gap-1 text-xs"><XCircle className="h-3 w-3" />Ditolak</Badge>;
  };

  return (
    <>
      {/* Approval Dialog */}
      <Dialog open={approveId !== null} onOpenChange={open => !open && setApproveId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Proses Pengajuan Pencairan</DialogTitle>
            <DialogDescription>
              {selectedWithdrawal && (
                <span>
                  <strong>{selectedWithdrawal.username}</strong> mengajukan <strong>{fmt(selectedWithdrawal.requestedAmount)}</strong>
                  {selectedWithdrawal.reason && <><br />Alasan: {selectedWithdrawal.reason}</>}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ap-amount">Jumlah Disetujui</Label>
              <Input
                id="ap-amount"
                placeholder={selectedWithdrawal ? String(selectedWithdrawal.requestedAmount) : ""}
                value={approveAmount}
                onChange={e => setApproveAmount(e.target.value)}
                type="number"
                min={1}
              />
              <p className="text-xs text-muted-foreground">Boleh kurang dari yang diajukan (persetujuan sebagian).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-note">Catatan Admin</Label>
              <Textarea
                id="ap-note"
                placeholder="Catatan (opsional)"
                value={approveNote}
                onChange={e => setApproveNote(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="destructive" onClick={() => handleApprove("rejected")} disabled={approving}>
              {approving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Tolak
            </Button>
            <Button type="button" onClick={() => handleApprove("approved")} disabled={approving || !approveAmount}>
              {approving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        {pending.length > 0 && (
          <Card className="shadow-sm border-amber-200 dark:border-amber-900">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Menunggu Persetujuan
                <Badge variant="secondary" className="font-mono text-xs">{pending.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {isAdmin && <TableHead className="pl-4 font-bold text-foreground">Nama</TableHead>}
                    <TableHead className={cn("font-bold text-foreground", !isAdmin && "pl-4")}>Diajukan</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Jumlah</TableHead>
                    <TableHead className="font-bold text-foreground hidden sm:table-cell">Alasan</TableHead>
                    {isAdmin && <TableHead className="pr-4 font-bold text-foreground text-right">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map(w => (
                    <TableRow key={w.id}>
                      {isAdmin && <TableCell className="pl-4 font-medium text-sm">{w.username}</TableCell>}
                      <TableCell className={cn("text-sm text-muted-foreground", !isAdmin && "pl-4")}>{fmtDateTime(w.requestedAt)}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-sm text-amber-700 dark:text-amber-400">{fmt(w.requestedAmount)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{w.reason ?? "—"}</TableCell>
                      {isAdmin && (
                        <TableCell className="pr-4 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                            setApproveId(w.id);
                            setApproveAmount(String(w.requestedAmount));
                            setApproveNote("");
                          }}>
                            Proses
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {processed.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-primary" />
                Riwayat Pencairan
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {isAdmin && <TableHead className="pl-4 font-bold text-foreground">Nama</TableHead>}
                    <TableHead className={cn("font-bold text-foreground", !isAdmin && "pl-4")}>Tanggal</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Diajukan</TableHead>
                    <TableHead className="text-right font-bold text-foreground">Disetujui</TableHead>
                    <TableHead className="font-bold text-foreground">Status</TableHead>
                    <TableHead className="font-bold text-foreground hidden sm:table-cell">Catatan Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processed.map(w => (
                    <TableRow key={w.id}>
                      {isAdmin && <TableCell className="pl-4 font-medium text-sm">{w.username}</TableCell>}
                      <TableCell className={cn("text-sm text-muted-foreground", !isAdmin && "pl-4")}>{fmtDateTime(w.requestedAt)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(w.requestedAmount)}</TableCell>
                      <TableCell className="text-right font-bold font-mono text-sm text-emerald-700 dark:text-emerald-400">
                        {w.approvedAmount != null ? fmt(w.approvedAmount) : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={w.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden sm:table-cell">{w.adminNote ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TabunganPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const isAdmin = currentUser?.role === "admin";

  const urlUserId = (() => {
    const params = new URLSearchParams(location.split("?")[1] ?? "");
    return params.get("userId") ?? undefined;
  })();

  const { data: allUsers = [] } = useListUsers({ query: {} as never });
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId ?? "self");

  const [data, setData] = useState<SavingsHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterYear, setFilterYear] = useState<string>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [approvedWithdrawals, setApprovedWithdrawals] = useState<Withdrawal[]>([]);
  const [syncing, setSyncing] = useState(false);

  const targetUserId = isAdmin && selectedUserId !== "self" ? selectedUserId : undefined;

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${base}/api/savings/sync`, { method: "POST", credentials: "include" });
      const json = await res.json() as { ok?: boolean; syncedUsers?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Gagal sync");
      toast({ title: "Sync berhasil", description: `Tabungan ${json.syncedUsers ?? 0} karyawan diperbarui.` });
      setRefreshKey(k => k + 1);
    } catch (e) {
      toast({ variant: "destructive", title: "Sync gagal", description: typeof e === "string" ? e : (e as Error).message });
    } finally {
      setSyncing(false);
    }
  };

  const fetchSavings = () => {
    setLoading(true);
    const url = `${base}/api/savings/history${targetUserId ? `?userId=${targetUserId}` : ""}`;
    fetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then(setData)
      .catch((e: unknown) => toast({
        variant: "destructive",
        title: "Gagal memuat tabungan",
        description: typeof e === "string" ? e : "Terjadi kesalahan",
      }))
      .finally(() => setLoading(false));
  };

  const fetchApprovedWithdrawals = () => {
    const url = `${base}/api/savings/withdrawals${targetUserId ? `?userId=${targetUserId}` : ""}`;
    fetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.resolve([]))
      .then((ws: Withdrawal[]) => setApprovedWithdrawals(ws.filter(w => w.status === "approved")))
      .catch(() => setApprovedWithdrawals([]));
  };

  useEffect(() => { fetchSavings(); fetchApprovedWithdrawals(); }, [targetUserId, base, refreshKey]);

  const availableYears = [...new Set((data?.months ?? []).map(m => m.year))].sort((a, b) => b - a);
  const filteredMonths = filterYear === "all"
    ? (data?.months ?? [])
    : (data?.months ?? []).filter(m => m.year === Number(filterYear));
  const displayedUserId = targetUserId ?? undefined;

  const userOptions = allUsers.filter(u => u.role !== "admin").sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username, "id"));
  const selectedUserName = selectedUserId === "self"
    ? (currentUser?.username ?? "Saya")
    : allUsers.find(u => String(u.id) === selectedUserId)?.displayName ?? selectedUserId;

  const canWithdraw = !isAdmin && currentUser?.role !== undefined;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/profil${displayedUserId ? `?userId=${displayedUserId}` : ""}`}>
              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 -ml-2">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Kembali ke Profil
              </Button>
            </Link>
          </div>
          <h2 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <PiggyBank className="h-6 w-6 text-amber-500" />
            Cek Tabungan
          </h2>
          <p className="text-muted-foreground text-sm">
            Tabungan bulanan yang sudah memenuhi syarat dan diberikan setiap akhir bulan.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {isAdmin && userOptions.length > 0 && (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[200px] h-9 bg-background shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self">— Profil Saya —</SelectItem>
                {userOptions.map(u => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.displayName ?? u.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {availableYears.length > 1 && (
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger className="w-[120px] h-9 bg-background shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Tahun</SelectItem>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={syncing}
              className="h-9 gap-2"
            >
              {syncing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              {syncing ? "Menyinkronkan..." : "Sync Tabungan"}
            </Button>
          )}
          {canWithdraw && data && (data.totalSavings > 0) && (
            <WithdrawalRequestSection
              totalSavings={data.totalSavings}
              base={base}
              onDone={() => setRefreshKey(k => k + 1)}
            />
          )}
        </div>
      </div>

      {/* Admin: Import Excel */}
      {isAdmin && selectedUserId === "self" && (
        <ImportExcelPanel
          allUsers={allUsers.map(u => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role }))}
          base={base}
          onDone={() => setRefreshKey(k => k + 1)}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-sm border-amber-200 dark:border-amber-900 sm:col-span-2">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Saldo Tabungan
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-3xl font-bold font-mono ${data.totalSavings >= 0 ? "text-amber-600 dark:text-amber-400" : "text-red-600"}`}>
                  {fmt(Math.max(0, data.totalSavings))}
                </p>
                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  <p>
                    Dari {data.months.length} bulan tabungan terbayar
                    {isAdmin && selectedUserId !== "self" && ` · ${selectedUserName}`}
                  </p>
                  {data.totalWithdrawn > 0 && (
                    <p className="text-red-500">
                      Sudah dicairkan: {fmt(data.totalWithdrawn)}
                      {(data.totalDeposits ?? 0) > 0 && ` dari ${fmt(data.totalDeposits)}`}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Bulan Memenuhi Syarat
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 flex items-end gap-2">
                <p className="text-3xl font-bold text-primary font-mono">{data.months.length}</p>
                <p className="text-sm text-muted-foreground mb-1">bulan</p>
              </CardContent>
            </Card>
          </div>

          {/* Ledger Table — Nama, Bulan, Tahun, Masuk, Keluar, Saldo, Alasan Ambil */}
          {(() => {
            type LedgerEntry = {
              key: string;
              sortKey: number; // timestamp ms for ordering
              year: number;
              month: number;
              label: string; // "Januari 2024" or withdrawal date label
              masuk: number;
              keluar: number;
              reason: string;
              isWithdrawal: boolean;
            };

            // Build deposit entries
            const deposits: LedgerEntry[] = filteredMonths.map(m => ({
              key: `dep-${m.id}`,
              sortKey: new Date(m.year, m.month - 1, 1).getTime(),
              year: m.year,
              month: m.month,
              label: `${MONTHS[m.month - 1]} ${m.year}`,
              masuk: m.amount,
              keluar: 0,
              reason: "",
              isWithdrawal: false,
            }));

            // Build withdrawal entries — hanya milik user yang sedang ditampilkan
            const withdrawals: LedgerEntry[] = approvedWithdrawals
              .filter(w => {
                if (w.userId !== data.userId) return false; // filter by current user
                if (filterYear === "all") return true;
                const d = new Date(w.processedAt ?? w.requestedAt);
                return d.getFullYear() === Number(filterYear);
              })
              .map(w => {
                const d = new Date(w.processedAt ?? w.requestedAt);
                return {
                  key: `wd-${w.id}`,
                  sortKey: d.getTime(),
                  year: d.getFullYear(),
                  month: d.getMonth() + 1,
                  label: fmtDateTime(w.processedAt ?? w.requestedAt),
                  masuk: 0,
                  keluar: w.approvedAmount ?? 0,
                  reason: w.reason ?? "",
                  isWithdrawal: true,
                };
              });

            const ledger = [...deposits, ...withdrawals].sort((a, b) => a.sortKey - b.sortKey);

            // Compute running saldo
            let runningBalance = 0;
            const rows = ledger.map(e => {
              runningBalance += e.masuk - e.keluar;
              return { ...e, saldo: runningBalance };
            });

            return (
              <Card className="shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-primary" />
                    Riwayat Tabungan
                    {filterYear !== "all" && (
                      <Badge variant="secondary" className="text-xs font-mono ml-1">{filterYear}</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  {rows.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      Belum ada data tabungan untuk periode ini.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="pl-4 font-bold text-foreground">Nama</TableHead>
                          <TableHead className="font-bold text-foreground">Bulan</TableHead>
                          <TableHead className="font-bold text-foreground">Tahun</TableHead>
                          <TableHead className="text-right font-bold text-emerald-700 dark:text-emerald-400">Masuk</TableHead>
                          <TableHead className="text-right font-bold text-rose-600 dark:text-rose-400">Keluar</TableHead>
                          <TableHead className="text-right font-bold text-foreground">Saldo</TableHead>
                          <TableHead className="font-bold text-foreground">Alasan Ambil</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((row) => (
                          <TableRow key={row.key} className={row.isWithdrawal ? "bg-rose-50/40 dark:bg-rose-950/20" : ""}>
                            <TableCell className="pl-4 font-medium text-sm">{selectedUserName}</TableCell>
                            <TableCell className="text-sm">
                              {row.isWithdrawal ? (
                                <span className="text-rose-600 dark:text-rose-400 text-xs font-medium">{row.label}</span>
                              ) : (
                                <span className="font-medium">{MONTHS[row.month - 1]}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.year}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.masuk > 0 ? (
                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(row.masuk)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {row.keluar > 0 ? (
                                <span className="text-rose-600 dark:text-rose-400 font-semibold">{fmt(row.keluar)}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-sm">
                              <span className={row.saldo >= 0 ? "text-amber-700 dark:text-amber-400" : "text-rose-600"}>
                                {fmt(row.saldo)}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {row.reason || "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <p className="text-xs text-muted-foreground text-center">
            <Coins className="inline h-3 w-3 mr-1" />
            Penulis mendapat tabungan jika mencapai minimal 70.000 kata selesai. Editor, penulis merangkap editor, dan CS menerima tabungan pada bulan aktif yang sudah ditutup.
          </p>
        </>
      )}

      {/* Pencairan tabungan section */}
      {(canWithdraw || isAdmin) && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            {isAdmin ? "Kelola Pengajuan Pencairan" : "Riwayat Pengajuan Pencairan Saya"}
          </h3>
          <WithdrawalListSection
            isAdmin={isAdmin}
            base={base}
            refreshKey={refreshKey}
            filterUserId={isAdmin && selectedUserId !== "self" ? selectedUserId : undefined}
          />
        </div>
      )}
    </div>
  );
}
