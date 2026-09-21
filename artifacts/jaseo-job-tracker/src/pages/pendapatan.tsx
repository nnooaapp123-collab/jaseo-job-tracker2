import { useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  Wallet, Phone, PiggyBank, Loader2, ChevronLeft, ChevronRight,
  AlertCircle, BookOpen, Star, Plus, Trash2, Users, Printer, CheckCircle2, Clock,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SlipGajiDialog } from "@/components/slip-gaji-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

import {
  useGetMonthlySalary,
  useGetCsSalary,
  useListAdditionalIncome,
  useAddAdditionalIncome,
  useDeleteAdditionalIncome,
  useListUsers,
  useListWriters,
  getListAdditionalIncomeQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hitungGajiPenulis(kata: number): number {
  if (kata <= 0)      return 0;
  // Math.max memastikan gaji tidak turun saat naik tier (sama dengan rumus server)
  if (kata >= 115000) return Math.max(kata * 32 - 1_650_000, hitungGajiPenulis(114999));
  if (kata >= 103000) return Math.max(kata * 32 - 1_600_000, hitungGajiPenulis(102999));
  if (kata >= 91200)  return Math.max(kata * 32 - 1_500_000, hitungGajiPenulis(91199));
  if (kata >= 79200)  return Math.max(kata * 32 - 1_400_000, hitungGajiPenulis(79199));
  if (kata >= 76800)  return Math.max(kata * 32 - 1_350_000, hitungGajiPenulis(76799));
  if (kata >= 72000)  return Math.max(kata * 32 - 1_300_000, hitungGajiPenulis(71999));
  if (kata >= 67200)  return Math.max(kata * 32 - 1_200_000, hitungGajiPenulis(67199));
  if (kata >= 55200)  return Math.max(kata * 32 - 1_100_000, hitungGajiPenulis(55199));
  // < 55200 kata: kata × 25 ÷ 2
  return Math.floor((kata * 25) / 2);
}

const fmt = (n: number) =>
  "Rp" + n.toLocaleString("id-ID");

const BULAN_NAMES = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Transfer Status Banner ────────────────────────────────────────────────────
function TransferStatusBanner({
  year, month, targetUserId,
}: {
  year: number; month: number; targetUserId: number | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["transfer-status", targetUserId, year, month],
    queryFn: async () => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (targetUserId) params.set("userId", String(targetUserId));
      const r = await fetch(`${BASE}/api/salary/transfer-status?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal");
      return r.json() as Promise<{ transferred: boolean; transferredAt: string | null }>;
    },
    enabled: !!targetUserId,
    staleTime: 30_000,
  });

  if (isLoading || !data) return null;

  if (data.transferred) {
    const tgl = data.transferredAt
      ? format(new Date(data.transferredAt), "d MMMM yyyy", { locale: localeId })
      : "";
    return (
      <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2 text-sm text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>Gaji sudah ditransfer{tgl ? ` · ${tgl}` : ""}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
      <Clock className="h-4 w-4 shrink-0" />
      <span>Gaji belum ditransfer</span>
    </div>
  );
}

// ─── Baris ringkasan ──────────────────────────────────────────────────────────
function Baris({
  label, nilai, highlight = false, muted = false, isTabungan = false,
}: {
  label: string; nilai: number; highlight?: boolean; muted?: boolean; isTabungan?: boolean;
}) {
  return (
    <div className={cn(
      "flex justify-between items-center py-2 px-1",
      highlight && "font-semibold text-base",
      muted && "text-muted-foreground text-sm",
      isTabungan && "border border-dashed border-amber-400 rounded-lg px-3 bg-amber-50",
    )}>
      <span className={cn("text-sm", highlight && "text-base font-semibold")}>{label}</span>
      <span className={cn(
        "tabular-nums font-mono",
        highlight ? "text-emerald-700 font-bold text-lg" : "text-sm",
        isTabungan && "text-amber-700 font-semibold",
      )}>
        {fmt(nilai)}
      </span>
    </div>
  );
}

// ─── Tier progress bar ────────────────────────────────────────────────────────
const TIERS = [5000, 55200, 67200, 72000, 76800, 79200, 91200, 103000, 115000];
function TierBar({ kata }: { kata: number }) {
  const tierIdx = TIERS.findLastIndex(t => kata >= t);
  const pct = tierIdx < 0 ? 0 : tierIdx >= TIERS.length - 1 ? 100
    : Math.round(((kata - TIERS[tierIdx]) / (TIERS[tierIdx + 1] - TIERS[tierIdx])) * 100);
  return (
    <div className="mt-2 mb-1">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>Tier {tierIdx < 0 ? 0 : tierIdx + 1}</span>
        <span>{kata.toLocaleString("id-ID")} kata</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {tierIdx >= 0 && tierIdx < TIERS.length - 1 && (
        <p className="text-xs text-muted-foreground mt-1">
          +{(TIERS[tierIdx + 1] - kata).toLocaleString("id-ID")} kata menuju tier berikutnya
        </p>
      )}
    </div>
  );
}

// ─── Section: Pendapatan Lainnya ──────────────────────────────────────────────
function PendapatanLainnya({
  targetUserId, year, month, isAdmin,
}: {
  targetUserId: number; year: number; month: number; isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [addDesc, setAddDesc] = useState("");

  const { data: items = [], isLoading } = useListAdditionalIncome(
    { userId: targetUserId, year, month },
    { query: { enabled: !!targetUserId } as any }
  );
  const addMutation = useAddAdditionalIncome();
  const deleteMutation = useDeleteAdditionalIncome();

  const handleAdd = async () => {
    const amount = parseInt(addAmount.replace(/\D/g, ""));
    if (!amount) return;
    await addMutation.mutateAsync({
      data: { userId: targetUserId, year, month, amount, description: addDesc || null },
    });
    qc.invalidateQueries({ queryKey: getListAdditionalIncomeQueryKey({ userId: targetUserId, year, month }) });
    setAddAmount("");
    setAddDesc("");
    setShowAdd(false);
  };

  const handleDelete = async (id: number) => {
    await deleteMutation.mutateAsync({ id });
    qc.invalidateQueries({ queryKey: getListAdditionalIncomeQueryKey({ userId: targetUserId, year, month }) });
  };

  const total = items.reduce((a, b) => a + b.amount, 0);

  if (isLoading) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
          Pendapatan Lainnya
        </p>
        {isAdmin && (
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="h-3 w-3 mr-1" /> Tambah
          </Button>
        )}
      </div>
      {items.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Tidak ada</p>
      )}
      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between py-1 px-1">
          <span className="text-sm text-muted-foreground">{item.description || "Lainnya"}</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono tabular-nums">{fmt(item.amount)}</span>
            {isAdmin && (
              <Button
                size="icon" variant="ghost" className="h-6 w-6 text-destructive"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
      {total > 0 && <Baris label="Subtotal lainnya" nilai={total} muted />}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Pendapatan Lainnya</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Jumlah (Rp)</label>
              <Input
                placeholder="contoh: 50000"
                value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Keterangan (opsional)</label>
              <Input
                placeholder="contoh: Bonus project"
                value={addDesc}
                onChange={e => setAddDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Batal</Button>
            <Button onClick={handleAdd} disabled={addMutation.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Section: Salary Penulis / Editor ─────────────────────────────────────────
function SalaryPenulisEditor({
  year, month, targetUserId, isAdmin,
}: {
  year: number; month: number; targetUserId: number | null; isAdmin: boolean;
}) {
  const params = targetUserId
    ? { year, month, ...(isAdmin ? { targetUserId } : {}) }
    : { year, month };

  const { data, isLoading, error } = useGetMonthlySalary(params, {
    query: { enabled: !!targetUserId || !isAdmin } as any,
  });

  const { data: additionalItems = [] } = useListAdditionalIncome(
    { userId: targetUserId ?? 0, year, month },
    { query: { enabled: !!targetUserId } as any }
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>;
  if (error) return <Alert variant="destructive"><AlertDescription>Gagal memuat data</AlertDescription></Alert>;
  if (!data) return null;

  // Kata yang SELESAI (untuk gaji) vs semua kata (untuk info)
  const writerKataSelesai = data.totalWords ?? 0;
  const writerKataSemua   = data.allWords ?? 0;
  const writerJobSelesai  = data.totalJobs ?? 0;
  const writerJobSemua    = data.allJobs ?? 0;

  const editorKataSelesai = data.editorTotalWords ?? 0;
  const editorKataSemua   = data.allEditorWords ?? 0;
  const editorJobSelesai  = data.editorTotalJobs ?? 0;
  const editorJobSemua    = data.allEditorJobs ?? 0;

  const hasEditor  = !!(data.editorId);
  const userRole   = data.role;
  const isPenulis  = !!data.writerId;

  const writerIncome = isPenulis ? hitungGajiPenulis(writerKataSelesai) : 0;
  const editorIncome = editorKataSelesai > 0 ? Math.floor(editorKataSelesai * 4.7) : 0;

  // Pulsa: penulis threshold / editor unconditional
  const pulsaOk = hasEditor ? true : writerKataSelesai >= 48_100;
  const pulsa   = pulsaOk ? 70_000 : 0;

  // Tabungan (separate): penulis threshold / editor unconditional
  const tabunganOk = hasEditor ? true : writerKataSelesai >= 70_000;
  const tabungan   = tabunganOk ? 100_000 : 0;

  // Bonus 5%: hanya penulis (termasuk dual-role) dengan syarat ≥80.000 kata tulis
  const isPenulisRole = userRole === "penulis" || (userRole === "editor" && isPenulis);
  const bonusBase = writerIncome + editorIncome + pulsa;
  const bonusOk   = isPenulisRole && writerKataSelesai >= 80_000;
  const bonus     = bonusOk ? Math.floor(bonusBase * 0.05) : 0;

  const lainnyaTotal = additionalItems.reduce((a, b) => a + b.amount, 0);
  const total = writerIncome + editorIncome + pulsa + bonus + lainnyaTotal;

  const displayId = targetUserId ?? 0;

  return (
    <div className="space-y-1">
      {/* Writer portion */}
      {isPenulis && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1 mb-1">
            Pendapatan Penulis
          </p>
          {/* Info selesai vs total */}
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-1">
            <span>Job selesai: <strong className="text-foreground">{writerJobSelesai}</strong> dari <strong className="text-foreground">{writerJobSemua}</strong></span>
            <span>Kata selesai: <strong className="text-emerald-600">{writerKataSelesai.toLocaleString("id-ID")}</strong> dari {writerKataSemua.toLocaleString("id-ID")}</span>
          </div>
          <TierBar kata={writerKataSelesai} />
          <Baris
            label={`Pendapatan artikel (${writerKataSelesai.toLocaleString("id-ID")} kata selesai)`}
            nilai={writerIncome}
          />
        </>
      )}

      {/* Editor portion */}
      {hasEditor && (
        <>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-1">
            Pendapatan Editor
          </p>
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1 mb-1">
            <span>Artikel diedit selesai: <strong className="text-foreground">{editorJobSelesai}</strong> dari <strong className="text-foreground">{editorJobSemua}</strong></span>
            <span>Kata: <strong className="text-purple-600">{editorKataSelesai.toLocaleString("id-ID")}</strong></span>
          </div>
          <Baris label={`Edit artikel (${editorKataSelesai.toLocaleString("id-ID")} kata × Rp4,7)`} nilai={editorIncome} />
        </>
      )}

      <Separator className="my-2" />

      {/* Pulsa & Tabungan */}
      <Baris
        label={`Uang pulsa${!pulsaOk ? ` (butuh ≥48.100 kata)` : ""}`}
        nilai={pulsa}
        muted={!pulsaOk}
      />
      <Baris
        label={`Tabungan${!tabunganOk ? ` (butuh ≥70.000 kata)` : ""} *`}
        nilai={tabungan}
        isTabungan
      />
      {/* Bonus 5%: hanya penulis (termasuk dual-role) */}
      {isPenulisRole && (
        <Baris
          label={`Bonus 5%${!bonusOk ? ` (butuh ≥80.000 kata)` : ""}`}
          nilai={bonus}
          muted={!bonusOk}
        />
      )}

      {/* Pendapatan lainnya */}
      <Separator className="my-2" />
      <PendapatanLainnya
        targetUserId={displayId}
        year={year} month={month}
        isAdmin={isAdmin}
      />

      {/* Total */}
      <Separator className="my-2" />
      <Baris label="TOTAL (tidak termasuk tabungan)" nilai={total} highlight />
      <p className="text-xs text-muted-foreground italic px-1">
        * Tabungan Rp100.000 tidak dimasukkan ke total · Gaji hanya dari job yang sudah selesai (✓)
      </p>
    </div>
  );
}

// ─── Section: Salary CS ───────────────────────────────────────────────────────
function SalaryCS({
  year, month, csUserId, isAdmin,
}: {
  year: number; month: number; csUserId: number; isAdmin: boolean;
}) {
  const { data, isLoading, error } = useGetCsSalary({ year, month });
  const { data: additionalItems = [] } = useListAdditionalIncome(
    { userId: csUserId, year, month },
    { query: { enabled: !!csUserId } as any }
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin h-6 w-6" /></div>;
  if (error) return <Alert variant="destructive"><AlertDescription>Gagal memuat data</AlertDescription></Alert>;
  if (!data) return null;

  const lainnyaTotal = additionalItems.reduce((a, b) => a + b.amount, 0);
  const pulsa = 70_000;
  const tabungan = 100_000;
  const total = data.pendapatanArtikel + pulsa + lainnyaTotal;

  return (
    <div className="space-y-1">
      {/* Info rekap tim — sebagai referensi, tidak masuk perhitungan CS */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1 mb-1">
        Info Rekap Tim (dari job selesai ✓)
      </p>
      <Baris label={`Gaji ${data.writerCount} Penulis (referensi)`} nilai={data.totalWriterSalary} muted />
      <Baris label={`Gaji ${data.editorCount} Editor (referensi)`} nilai={data.totalEditorSalary} muted />

      <Separator className="my-2" />

      {/* Pendapatan CS — dari pencapaian tertinggi */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1 mb-1">
        Pendapatan CS
      </p>
      <Baris
        label={`Pencapaian tertinggi penulis`}
        nilai={data.topAchievement}
      />
      <Baris
        label={`Bonus 5% dari pencapaian tertinggi`}
        nilai={data.bonus}
      />
      <Baris label="Subtotal Artikel CS" nilai={data.pendapatanArtikel} muted />

      <Separator className="my-2" />

      <Baris label="Uang Pulsa" nilai={pulsa} />
      <Baris label="Tabungan *" nilai={tabungan} isTabungan />

      <Separator className="my-2" />
      <PendapatanLainnya targetUserId={csUserId} year={year} month={month} isAdmin={isAdmin} />

      <Separator className="my-2" />
      <Baris label="TOTAL (tidak termasuk tabungan)" nilai={total} highlight />
      <p className="text-xs text-muted-foreground italic px-1">
        * Tabungan Rp100.000 tidak dimasukkan ke total · Gaji hanya dari job yang sudah selesai (✓)
      </p>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PendapatanPage() {
  const { currentUser: user } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [slipOpen, setSlipOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const isCS    = user?.role === "cs";

  // Admin: list all users
  const { data: allUsers = [] } = useListUsers({
    query: { enabled: isAdmin } as any,
  });

  // For non-admin, targetUserId is the logged-in user
  const targetUserId = isAdmin
    ? (selectedUserId ?? null)
    : (user?.id ?? null);

  // Find selected user profile (for admin display)
  const selectedUserProfile = isAdmin
    ? allUsers.find(u => u.id === selectedUserId)
    : null;

  // Determine what role the selected user has (for admin mode)
  const viewRole = isAdmin
    ? (selectedUserProfile?.role ?? null)
    : user?.role;

  // ── Month navigation ───────────────────────────────────────────────
  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // ── Access guard ────────────────────────────────────────────────────
  if (!user) return null;
  if (user.role === "editor" && !user.writerId && !user.editorId) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Akun Anda belum terhubung ke profil editor atau penulis.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const bulanLabel = `${BULAN_NAMES[month - 1]} ${year}`;

  // Determine if we show CS view or penulis/editor view
  const showCSView   = isAdmin ? viewRole === "cs"   : isCS;
  const showPenView  = isAdmin
    ? (viewRole === "penulis" || viewRole === "editor")
    : (!isCS && !isAdmin);

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pendapatan</h1>
          <p className="text-muted-foreground text-sm">
            {isAdmin ? "Rekap gaji semua pengguna" : "Rekap gaji bulan ini"}
          </p>
        </div>
        <Wallet className="h-7 w-7 text-emerald-500" />
      </div>

      {/* Admin: user selector */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Pilih Pengguna
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Select
              value={selectedUserId?.toString() ?? ""}
              onValueChange={v => setSelectedUserId(parseInt(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih pengguna..." />
              </SelectTrigger>
              <SelectContent>
                {allUsers
                  .filter(u => u.role !== "admin")
                  .filter(u => {
                    // Penulis: hanya yang aktif; CS/editor tidak perlu filter aktif
                    if (u.role === "penulis") return (u as any).isActive !== false;
                    return true;
                  })
                  .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username, "id"))
                  .map(u => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.displayName} ({u.role})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {/* Month navigator */}
      <Card>
        <CardContent className="flex items-center justify-between py-3 px-4">
          <Button variant="ghost" size="icon" onClick={goPrev}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="text-center">
            <p className="font-semibold text-lg">{bulanLabel}</p>
            <Badge variant="outline" className="text-xs mt-0.5">
              {isAdmin && selectedUserProfile
                ? selectedUserProfile.displayName
                : user.role === "penulis" ? user.writerName
                : user.role === "editor" ? user.editorName
                : "CS"}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={goNext}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>

      {/* Cetak Slip Gaji */}
      {(!isAdmin || !!selectedUserId) && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
            onClick={() => setSlipOpen(true)}
          >
            <Printer className="mr-2 h-4 w-4" />
            Cetak Slip Gaji
          </Button>
        </div>
      )}

      <SlipGajiDialog
        open={slipOpen}
        onClose={() => setSlipOpen(false)}
        year={year}
        month={month}
        targetUserId={targetUserId ?? null}
        viewRole={viewRole ?? null}
        isAdmin={isAdmin}
      />

      {/* Transfer status banner — show for non-admin, or when admin has selected a user */}
      {(!isAdmin || !!selectedUserId) && (
        <TransferStatusBanner year={year} month={month} targetUserId={targetUserId} />
      )}

      {/* Salary card */}
      {(isAdmin && !selectedUserId) ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Pilih pengguna untuk melihat rekap pendapatan.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-emerald-600" />
              Rincian Pendapatan — {bulanLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {showCSView && (
              <SalaryCS
                year={year}
                month={month}
                csUserId={targetUserId!}
                isAdmin={isAdmin}
              />
            )}
            {showPenView && (
              <SalaryPenulisEditor
                year={year}
                month={month}
                targetUserId={isAdmin ? targetUserId : null}
                isAdmin={isAdmin}
              />
            )}
            {!showCSView && !showPenView && (
              <p className="text-sm text-muted-foreground">Tidak ada data untuk ditampilkan.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Link ke Tabungan ─────────────────────────────────────────────────── */}
      {(!isAdmin || !!selectedUserId) && (
        <Card className="shadow-sm border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <PiggyBank className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Laporan Tabungan</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin && selectedUserProfile
                      ? `Riwayat tabungan ${selectedUserProfile.displayName}.`
                      : "Riwayat tabungan bulanan yang telah terkumpul."}
                  </p>
                </div>
              </div>
              <Link href={isAdmin && selectedUserId ? `/tabungan?userId=${selectedUserId}` : "/tabungan"}>
                <Button variant="outline" size="sm" className="shrink-0 border-amber-300 dark:border-amber-700">
                  Lihat Tabungan
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="text-xs text-muted-foreground px-1 space-y-1">
        <p className="flex items-center gap-1">
          <Phone className="h-3 w-3" /> Pulsa Rp70.000 — penulis ≥48.100 kata, editor/CS selalu
        </p>
        <p className="flex items-center gap-1">
          <PiggyBank className="h-3 w-3" /> Tabungan Rp100.000 — penulis ≥70.000 kata, editor/CS selalu (tidak masuk total)
        </p>
        <p className="flex items-center gap-1">
          <Star className="h-3 w-3" /> Bonus 5% — khusus penulis jika ≥80.000 kata selesai
        </p>
      </div>
    </div>
  );
}
