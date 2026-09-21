import { useState, useEffect } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Loader2, Receipt, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

type MonthData = {
  salary: number;
  transferred: boolean;
  transferredAt: string | null;
};

type Employee = {
  userId: number;
  name: string;
  role: string;
  isDualRole: boolean;
  months: Record<number, MonthData>;
};

type MatrixData = {
  year: number;
  employees: Employee[];
  monthTotals: Record<number, number>;
};

type PendingToggle = {
  userId: number;
  month: number;
  name: string;
  salary: number;
  currentlyTransferred: boolean;
};

function fmtRibuan(n: number): string {
  if (n <= 0) return "—";
  return Math.round(n / 1000).toLocaleString("id-ID");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return format(new Date(iso), "d MMM", { locale: localeId });
}

export default function RekapGajiPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";
  const now = new Date();

  const [year, setYear] = useState(now.getFullYear());
  const [matrix, setMatrix] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);
  const yearStr = year.toString().slice(2);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    fetch(`${BASE}/api/salary/year-matrix?year=${year}`, { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error("Gagal memuat data rekap gaji");
        return r.json();
      })
      .then(setMatrix)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, isAdmin]);

  const handleCellClick = (emp: Employee, month: number) => {
    if (!isAdmin) return;
    const cell = emp.months[month];
    if (!cell || cell.salary <= 0) return;
    const key = `${emp.userId}-${month}`;
    if (toggling.has(key)) return;
    setPendingToggle({
      userId: emp.userId,
      month,
      name: emp.name,
      salary: cell.salary,
      currentlyTransferred: cell.transferred,
    });
  };

  const confirmToggle = async () => {
    if (!pendingToggle) return;
    const { userId, month } = pendingToggle;
    const key = `${userId}-${month}`;

    const emp = matrix?.employees.find(e => e.userId === userId);
    const cur = emp?.months[month];
    if (!cur) { setPendingToggle(null); return; }

    setPendingToggle(null);
    setToggling(prev => new Set(prev).add(key));

    const newTransferred = !cur.transferred;
    setMatrix(prev => prev && {
      ...prev,
      employees: prev.employees.map(e => e.userId !== userId ? e : {
        ...e,
        months: {
          ...e.months,
          [month]: {
            ...cur,
            transferred: newTransferred,
            transferredAt: newTransferred ? new Date().toISOString() : null,
          },
        },
      }),
    });

    try {
      const r = await fetch(`${BASE}/api/salary/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId, year, month }),
      });
      const data = await r.json();
      setMatrix(prev => prev && {
        ...prev,
        employees: prev.employees.map(e => e.userId !== userId ? e : {
          ...e,
          months: {
            ...e.months,
            [month]: { ...e.months[month], transferred: data.transferred, transferredAt: data.transferredAt },
          },
        }),
      });
    } catch {
      setMatrix(prev => prev && {
        ...prev,
        employees: prev.employees.map(e => e.userId !== userId ? e : {
          ...e,
          months: { ...e.months, [month]: cur },
        }),
      });
    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert>
          <AlertDescription>Halaman ini hanya tersedia untuk Admin.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const monthTotals: Record<number, number> = {};
  const transferredTotals: Record<number, number> = {};
  const notTransferredTotals: Record<number, number> = {};
  for (let m = 1; m <= 12; m++) {
    monthTotals[m] = matrix?.employees.reduce((s, e) => s + (e.months[m]?.salary ?? 0), 0) ?? 0;
    transferredTotals[m] = matrix?.employees.reduce((s, e) => {
      const cell = e.months[m];
      return s + (cell?.transferred && cell.salary > 0 ? cell.salary : 0);
    }, 0) ?? 0;
    notTransferredTotals[m] = matrix?.employees.reduce((s, e) => {
      const cell = e.months[m];
      return s + (!cell?.transferred && (cell?.salary ?? 0) > 0 ? cell.salary : 0);
    }, 0) ?? 0;
  }

  const totalTransferred = matrix?.employees.reduce((cnt, e) =>
    cnt + Object.values(e.months).filter(c => c.transferred && c.salary > 0).length, 0) ?? 0;
  const totalCells = matrix?.employees.reduce((cnt, e) =>
    cnt + Object.values(e.months).filter(c => c.salary > 0).length, 0) ?? 0;

  return (
    <div className="p-4 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rekap Gaji</h1>
          <p className="text-muted-foreground text-sm">Matriks gaji tahunan seluruh karyawan</p>
        </div>
        <Receipt className="h-7 w-7 text-emerald-500" />
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Tahun:</span>
          <Select value={year.toString()} onValueChange={v => setYear(parseInt(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {matrix && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-green-600">{totalTransferred}</span> / {totalCells} sel sudah ditransfer
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          <span>Sudah ditransfer (klik untuk batal)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Circle className="h-3.5 w-3.5 text-rose-400" />
          <span>Belum ditransfer (klik untuk tandai)</span>
        </div>
        <span className="italic">Nilai dalam ribuan (Rp) · tidak termasuk tabungan</span>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Matrix table */}
      {matrix && matrix.employees.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-slate-800 text-white dark:bg-slate-900">
                  <th className="sticky left-0 z-10 bg-slate-800 dark:bg-slate-900 px-3 py-2.5 text-left font-semibold min-w-[140px] border-r border-slate-600 w-[140px]">
                    Nama
                  </th>
                  {MONTH_SHORT.map((m, i) => (
                    <th key={i} className="px-2 py-2.5 text-center font-semibold min-w-[68px] border-l border-slate-600 whitespace-nowrap">
                      {m}-{yearStr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.employees.map((emp, idx) => {
                  const rowBg = idx % 2 === 0
                    ? "bg-white dark:bg-slate-950"
                    : "bg-slate-50 dark:bg-slate-900";
                  return (
                    <tr key={emp.userId} className={rowBg}>
                      <td className={cn(
                        "sticky left-0 z-10 px-3 py-1.5 border-r border-slate-200 dark:border-slate-700 w-[140px]",
                        rowBg,
                      )}>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-semibold">{emp.name.toUpperCase()}</span>
                          {emp.isDualRole && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-purple-300 text-purple-600 dark:border-purple-700 dark:text-purple-400">
                              +Ed
                            </Badge>
                          )}
                          {emp.role === "cs" && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
                              CS
                            </Badge>
                          )}
                        </div>
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
                        const cell = emp.months[m];
                        const toggleKey = `${emp.userId}-${m}`;
                        const isToggling = toggling.has(toggleKey);
                        const hasSalary = cell?.salary > 0;
                        const isTransferred = cell?.transferred ?? false;

                        return (
                          <td
                            key={m}
                            title={isTransferred && cell?.transferredAt
                              ? `Ditransfer ${fmtDate(cell.transferredAt)}`
                              : hasSalary ? "Klik untuk tandai transfer" : ""}
                            onClick={() => handleCellClick(emp, m)}
                            className={cn(
                              "px-2 py-1.5 text-center border-l border-slate-100 dark:border-slate-800 transition-colors",
                              hasSalary && "cursor-pointer",
                              hasSalary && isTransferred && "bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-950/60",
                              hasSalary && !isTransferred && "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-950/50",
                              !hasSalary && "text-slate-300 dark:text-slate-700",
                            )}
                          >
                            {isToggling ? (
                              <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                            ) : hasSalary ? (
                              <div className="flex flex-col items-center leading-tight">
                                <span className="font-medium">{fmtRibuan(cell.salary)}</span>
                                {isTransferred && cell.transferredAt && (
                                  <span className="text-[9px] opacity-70 mt-0.5">{fmtDate(cell.transferredAt)}</span>
                                )}
                              </div>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Total row */}
                <tr className="border-t-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 font-bold">
                  <td className="sticky left-0 z-10 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 border-r border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 w-[140px]">
                    Total
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <td key={m} className="px-2 py-2 text-center border-l border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
                      {monthTotals[m] > 0 ? fmtRibuan(monthTotals[m]) : <span className="font-normal text-slate-300 dark:text-slate-600">—</span>}
                    </td>
                  ))}
                </tr>

                {/* Sudah Ditransfer row */}
                <tr className="bg-green-50 dark:bg-green-950/20 font-semibold">
                  <td className="sticky left-0 z-10 bg-green-50 dark:bg-green-950/20 px-3 py-1.5 border-r border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 w-[140px] flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>Sudah Transfer</span>
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <td key={m} className="px-2 py-1.5 text-center border-l border-green-100 dark:border-green-900 text-green-700 dark:text-green-400">
                      {transferredTotals[m] > 0 ? fmtRibuan(transferredTotals[m]) : <span className="font-normal text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                  ))}
                </tr>

                {/* Belum Ditransfer row */}
                <tr className="bg-rose-50 dark:bg-rose-950/20 font-semibold">
                  <td className="sticky left-0 z-10 bg-rose-50 dark:bg-rose-950/20 px-3 py-1.5 border-r border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 w-[140px] flex items-center gap-1">
                    <Circle className="h-3 w-3 shrink-0" />
                    <span>Belum Transfer</span>
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <td key={m} className="px-2 py-1.5 text-center border-l border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400">
                      {notTransferredTotals[m] > 0 ? fmtRibuan(notTransferredTotals[m]) : <span className="font-normal text-slate-300 dark:text-slate-700">—</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {matrix && matrix.employees.length === 0 && (
        <div className="text-center text-muted-foreground py-12">
          Tidak ada data karyawan.
        </div>
      )}

      {!matrix && !loading && !error && (
        <div className="text-center text-muted-foreground py-12">
          Memuat data...
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-3 px-1">
        * Nilai dalam ribuan Rupiah · Gaji = pendapatan artikel + pulsa + bonus · Tabungan tidak termasuk · Hanya job selesai (✓)
      </p>

      {/* Confirmation Dialog */}
      <Dialog open={!!pendingToggle} onOpenChange={open => { if (!open) setPendingToggle(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Konfirmasi Transfer Gaji
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 pt-1">
                {pendingToggle && (
                  <>
                    <p className="text-sm">
                      {pendingToggle.currentlyTransferred
                        ? "Batalkan tanda transfer untuk:"
                        : "Tandai sudah ditransfer untuk:"}
                    </p>
                    <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm space-y-1">
                      <div className="font-semibold text-foreground">{pendingToggle.name}</div>
                      <div className="text-muted-foreground">
                        {MONTH_SHORT[pendingToggle.month - 1]}-{yearStr} · Rp {Math.round(pendingToggle.salary / 1000).toLocaleString("id-ID")}rb
                      </div>
                    </div>
                    {pendingToggle.currentlyTransferred && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Ini akan menghapus tanda transfer yang sudah ada.
                      </p>
                    )}
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingToggle(null)}>
              Batal
            </Button>
            <Button
              variant={pendingToggle?.currentlyTransferred ? "destructive" : "default"}
              className={!pendingToggle?.currentlyTransferred ? "bg-green-600 hover:bg-green-700" : ""}
              onClick={confirmToggle}
            >
              {pendingToggle?.currentlyTransferred ? "Batalkan Transfer" : "Ya, Sudah Ditransfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
