import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  PiggyBank, Plus, Trash2, Loader2, AlertCircle, Search, ChevronDown, X, History,
  RefreshCw, Upload, Download, FileSpreadsheet, CheckCircle, Clock, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

interface WithdrawalRecord {
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

interface LedgerRow {
  type: "in" | "out";
  year: number;
  month: number;
  amount: number;
  notes: string | null;
  reason: string | null;
  id: number;
  withdrawalId?: number;
  isManual?: boolean;
  saldo: number;
}

interface UserSummary {
  userId: number;
  username: string;
  name: string;
  role: string;
  totalIn: number;
  totalOut: number;
  saldo: number;
  ledger: LedgerRow[];
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

const QUERY_KEY = ["savings-admin-overview"];
const WITHDRAWAL_QUERY_KEY = ["user-withdrawals"];

function ImportSavingsPanel({ allUsers, onDone }: {
  allUsers: UserSummary[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);

  const usersByName = useMemo(() => {
    const byName = new Map<string, UserSummary>();
    const byUsername = new Map<string, UserSummary>();
    allUsers.forEach(user => {
      byName.set(user.name.trim().toLowerCase(), user);
      byUsername.set(user.username.trim().toLowerCase(), user);
    });
    return { byName, byUsername };
  }, [allUsers]);

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = loadEvent => {
      try {
        const workbook = XLSX.read(loadEvent.target?.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error("Sheet pertama tidak ditemukan");
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

        const parsed = data.map((row): ImportRow => {
          const nameRaw = String(row["Nama"] ?? row["nama"] ?? "").trim();
          const year = parseInt(String(row["Tahun"] ?? row["tahun"] ?? ""), 10);
          const month = parseInt(String(row["Bulan"] ?? row["bulan"] ?? ""), 10);
          const amountRaw = String(
            row["Masuk"] ?? row["masuk"] ?? row["Jumlah"] ?? row["jumlah"] ?? "",
          );
          const amount = parseInt(amountRaw.replace(/[^\d]/g, ""), 10);
          const notes = String(
            row["Alasan Ambil"] ?? row["alasan ambil"] ?? row["Alasan"] ??
            row["alasan"] ?? row["Catatan"] ?? row["catatan"] ?? "",
          ).trim();
          const user = usersByName.byUsername.get(nameRaw.toLowerCase()) ??
            usersByName.byName.get(nameRaw.toLowerCase());

          if (!user) {
            return { userId: 0, userName: nameRaw, year, month, amount, notes, valid: false,
              error: `User "${nameRaw}" tidak ditemukan` };
          }
          if (isNaN(year) || year < 2020 || year > 2030) {
            return { userId: user.userId, userName: nameRaw, year, month, amount, notes, valid: false,
              error: "Tahun tidak valid (2020-2030)" };
          }
          if (isNaN(month) || month < 1 || month > 12) {
            return { userId: user.userId, userName: nameRaw, year, month, amount, notes, valid: false,
              error: "Bulan tidak valid (1-12)" };
          }
          if (isNaN(amount) || amount < 1) {
            return { userId: user.userId, userName: nameRaw, year, month, amount, notes, valid: false,
              error: "Jumlah tidak valid" };
          }
          return {
            userId: user.userId,
            userName: user.name || user.username,
            year,
            month,
            amount,
            notes,
            valid: true,
          };
        });

        setRows(parsed);
        if (parsed.length === 0) {
          toast({ variant: "destructive", title: "File tidak berisi data" });
        }
      } catch (error) {
        toast({
          variant: "destructive",
          title: "File tidak dapat dibaca",
          description: error instanceof Error ? error.message : "Gunakan format Excel atau CSV yang sesuai.",
        });
        setRows([]);
      }
    };
    reader.onerror = () => {
      toast({ variant: "destructive", title: "File tidak dapat dibaca" });
      setRows([]);
    };
    reader.readAsBinaryString(file);
    event.target.value = "";
  };

  const downloadTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Nama", "Bulan", "Tahun", "Masuk", "Alasan Ambil"],
      ["budi.santoso", 3, 2024, 100000, ""],
      ["siti.rahayu", 4, 2024, 100000, ""],
    ]);
    sheet["!cols"] = [{ wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(workbook, sheet, "Template");
    XLSX.writeFile(workbook, "Template_Import_Tabungan.xlsx");
  };

  const handleImport = async () => {
    const validRows = rows.filter(row => row.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch(`${BASE}/api/savings/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rows: validRows.map(row => ({
            userId: row.userId,
            year: row.year,
            month: row.month,
            amount: row.amount,
            notes: row.notes,
          })),
        }),
      });
      const result = await res.json() as { inserted?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Gagal import");
      toast({
        title: "Import selesai",
        description: `${result.inserted ?? 0} data dimasukkan, ${result.skipped ?? 0} dilewati.`,
      });
      setRows([]);
      onDone();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Gagal import",
        description: error instanceof Error ? error.message : "Terjadi kesalahan saat import.",
      });
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter(row => row.valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <Card className="shadow-sm border-dashed border-2 border-primary/30">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Import Riwayat Tabungan
          <Badge variant="secondary" className="text-xs">Admin</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <p className="text-xs text-muted-foreground">
          Masukkan riwayat lama dari Excel atau CSV. Kolom yang dibutuhkan:
          <strong> Nama</strong> (username/nama), <strong>Bulan</strong>, <strong>Tahun</strong>,
          <strong> Masuk</strong>, dan <strong>Alasan Ambil</strong>. Data pada bulan yang sama akan diperbarui.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={downloadTemplate}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Unduh Template
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Pilih File Excel / CSV
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        </div>

        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-emerald-600 font-medium">{validCount} valid</span>
              {invalidCount > 0 && <span className="text-destructive font-medium">{invalidCount} error</span>}
            </div>
            <div className="max-h-52 overflow-auto rounded border text-xs">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    <TableHead className="py-1 pl-2">Nama</TableHead>
                    <TableHead className="py-1">Tahun</TableHead>
                    <TableHead className="py-1">Bulan</TableHead>
                    <TableHead className="py-1 text-right">Jumlah</TableHead>
                    <TableHead className="py-1 pr-2">Validasi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={`${row.userId}-${row.year}-${row.month}-${index}`} className={row.valid ? "" : "bg-destructive/5"}>
                      <TableCell className="py-1 pl-2">{row.userName || "—"}</TableCell>
                      <TableCell className="py-1">{isNaN(row.year) ? "?" : row.year}</TableCell>
                      <TableCell className="py-1">{MONTHS[row.month - 1] ?? (row.month || "?")}</TableCell>
                      <TableCell className="py-1 text-right font-mono">
                        {isNaN(row.amount) ? "?" : fmt(row.amount)}
                      </TableCell>
                      <TableCell className="py-1 pr-2">
                        {row.valid
                          ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          : <span className="text-destructive">{row.error}</span>}
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

export default function KelolaTabunganPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdmin = currentUser?.role === "admin";

  // Pilih karyawan — combobox
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setComboOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Filter tahun
  const [filterYear, setFilterYear] = useState<string>("semua");

  // Dialog tambah pengeluaran
  const [addOpen, setAddOpen] = useState(false);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [form, setForm] = useState({ amount: "", reason: "", month: String(currentMonth), year: String(currentYear) });

  // Dialog konfirmasi hapus
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [processId, setProcessId] = useState<number | null>(null);
  const [processAmount, setProcessAmount] = useState("");
  const [processNote, setProcessNote] = useState("");

  const invalidateSavings = () => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
    qc.invalidateQueries({ queryKey: WITHDRAWAL_QUERY_KEY });
    qc.invalidateQueries({ queryKey: ["pending-withdrawals-notif"] });
  };

  const {
    data: withdrawalHistory = [],
    isLoading: wLoading,
    isError: wError,
    error: withdrawalError,
    refetch: refetchWithdrawals,
  } = useQuery<WithdrawalRecord[]>({
    queryKey: ["user-withdrawals", selectedUserId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/savings/withdrawals?userId=${selectedUserId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat riwayat penarikan");
      return res.json();
    },
    enabled: isAdmin && !!selectedUserId,
    staleTime: 30_000,
  });

  const {
    data: users = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<UserSummary[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/savings/admin-overview`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat data tabungan");
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const selected = useMemo(
    () => users.find(u => u.userId === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const availableYears = useMemo(() => {
    if (!selected) return [];
    const yrs = new Set(selected.ledger.map(r => r.year));
    return [...yrs].sort((a, b) => b - a);
  }, [selected]);

  const filteredLedger = useMemo(() => {
    if (!selected) return [];
    if (filterYear === "semua") return selected.ledger;
    return selected.ledger.filter(r => r.year === Number(filterYear));
  }, [selected, filterYear]);

  const addMutation = useMutation({
    mutationFn: async () => {
      const amount = parseInt(form.amount.replace(/\D/g, ""));
      if (!selectedUserId || isNaN(amount) || amount < 1) throw new Error("Data tidak valid");
      const month = parseInt(form.month);
      const year = parseInt(form.year);
      if (!month || !year) throw new Error("Bulan dan tahun wajib diisi");
      const res = await fetch(`${BASE}/api/savings/admin-withdrawal`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, amount, reason: form.reason || null, month, year }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal menyimpan");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pengeluaran berhasil ditambahkan" });
      invalidateSavings();
      setAddOpen(false);
      setForm({ amount: "", reason: "", month: String(currentMonth), year: String(currentYear) });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/savings/admin-withdrawal/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal menghapus");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pengeluaran dihapus" });
      invalidateSavings();
      setDeleteId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
      setDeleteId(null);
    },
  });

  const processMutation = useMutation({
    mutationFn: async ({ id, status, approvedAmount, adminNote }: {
      id: number;
      status: "approved" | "rejected";
      approvedAmount?: number;
      adminNote?: string;
    }) => {
      const res = await fetch(`${BASE}/api/savings/withdrawals/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approvedAmount, adminNote: adminNote || undefined }),
      });
      const result = await res.json() as { error?: string };
      if (!res.ok) throw new Error(result.error ?? "Gagal memproses pengajuan");
      return result;
    },
    onSuccess: (_result, variables) => {
      toast({
        title: variables.status === "approved" ? "Pencairan disetujui" : "Pencairan ditolak",
      });
      invalidateSavings();
      setProcessId(null);
      setProcessAmount("");
      setProcessNote("");
    },
    onError: (e: Error) => toast({
      title: "Gagal memproses pencairan",
      description: e.message,
      variant: "destructive",
    }),
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${BASE}/api/savings/sync`, {
        method: "POST",
        credentials: "include",
      });
      const result = await res.json() as { syncedUsers?: number; error?: string };
      if (!res.ok) throw new Error(result.error ?? "Gagal sinkronisasi tabungan");
      toast({
        title: "Sync tabungan berhasil",
        description: `${result.syncedUsers ?? 0} karyawan diperbarui.`,
      });
      await refetch();
    } catch (e) {
      toast({
        title: "Sync tabungan gagal",
        description: e instanceof Error ? e.message : "Terjadi kesalahan saat sinkronisasi.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      selectedUserId ? refetchWithdrawals() : Promise.resolve(),
    ]);
  };

  const selectedWithdrawal = withdrawalHistory.find(withdrawal => withdrawal.id === processId);
  const processWithdrawal = (status: "approved" | "rejected") => {
    if (!processId) return;
    const amount = parseInt(processAmount.replace(/\D/g, ""), 10);
    if (status === "approved") {
      if (!selectedWithdrawal || isNaN(amount) || amount < 1) {
        toast({ title: "Jumlah disetujui tidak valid", variant: "destructive" });
        return;
      }
      if (amount > selectedWithdrawal.requestedAmount) {
        toast({
          title: "Jumlah melebihi pengajuan",
          description: "Persetujuan sebagian boleh, tetapi jumlah tidak boleh melebihi pengajuan.",
          variant: "destructive",
        });
        return;
      }
    }
    processMutation.mutate({
      id: processId,
      status,
      approvedAmount: status === "approved" ? amount : undefined,
      adminNote: processNote.trim() || undefined,
    });
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Halaman ini hanya untuk Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <PiggyBank className="h-6 w-6 text-amber-500" />
            Kelola Tabungan
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Pantau saldo, riwayat, pengeluaran, dan pengajuan pencairan karyawan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={handleRefresh}
            disabled={isFetching || syncing}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-9 gap-2"
            onClick={handleSync}
            disabled={syncing || isFetching}
          >
            {syncing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            {syncing ? "Menyinkronkan..." : "Sync Tabungan"}
          </Button>
        </div>
      </div>

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error instanceof Error ? error.message : "Gagal memuat data tabungan."}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Coba lagi
            </Button>
          </CardContent>
        </Card>
      )}

      <ImportSavingsPanel allUsers={users} onDone={invalidateSavings} />

      {/* Pilih karyawan + ringkasan */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* Combobox pencarian karyawan */}
        <div className="w-full sm:w-72 shrink-0 space-y-1.5" ref={comboRef}>
          <Label>Pilih Karyawan</Label>
          {isLoading ? (
            <div className="h-9 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat...
            </div>
          ) : (
            <div className="relative">
              {/* Trigger button */}
              <button
                type="button"
                onClick={() => { setComboOpen(o => !o); setSearch(""); }}
                className={cn(
                  "w-full h-9 flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors text-left",
                  "hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-1 focus:ring-ring",
                  comboOpen && "ring-1 ring-ring"
                )}
              >
                {selected ? (
                  <span className="flex-1 truncate">
                    {selected.name}
                    <span className="ml-1.5 text-xs text-muted-foreground capitalize">({selected.role})</span>
                  </span>
                ) : (
                  <span className="flex-1 text-muted-foreground">— Pilih karyawan —</span>
                )}
                <span className="flex items-center gap-1 shrink-0">
                  {selected && (
                    <span
                      role="button"
                      onClick={e => { e.stopPropagation(); setSelectedUserId(null); setFilterYear("semua"); }}
                      className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                    >
                      <X className="h-3 w-3" />
                    </span>
                  )}
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", comboOpen && "rotate-180")} />
                </span>
              </button>

              {/* Dropdown panel */}
              {comboOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                  {/* Search box */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      autoFocus
                      placeholder="Cari nama karyawan..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                  {/* List */}
                  <ul className="max-h-60 overflow-y-auto py-1">
                    {users
                      .slice().sort((a, b) => a.name.localeCompare(b.name, "id"))
                      .filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase()))
                      .map(u => (
                        <li
                          key={u.userId}
                          onClick={() => { setSelectedUserId(u.userId); setFilterYear("semua"); setComboOpen(false); setSearch(""); }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                            selectedUserId === u.userId && "bg-accent/60 font-medium"
                          )}
                        >
                          <span className="flex-1 truncate">{u.name}</span>
                          <span className="text-xs text-muted-foreground capitalize shrink-0">{u.role}</span>
                        </li>
                      ))
                    }
                    {users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                      <li className="px-3 py-4 text-sm text-center text-muted-foreground">Tidak ditemukan</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Summary cards */}
        {selected && (
          <div className="flex gap-3 flex-wrap flex-1">
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Masuk</p>
                <p className="text-lg font-bold text-emerald-600 font-serif mt-0.5">{fmt(selected.totalIn)}</p>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Keluar</p>
                <p className="text-lg font-bold text-red-600 font-serif mt-0.5">{fmt(selected.totalOut)}</p>
              </CardContent>
            </Card>
            <Card className="flex-1 min-w-[130px]">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Saldo Aktif</p>
                <p className={cn("text-lg font-bold font-serif mt-0.5", selected.saldo >= 0 ? "text-amber-600" : "text-red-600")}>
                  {fmt(selected.saldo)}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Ledger */}
      {selected && (
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base font-semibold">
              Riwayat Tabungan — {selected.name}
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter tahun */}
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="h-8 text-sm w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semua">Semua Tahun</SelectItem>
                  {availableYears.map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Tombol tambah pengeluaran */}
              <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 h-8">
                <Plus className="h-3.5 w-3.5" /> Tambah Pengeluaran
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 text-center font-semibold">No</TableHead>
                    <TableHead className="font-semibold">Bulan</TableHead>
                    <TableHead className="font-semibold">Tahun</TableHead>
                    <TableHead className="text-right font-semibold text-emerald-700">Masuk</TableHead>
                    <TableHead className="text-right font-semibold text-red-600">Keluar</TableHead>
                    <TableHead className="text-right font-semibold">Saldo</TableHead>
                    <TableHead className="font-semibold">Keterangan</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLedger.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        Belum ada riwayat tabungan{filterYear !== "semua" ? ` di tahun ${filterYear}` : ""}
                      </TableCell>
                    </TableRow>
                  ) : filteredLedger.map((row, idx) => {
                    const isManual = row.type === "out" && row.isManual === true;
                    return (
                      <TableRow key={`${row.type}-${row.id}`} className={cn(
                        "hover:bg-muted/30",
                        row.type === "out" && "bg-red-50/30 dark:bg-red-950/10"
                      )}>
                        <TableCell className="text-center text-sm text-muted-foreground font-mono">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{MONTHS[row.month - 1]}</TableCell>
                        <TableCell className="text-muted-foreground">{row.year}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-700">
                          {row.type === "in" ? fmt(row.amount) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-medium text-red-600">
                          {row.type === "out" ? fmt(row.amount) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          <span className={row.saldo >= 0 ? "text-amber-700 dark:text-amber-400" : "text-red-600"}>
                            {fmt(row.saldo)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                          {row.type === "in"
                            ? (row.notes ?? <span className="italic">Tabungan bulanan</span>)
                            : (
                              <span className="flex items-center gap-1.5">
                                {row.reason ?? "—"}
                                {isManual && (
                                  <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">
                                    Manual
                                  </Badge>
                                )}
                              </span>
                            )
                          }
                        </TableCell>
                        <TableCell>
                          {isManual && (
                            <button
                              onClick={() => setDeleteId(row.withdrawalId!)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              title="Hapus pengeluaran ini"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Riwayat Pengajuan Pencairan ── */}
      {selected && (
        <Card className="shadow-sm overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              Riwayat Pengajuan Pencairan — {selected.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {wLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat riwayat...
              </div>
            ) : wError ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {withdrawalError instanceof Error
                    ? withdrawalError.message
                    : "Gagal memuat riwayat pengajuan."}
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchWithdrawals()}>
                  Coba lagi
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10 text-center font-semibold">No</TableHead>
                      <TableHead className="font-semibold">Tanggal Diajukan</TableHead>
                      <TableHead className="text-right font-semibold">Diajukan</TableHead>
                      <TableHead className="text-right font-semibold">Disetujui</TableHead>
                      <TableHead className="font-semibold">Alasan</TableHead>
                      <TableHead className="font-semibold">Catatan Admin</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="text-right font-semibold">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawalHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                          Belum ada riwayat pengajuan pencairan
                        </TableCell>
                      </TableRow>
                    ) : withdrawalHistory.map((w, idx) => (
                      <TableRow key={w.id} className={cn(
                        "hover:bg-muted/30",
                        w.status === "pending" && "bg-amber-50/40 dark:bg-amber-950/10",
                        w.status === "rejected" && "bg-red-50/30 dark:bg-red-950/10",
                      )}>
                        <TableCell className="text-center text-sm text-muted-foreground font-mono">{idx + 1}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {new Date(w.requestedAt).toLocaleString("id-ID", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {fmt(w.requestedAmount)}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {w.approvedAmount != null
                            ? <span className="text-emerald-700">{fmt(w.approvedAmount)}</span>
                            : <span className="text-muted-foreground">—</span>
                          }
                        </TableCell>
                        <TableCell className="text-sm max-w-[180px]">
                          <span className="line-clamp-2 text-muted-foreground">{w.reason ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-sm max-w-[160px]">
                          <span className="line-clamp-2 text-muted-foreground">{w.adminNote ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          {w.status === "pending" && (
                            <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100 text-xs">
                              <Clock className="h-3 w-3" /> Menunggu
                            </Badge>
                          )}
                          {w.status === "approved" && (
                            <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100 text-xs">
                              <CheckCircle className="h-3 w-3" /> Disetujui
                            </Badge>
                          )}
                          {w.status === "rejected" && (
                            <Badge className="gap-1 bg-red-100 text-red-700 border-red-300 hover:bg-red-100 text-xs">
                              <XCircle className="h-3 w-3" /> Ditolak
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {w.status === "pending" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => {
                                setProcessId(w.id);
                                setProcessAmount(String(w.requestedAmount));
                                setProcessNote("");
                              }}
                            >
                              Proses
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!selected && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-2">
          <PiggyBank className="h-12 w-12 opacity-30" />
          <p className="text-sm">Pilih karyawan untuk melihat riwayat tabungan</p>
        </div>
      )}

      {/* ── Dialog Proses Pengajuan Pencairan ──────────────────────────────── */}
      <Dialog
        open={processId !== null}
        onOpenChange={open => {
          if (!open && !processMutation.isPending) {
            setProcessId(null);
            setProcessAmount("");
            setProcessNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Proses Pengajuan Pencairan</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <p>
                  <strong>{selected?.name ?? selectedWithdrawal?.username}</strong> mengajukan{" "}
                  <strong>{selectedWithdrawal ? fmt(selectedWithdrawal.requestedAmount) : "—"}</strong>.
                </p>
                {selectedWithdrawal?.reason && <p>Alasan: {selectedWithdrawal.reason}</p>}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="process-amount">Jumlah Disetujui</Label>
              <Input
                id="process-amount"
                type="text"
                inputMode="numeric"
                value={processAmount}
                onChange={event => setProcessAmount(event.target.value.replace(/\D/g, ""))}
                placeholder={selectedWithdrawal ? String(selectedWithdrawal.requestedAmount) : ""}
                disabled={processMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Boleh lebih kecil dari jumlah pengajuan untuk persetujuan sebagian.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="process-note">Catatan Admin</Label>
              <Textarea
                id="process-note"
                value={processNote}
                onChange={event => setProcessNote(event.target.value)}
                placeholder="Catatan untuk karyawan (opsional)"
                rows={3}
                disabled={processMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => processWithdrawal("rejected")}
              disabled={processMutation.isPending}
            >
              {processMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Tolak
            </Button>
            <Button
              type="button"
              onClick={() => processWithdrawal("approved")}
              disabled={processMutation.isPending || !processAmount}
            >
              {processMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Setujui
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Tambah Pengeluaran ────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={v => { if (!v) { setAddOpen(false); setForm({ amount: "", reason: "", month: String(currentMonth), year: String(currentYear) }); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-red-500" />
              Tambah Pengeluaran Tabungan
            </DialogTitle>
            <DialogDescription>
              Input pengeluaran tabungan untuk <strong>{selected?.name}</strong>.
              Data langsung tercatat sebagai pengeluaran yang sudah disetujui.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Bulan & Tahun */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Bulan</Label>
                <Select value={form.month} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tahun</Label>
                <Select value={form.year} onValueChange={v => setForm(f => ({ ...f, year: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: currentYear - 2012 + 1 }, (_, i) => currentYear - i).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Jumlah (Rp)</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Contoh: 500000"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, "") }))}
              />
              {form.amount && (
                <p className="text-xs text-muted-foreground">{fmt(Number(form.amount))}</p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label>Alasan / Keterangan</Label>
              <Textarea
                placeholder="Contoh: Ambil tabungan Agustus 2025 sebelum pakai aplikasi"
                value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setAddOpen(false); setForm({ amount: "", reason: "", month: String(currentMonth), year: String(currentYear) }); }}
              disabled={addMutation.isPending}>
              Batal
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending || !form.amount}
              className="gap-1.5"
            >
              {addMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...</>
                : <><Plus className="h-4 w-4" /> Simpan Pengeluaran</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Konfirmasi Hapus ──────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pengeluaran?</AlertDialogTitle>
            <AlertDialogDescription>
              Data pengeluaran manual ini akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 gap-1.5"
            >
              {deleteMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Menghapus...</>
                : <><Trash2 className="h-4 w-4" /> Ya, Hapus</>
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
