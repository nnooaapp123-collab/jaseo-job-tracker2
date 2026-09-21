import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, Loader2, PlayCircle, CheckCircle2, ChevronDown, ChevronUp,
  Plus, Trash2, UserCheck, AlertCircle, Info, Eye, EyeOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useListWriters, getListWritersQueryKey } from "@workspace/api-client-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface WriterWithCap {
  id: number;
  name: string;
  isActive?: boolean;
  maxDailyWords?: number | null;
}

interface ArticleOrder {
  id: number;
  jobCode: string;
  orderDate: string;
  deadlineDate: string | null;
  customerName: string | null;
  articleCount: number;
  bonusArticles: number;
  wordCount: number;
  tool: string | null;
  notes: string | null;
  website: string | null;
  siteUser: string | null;
  sitePassword: string | null;
  isScheduled: boolean;
  price: number;
}

interface Assignment {
  writerId: string;     // "__none__" = belum pilih
  count: string;        // as string for input
  perInterval: string;  // artikel per interval (default "1")
  intervalDays: string; // jarak hari antar interval (default "1")
}

interface PreviewRow {
  no: number;
  label: string;
  date: string;
  dayName: string;
  writerName: string;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function getWorkingDays(fromStr: string, toStr: string, holidaySet: Set<string> = new Set()): string[] {
  const days: string[] = [];
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const cur = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;
    if (cur.getDay() !== 0 && !holidaySet.has(dateStr)) {
      days.push(dateStr);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Berikan tanggal untuk tiap artikel seorang penulis berdasarkan ritme interval
// k = indeks artikel penulis ini (0-based)
// perInterval = artikel per kelompok, intervalDays = jarak hari kerja antar kelompok
function getWriterDate(k: number, perInterval: number, intervalDays: number, workingDays: string[]): string {
  if (workingDays.length === 0) return "";
  const batchIdx = Math.floor(k / perInterval);
  const dayOffset = batchIdx * intervalDays;
  return workingDays[Math.min(dayOffset, workingDays.length - 1)];
}

function fmtDate(d: string) {
  try { return format(parseISO(d), "dd MMM yyyy", { locale: localeId }); } catch { return d; }
}

function dayName(d: string) {
  try { return HARI[parseISO(d).getDay()]; } catch { return ""; }
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function JadwalkanPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdminOrCS = currentUser?.role === "admin" || currentUser?.role === "cs";

  // Data orders
  const { data: orders = [], isLoading } = useQuery<ArticleOrder[]>({
    queryKey: ["article-orders"],
    queryFn: async () => {
      const res = await fetch("/api/article-orders", { credentials: "include" });
      return res.json();
    },
    staleTime: 30_000,
  });

  // Writers
  const { data: writers = [] } = useListWriters({ query: { queryKey: getListWritersQueryKey() } });
  const activeWriters = useMemo(
    () => (writers as WriterWithCap[]).filter(w => w.isActive !== false).sort((a, b) => a.name.localeCompare(b.name, "id")),
    [writers]
  );

  // Hari Libur
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: holidays = [] } = useQuery<Array<{ id: number; date: string; name: string }>>({
    queryKey: ["holidays"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/holidays`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60_000,
  });
  const holidaySet = useMemo(() => new Set(holidays.map(h => h.date)), [holidays]);

  // Filter
  const [filterStatus, setFilterStatus] = useState<"semua" | "belum" | "sudah">("belum");
  const [filterSearch, setFilterSearch] = useState("");

  const filtered = useMemo(() => {
    let list = orders;
    if (filterStatus === "belum") list = list.filter(o => !o.isScheduled);
    if (filterStatus === "sudah") list = list.filter(o => o.isScheduled);
    if (filterSearch.trim()) {
      const q = filterSearch.toLowerCase();
      list = list.filter(o =>
        o.jobCode.toLowerCase().includes(q) ||
        (o.customerName ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, filterStatus, filterSearch]);

  // Dialog state
  const [dialogOrder, setDialogOrder] = useState<ArticleOrder | null>(null);
  const [startDate, setStartDate] = useState("");
  const [assignments, setAssignments] = useState<Assignment[]>([{ writerId: "__none__", count: "", perInterval: "1", intervalDays: "1" }]);

  // Beban kata per penulis per tanggal dari job yang sudah ada di dashboard
  const selectedWriterIds = useMemo(() => {
    if (!dialogOrder) return [];
    return assignments
      .map(a => parseInt(a.writerId))
      .filter(id => !isNaN(id) && id > 0);
  }, [assignments, dialogOrder]);

  const wordLoadsEndDate = dialogOrder?.deadlineDate ?? startDate;

  const { data: wordLoads = {} } = useQuery<Record<number, Record<string, number>>>({
    queryKey: ["jadwalkan-word-loads", selectedWriterIds.join(","), startDate, wordLoadsEndDate],
    queryFn: async () => {
      if (!startDate || selectedWriterIds.length === 0) return {};
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const params = new URLSearchParams({
        writerIds: selectedWriterIds.join(","),
        startDate,
        endDate: wordLoadsEndDate || startDate,
      });
      const res = await fetch(`${base}/api/jadwalkan/word-loads?${params}`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!dialogOrder && !!startDate && selectedWriterIds.length > 0,
    staleTime: 10_000,
  });

  // Hitung working days + preview (skip Minggu dan hari libur)
  const totalArticles = dialogOrder ? (dialogOrder.articleCount + dialogOrder.bonusArticles) : 0;
  const deadline = dialogOrder?.deadlineDate ?? startDate;
  const workingDays = useMemo(() => {
    if (!startDate || !deadline) return [];
    const days = getWorkingDays(startDate, deadline, holidaySet);
    return days.length > 0 ? days : [deadline];
  }, [startDate, deadline, holidaySet]);

  const totalAssigned = useMemo(() =>
    assignments.reduce((s, a) => s + (parseInt(a.count) || 0), 0),
    [assignments]
  );

  const preview = useMemo<PreviewRow[]>(() => {
    if (!dialogOrder || totalAssigned !== totalArticles || workingDays.length === 0) return [];

    // 1. Kumpulkan semua raw rows tanpa nomor urut
    type RawRow = { date: string; writerName: string };
    const raw: RawRow[] = [];
    for (const asgn of assignments) {
      const cnt = parseInt(asgn.count) || 0;
      const pi  = Math.max(1, parseInt(asgn.perInterval) || 1);
      const id  = Math.max(1, parseInt(asgn.intervalDays) || 1);
      const writer = activeWriters.find(w => w.id === parseInt(asgn.writerId));
      const writerName = writer?.name ?? "(belum dipilih)";
      for (let k = 0; k < cnt; k++) {
        raw.push({ date: getWriterDate(k, pi, id, workingDays), writerName });
      }
    }

    // 2. Urutkan berdasar tanggal (stable sort — urutan penulis dalam hari yang sama dipertahankan)
    raw.sort((a, b) => a.date.localeCompare(b.date));

    // 3. Beri nomor urut setelah sorting
    return raw.map((r, idx) => {
      const seq = idx + 1;
      const isBonus = seq > dialogOrder.articleCount;
      const label = isBonus
        ? `Bonus ${seq - dialogOrder.articleCount}`
        : `Artikel ${seq}`;
      const notesStr = dialogOrder.notes ? `${label} - ${dialogOrder.notes}` : label;
      return { no: seq, label, date: r.date, dayName: dayName(r.date), writerName: r.writerName, notes: notesStr };
    });
  }, [dialogOrder, assignments, workingDays, totalArticles, totalAssigned, activeWriters]);

  // Kapasitas: cek apakah assignment melebihi batas kata per hari penulis
  interface CapInfo {
    hasLimit: boolean;
    maxDailyWords: number;
    violations: { date: string; needed: number; existing: number }[];
  }

  const capacityInfo = useMemo<(CapInfo | null)[]>(() => {
    if (!dialogOrder || workingDays.length === 0) return assignments.map(() => null);
    const wc = dialogOrder.wordCount || 0;
    return assignments.map(asgn => {
      const wid = parseInt(asgn.writerId);
      if (isNaN(wid) || wid <= 0) return null;
      const writer = activeWriters.find(w => w.id === wid);
      const maxWords = writer?.maxDailyWords;
      if (!maxWords) return null; // tidak ada batas
      const cnt = parseInt(asgn.count) || 0;
      const pi  = Math.max(1, parseInt(asgn.perInterval) || 1);
      const id  = Math.max(1, parseInt(asgn.intervalDays) || 1);
      const violations: { date: string; needed: number; existing: number }[] = [];
      for (let k = 0; k < cnt; k += pi) {
        const batchIdx = Math.floor(k / pi);
        const dayIdx = batchIdx * id;
        const date = workingDays[Math.min(dayIdx, workingDays.length - 1)];
        const articlesThisDay = Math.min(pi, cnt - k);
        const needed = articlesThisDay * wc;
        const existing = wordLoads[wid]?.[date] ?? 0;
        if (existing + needed > maxWords) {
          violations.push({ date, needed, existing });
        }
      }
      return { hasLimit: true, maxDailyWords: maxWords, violations };
    });
  }, [dialogOrder, assignments, workingDays, wordLoads, activeWriters]);

  const hasCapacityViolation = capacityInfo.some(c => c && c.violations.length > 0);

  const [showPreview, setShowPreview] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // State konfirmasi "Selesai"
  const [doneConfirmOrder, setDoneConfirmOrder] = useState<ArticleOrder | null>(null);

  // Mutation "Selesai" (tandai terjadwal tanpa buat job)
  const markDoneMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await fetch(`/api/article-orders/${orderId}/mark-done`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Gagal menandai selesai");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Order ditandai selesai", description: "Order dipindahkan ke daftar Terjadwal." });
      qc.invalidateQueries({ queryKey: ["article-orders"] });
      setDoneConfirmOrder(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
    },
  });

  // Mutation
  const jadwalkanMutation = useMutation({
    mutationFn: async () => {
      if (!dialogOrder) return;
      const body = {
        orderId: dialogOrder.id,
        startDate,
        assignments: assignments.map(a => ({
          writerId: a.writerId === "__none__" ? null : parseInt(a.writerId),
          count: parseInt(a.count) || 0,
          perInterval: Math.max(1, parseInt(a.perInterval) || 1),
          intervalDays: Math.max(1, parseInt(a.intervalDays) || 1),
        })),
      };
      const res = await fetch("/api/jadwalkan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Gagal menjadwalkan");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Job berhasil dijadwalkan", description: `${data?.created ?? 0} baris job ditambahkan ke Dashboard` });
      qc.invalidateQueries({ queryKey: ["article-orders"] });
      qc.invalidateQueries({ queryKey: ["listJobs"] });
      setShowConfirmDialog(false);
      setDialogOrder(null);
    },
    onError: (e: Error) => {
      toast({ title: "Gagal", description: e.message, variant: "destructive" });
    },
  });

  // Helpers assignment
  function openDialog(order: ArticleOrder) {
    const today = format(new Date(), "yyyy-MM-dd");
    setDialogOrder(order);
    setStartDate(today);
    setAssignments([{ writerId: "__none__", count: String(order.articleCount + order.bonusArticles), perInterval: "1", intervalDays: "1" }]);
    setShowPreview(false);
    setShowConfirmDialog(false);
  }

  function addAssignment() {
    setAssignments(prev => [...prev, { writerId: "__none__", count: "", perInterval: "1", intervalDays: "1" }]);
  }

  function removeAssignment(i: number) {
    setAssignments(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateAssignment(i: number, field: keyof Assignment, value: string) {
    setAssignments(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a));
  }

  const canConfirm = totalAssigned === totalArticles && startDate && workingDays.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (!isAdminOrCS) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-center space-y-2">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Halaman ini hanya untuk Admin dan CS.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif font-bold tracking-tight">Jadwalkan Job</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pecah artikel order menjadi job harian dan bagikan ke penulis.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["belum", "semua", "sudah"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 transition-colors font-medium capitalize ${
                filterStatus === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {s === "belum" ? "Belum Dijadwalkan" : s === "sudah" ? "Sudah Dijadwalkan" : "Semua"}
            </button>
          ))}
        </div>
        <Input
          placeholder="Cari kode job / pelanggan..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="w-56 h-9"
        />
        <span className="text-xs text-muted-foreground">{filtered.length} order</span>
      </div>

      {/* Tabel */}
      <Card className="shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold">Kode Job</TableHead>
                <TableHead className="font-semibold">Pelanggan</TableHead>
                <TableHead className="font-semibold">Deadline</TableHead>
                <TableHead className="text-center font-semibold">Artikel</TableHead>
                <TableHead className="text-center font-semibold">Bonus</TableHead>
                <TableHead className="text-center font-semibold">Total</TableHead>
                <TableHead className="text-right font-semibold">Kata</TableHead>
                <TableHead className="font-semibold">Tool</TableHead>
                <TableHead className="text-center font-semibold">Status</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                    {filterStatus === "belum" ? "Semua order sudah dijadwalkan." : "Tidak ada order."}
                  </TableCell>
                </TableRow>
              ) : filtered.map(order => (
                <TableRow key={order.id} className={order.isScheduled ? "opacity-60" : ""}>
                  <TableCell className="font-mono font-semibold text-primary text-sm">
                    {order.jobCode}
                  </TableCell>
                  <TableCell className="text-sm">
                    {order.customerName ?? <span className="text-muted-foreground italic">—</span>}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {order.deadlineDate ? (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        {fmtDate(order.deadlineDate)}
                        <span className="text-xs text-muted-foreground">({dayName(order.deadlineDate)})</span>
                      </span>
                    ) : <span className="text-muted-foreground italic">—</span>}
                  </TableCell>
                  <TableCell className="text-center font-mono">{order.articleCount}</TableCell>
                  <TableCell className="text-center font-mono text-amber-600 dark:text-amber-400">
                    {order.bonusArticles > 0 ? order.bonusArticles : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center font-mono font-bold">
                    {order.articleCount + order.bonusArticles}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {order.wordCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{order.tool ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    {order.isScheduled ? (
                      <Badge variant="outline" className="bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700 dark:text-emerald-400 gap-1 text-xs">
                        <CheckCircle2 className="h-3 w-3" /> Terjadwal
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400 text-xs">
                        Belum
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!order.isScheduled && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:border-emerald-700 dark:hover:bg-emerald-950/30"
                          onClick={() => setDoneConfirmOrder(order)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Selesai
                        </Button>
                        <Button size="sm" onClick={() => openDialog(order)}
                          className="h-8 gap-1.5 text-xs">
                          <PlayCircle className="h-3.5 w-3.5" /> Jadwalkan
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Dialog Jadwalkan ─────────────────────────────────────────────────── */}
      <Dialog open={!!dialogOrder} onOpenChange={open => !open && setDialogOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">
              Jadwalkan Job — <span className="text-primary font-mono">{dialogOrder?.jobCode}</span>
            </DialogTitle>
          </DialogHeader>

          {dialogOrder && (
            <div className="space-y-5">
              {/* Info order */}
              <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Pelanggan:</span>{" "}
                  <span className="font-medium">{dialogOrder.customerName ?? "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Deadline:</span>{" "}
                  <span className="font-medium">
                    {dialogOrder.deadlineDate
                      ? `${fmtDate(dialogOrder.deadlineDate)} (${dayName(dialogOrder.deadlineDate)})`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total:</span>{" "}
                  <span className="font-semibold">
                    {dialogOrder.articleCount} artikel
                    {dialogOrder.bonusArticles > 0 && (
                      <> + <span className="text-amber-600">{dialogOrder.bonusArticles} bonus</span></>
                    )}
                    {" "}= <span className="text-primary">{totalArticles} job</span>
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Kata/artikel:</span>{" "}
                  <span className="font-medium">{dialogOrder.wordCount.toLocaleString()}</span>
                </div>
                {dialogOrder.notes && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Catatan:</span>{" "}
                    <span className="italic">{dialogOrder.notes}</span>
                  </div>
                )}
              </div>

              {/* Tanggal mulai */}
              <div className="grid gap-1.5">
                <Label>Tanggal Mulai</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  max={dialogOrder.deadlineDate ?? undefined}
                  className="w-52"
                />
                {workingDays.length > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3 text-blue-500" />
                    {workingDays.length} hari kerja ({fmtDate(workingDays[0])} — {fmtDate(workingDays[workingDays.length - 1])})
                    {" "}· Minggu dilewati
                  </p>
                )}
              </div>

              {/* Assignment builder */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Pembagian Penulis</Label>
                  <span className={`text-sm font-semibold ${
                    totalAssigned === totalArticles ? "text-emerald-600" :
                    totalAssigned > totalArticles ? "text-red-600" : "text-amber-600"
                  }`}>
                    {totalAssigned} / {totalArticles} artikel dialokasikan
                  </span>
                </div>

                {/* Header kolom */}
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 px-0.5">
                  <span className="text-xs font-medium text-muted-foreground">Penulis</span>
                  <span className="text-xs font-medium text-muted-foreground w-[5.5rem] text-center">Total Artikel</span>
                  <span className="text-xs font-medium text-muted-foreground w-[9rem] text-center">Ritme (art/hari)</span>
                  <span className="text-xs font-medium text-muted-foreground w-16 text-center">Estimasi</span>
                  <span className="w-6" />
                </div>

                <div className="space-y-3">
                  {assignments.map((asgn, i) => {
                    const pi  = Math.max(1, parseInt(asgn.perInterval) || 1);
                    const id  = Math.max(1, parseInt(asgn.intervalDays) || 1);
                    const cnt = parseInt(asgn.count) || 0;
                    const batches = cnt > 0 ? Math.ceil(cnt / pi) : 0;
                    const daysNeeded = batches > 0 ? (batches - 1) * id + 1 : 0;
                    const cap = capacityInfo[i];
                    const hasVio = cap && cap.violations.length > 0;
                    const wid = parseInt(asgn.writerId);
                    const writer = activeWriters.find(w => w.id === wid);
                    return (
                      <div key={i} className="space-y-1">
                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2">
                          {/* Writer select */}
                          <Select value={asgn.writerId} onValueChange={v => updateAssignment(i, "writerId", v)}>
                            <SelectTrigger className={`h-9 ${hasVio ? "border-red-400" : ""}`}>
                              <SelectValue placeholder="Pilih penulis..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Belum ditentukan —</SelectItem>
                              {activeWriters.map(w => (
                                <SelectItem key={w.id} value={String(w.id)}>
                                  <span className="flex items-center gap-2">
                                    <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                                    {w.name}
                                    {w.maxDailyWords && (
                                      <span className="text-xs text-muted-foreground">
                                        (maks {w.maxDailyWords.toLocaleString("id")} kata/hari)
                                      </span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Jumlah artikel */}
                          <div className="flex items-center gap-1">
                            <Input
                              type="number" min="1" max={totalArticles}
                              value={asgn.count}
                              onChange={e => updateAssignment(i, "count", e.target.value)}
                              placeholder="Jml"
                              className="w-16 h-9 text-center"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">artikel</span>
                          </div>

                          {/* Ritme: N artikel setiap X hari */}
                          <div className="flex items-center gap-1 w-[9rem]">
                            <Input
                              type="number" min="1"
                              value={asgn.perInterval}
                              onChange={e => updateAssignment(i, "perInterval", e.target.value)}
                              placeholder="1"
                              className={`w-12 h-9 text-center text-sm ${hasVio ? "border-red-400" : ""}`}
                              title="Jumlah artikel per kelompok"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">art /</span>
                            <Input
                              type="number" min="1"
                              value={asgn.intervalDays}
                              onChange={e => updateAssignment(i, "intervalDays", e.target.value)}
                              placeholder="1"
                              className="w-12 h-9 text-center text-sm"
                              title="Jarak hari kerja antar kelompok (1 = setiap hari)"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">hr</span>
                          </div>

                          {/* Estimasi hari selesai */}
                          <span className={`text-xs whitespace-nowrap font-medium w-16 text-center ${hasVio ? "text-red-600" : "text-blue-600 dark:text-blue-400"}`}>
                            {daysNeeded > 0 ? `~${daysNeeded} hari` : ""}
                          </span>

                          {/* Remove */}
                          {assignments.length > 1 ? (
                            <button
                              onClick={() => removeAssignment(i)}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              title="Hapus baris ini"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : <span className="w-6" />}
                        </div>

                        {/* Kapasitas per penulis */}
                        {cap && writer && (
                          <div className="ml-0.5 text-xs flex flex-wrap gap-x-3 gap-y-0.5">
                            {hasVio ? (
                              <span className="flex items-center gap-1 text-red-600">
                                <AlertCircle className="h-3 w-3" />
                                Melebihi kapasitas ({cap.maxDailyWords.toLocaleString("id")} kata/hari) pada {cap.violations.length} hari
                                — kurangi artikel/hari atau pilih penulis lain
                              </span>
                            ) : cap.hasLimit && cnt > 0 ? (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CheckCircle2 className="h-3 w-3" />
                                Kapasitas cukup ({cap.maxDailyWords.toLocaleString("id")} kata/hari)
                              </span>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button variant="outline" size="sm" onClick={addAssignment} className="gap-1.5 h-8">
                  <Plus className="h-3.5 w-3.5" /> Tambah Penulis
                </Button>

                {totalAssigned > totalArticles && (
                  <p className="text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Total melebihi jumlah artikel ({totalAssigned - totalArticles} lebih)
                  </p>
                )}
                {totalAssigned > 0 && totalAssigned < totalArticles && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Masih kurang {totalArticles - totalAssigned} artikel — semua {totalArticles} artikel harus dijadwalkan sebelum bisa disimpan
                  </p>
                )}
                {hasCapacityViolation && (
                  <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      Beberapa penulis melebihi kapasitas kata harian mereka.
                      Kurangi jumlah artikel/hari atau alihkan ke penulis lain agar jadwal bisa disimpan.
                    </span>
                  </div>
                )}
              </div>

              {/* Preview toggle — mencolok */}
              {canConfirm && (
                <div className="rounded-lg overflow-hidden border-2 border-primary/30 shadow-sm">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-primary/10 hover:bg-primary/15 transition-colors text-sm font-semibold text-primary"
                    onClick={() => setShowPreview(s => !s)}
                  >
                    <span className="flex items-center gap-2">
                      {showPreview
                        ? <EyeOff className="h-4 w-4" />
                        : <Eye className="h-4 w-4" />
                      }
                      {showPreview ? "Sembunyikan" : "Lihat"} Preview — {preview.length} job akan dibuat
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4 opacity-70" />
                      {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </span>
                  </button>

                  {showPreview && (
                    <div className="overflow-x-auto max-h-64 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                            <th className="text-left px-3 py-2 font-semibold w-28">Tanggal</th>
                            <th className="text-left px-3 py-2 font-semibold w-16">Hari</th>
                            <th className="text-left px-3 py-2 font-semibold">Penulis</th>
                            <th className="text-left px-3 py-2 font-semibold">Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row, i) => (
                            <tr key={i} className={`border-t ${row.label.startsWith("Bonus") ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}`}>
                              <td className="px-3 py-1.5 text-muted-foreground">{row.no}</td>
                              <td className="px-3 py-1.5 font-mono whitespace-nowrap">{fmtDate(row.date)}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{row.dayName}</td>
                              <td className="px-3 py-1.5 font-medium">{row.writerName}</td>
                              <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">{row.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDialogOrder(null)}>Batal</Button>
            <Button
              onClick={() => setShowConfirmDialog(true)}
              disabled={!canConfirm || jadwalkanMutation.isPending || hasCapacityViolation}
              className="gap-1.5"
            >
              {jadwalkanMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</>
                : <><PlayCircle className="h-4 w-4" /> Jadwalkan {totalArticles} Job</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Konfirmasi Selesai ─────────────────────────────────────────── */}
      <AlertDialog open={!!doneConfirmOrder} onOpenChange={open => !open && setDoneConfirmOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Tandai Order Selesai
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  Order ini akan ditandai sebagai selesai <strong>tanpa membuat job baru</strong> di dashboard.
                  Gunakan ini untuk order yang sudah dikerjakan di luar sistem.
                </p>
                <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Kode Order</span>
                    <span className="font-mono font-semibold text-primary">{doneConfirmOrder?.jobCode}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Pelanggan</span>
                    <span className="font-medium">{doneConfirmOrder?.customerName ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Total Artikel</span>
                    <span className="font-medium">{doneConfirmOrder ? doneConfirmOrder.articleCount + doneConfirmOrder.bonusArticles : 0} artikel</span>
                  </div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Tindakan ini tidak dapat dibatalkan.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markDoneMutation.isPending}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => doneConfirmOrder && markDoneMutation.mutate(doneConfirmOrder.id)}
              disabled={markDoneMutation.isPending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {markDoneMutation.isPending
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Memproses...</>
                : <><CheckCircle2 className="h-4 w-4" /> Ya, Tandai Selesai</>
              }
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Dialog Konfirmasi Jadwalkan ───────────────────────────────────────── */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-primary" />
              Konfirmasi Penjadwalan
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p className="text-muted-foreground">
                  Pastikan data berikut sudah benar sebelum dijadwalkan. Setelah diproses,
                  job akan langsung masuk ke Dashboard.
                </p>
                <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Kode Order</span>
                    <span className="font-mono font-semibold text-primary">{dialogOrder?.jobCode}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Pelanggan</span>
                    <span className="font-medium">{dialogOrder?.customerName ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Total Job</span>
                    <span className="font-medium">{totalArticles} artikel ({dialogOrder?.wordCount.toLocaleString("id")} kata/artikel)</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Mulai</span>
                    <span className="font-medium">{startDate ? fmtDate(startDate) : "—"}</span>
                  </div>
                  {dialogOrder?.deadlineDate && (
                    <div className="flex gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Deadline</span>
                      <span className="font-medium">{fmtDate(dialogOrder.deadlineDate)}</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-28 shrink-0">Penulis</span>
                    <span className="font-medium">
                      {assignments
                        .filter(a => a.writerId !== "__none__" && parseInt(a.count) > 0)
                        .map(a => {
                          const w = activeWriters.find(w => w.id === parseInt(a.writerId));
                          const pi = parseInt(a.perInterval) || 1;
                          const id = parseInt(a.intervalDays) || 1;
                          const ritme = id === 1 ? `${pi}/hari` : `${pi}art/${id}hr`;
                          return `${w?.name ?? "?"} (${a.count} art., ${ritme})`;
                        })
                        .join(" · ")}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Apakah semua data sudah benar?
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Periksa Lagi</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => jadwalkanMutation.mutate()}
              className="gap-1.5 bg-primary hover:bg-primary/90"
            >
              <PlayCircle className="h-4 w-4" /> Ya, Jadwalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
