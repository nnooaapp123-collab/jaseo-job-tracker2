import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Trash2, Plus, Loader2, CalendarDays, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Holiday { id: number; date: string; name: string; }

// ─── Data Libur Nasional Indonesia ────────────────────────────────────────────
// Sumber: SKB 3 Menteri (hari libur nasional resmi pemerintah)
// Catatan 2026: Tanggal hari raya Islam bersifat perkiraan (tergantung hasil rukyat hilal)
const LIBUR_NASIONAL: Record<number, Array<{ date: string; name: string; approx?: boolean }>> = {
  2025: [
    { date: "2025-01-01", name: "Tahun Baru Masehi" },
    { date: "2025-01-27", name: "Isra Mikraj Nabi Muhammad SAW" },
    { date: "2025-01-29", name: "Tahun Baru Imlek 2576 Kongzili" },
    { date: "2025-03-29", name: "Hari Suci Nyepi (Tahun Baru Saka 1947)" },
    { date: "2025-03-31", name: "Hari Raya Idul Fitri 1446 H (1 Syawal)" },
    { date: "2025-04-01", name: "Hari Raya Idul Fitri 1446 H (2 Syawal)" },
    { date: "2025-04-18", name: "Wafat Isa Al Masih (Jumat Agung)" },
    { date: "2025-05-01", name: "Hari Buruh Internasional" },
    { date: "2025-05-12", name: "Hari Raya Waisak 2569 BE" },
    { date: "2025-05-29", name: "Kenaikan Isa Al Masih" },
    { date: "2025-06-01", name: "Hari Lahir Pancasila" },
    { date: "2025-06-06", name: "Hari Raya Idul Adha 1446 H" },
    { date: "2025-06-27", name: "Tahun Baru Islam 1447 H" },
    { date: "2025-08-17", name: "Hari Kemerdekaan Republik Indonesia" },
    { date: "2025-09-05", name: "Maulid Nabi Muhammad SAW" },
    { date: "2025-12-25", name: "Hari Raya Natal" },
  ],
  2026: [
    { date: "2026-01-01", name: "Tahun Baru Masehi" },
    { date: "2026-02-16", name: "Isra Mikraj Nabi Muhammad SAW", approx: true },
    { date: "2026-02-17", name: "Tahun Baru Imlek 2577 Kongzili" },
    { date: "2026-03-09", name: "Hari Suci Nyepi (Tahun Baru Saka 1948)" },
    { date: "2026-03-20", name: "Hari Raya Idul Fitri 1447 H (1 Syawal)", approx: true },
    { date: "2026-03-21", name: "Hari Raya Idul Fitri 1447 H (2 Syawal)", approx: true },
    { date: "2026-04-03", name: "Wafat Isa Al Masih (Jumat Agung)" },
    { date: "2026-05-01", name: "Hari Buruh Internasional" },
    { date: "2026-05-14", name: "Kenaikan Isa Al Masih" },
    { date: "2026-05-20", name: "Hari Raya Waisak 2570 BE" },
    { date: "2026-05-27", name: "Hari Raya Idul Adha 1447 H", approx: true },
    { date: "2026-06-01", name: "Hari Lahir Pancasila" },
    { date: "2026-06-17", name: "Tahun Baru Islam 1448 H", approx: true },
    { date: "2026-08-17", name: "Hari Kemerdekaan Republik Indonesia" },
    { date: "2026-09-25", name: "Maulid Nabi Muhammad SAW", approx: true },
    { date: "2026-12-25", name: "Hari Raya Natal" },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HARI_PENDEK = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_PANJANG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function HariLiburPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const isAdminOrCS = currentUser?.role === "admin" || currentUser?.role === "cs";

  // ── Navigation bulan ──────────────────────────────────────────────────────
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  };
  const goToday = () => { setViewYear(now.getFullYear()); setViewMonth(now.getMonth() + 1); };

  // ── Holidays query ────────────────────────────────────────────────────────
  const HOLIDAY_KEY = ["holidays"];
  const { data: allHolidays = [], isLoading } = useQuery<Holiday[]>({
    queryKey: HOLIDAY_KEY,
    queryFn: async () => {
      const res = await fetch(`${base}/api/holidays`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 30_000,
  });

  // holidays for current view month
  const monthHolidays = useMemo(() => {
    const prefix = `${viewYear}-${String(viewMonth).padStart(2, "0")}`;
    return allHolidays.filter(h => h.date.startsWith(prefix));
  }, [allHolidays, viewYear, viewMonth]);

  const holidayMap = useMemo(() => {
    const m = new Map<string, Holiday>();
    allHolidays.forEach(h => m.set(h.date, h));
    return m;
  }, [allHolidays]);

  // ── Calendar grid ─────────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    // prefix empty cells + all days
    const cells: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: toDateStr(viewYear, viewMonth, d), day: d });
    }
    return cells;
  }, [viewYear, viewMonth]);

  // ── Seed Libur Nasional ───────────────────────────────────────────────────
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedYear, setSeedYear] = useState(now.getFullYear());
  const [seedChecked, setSeedChecked] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);

  const seedCandidates = useMemo(() => {
    const list = LIBUR_NASIONAL[seedYear] ?? [];
    return list.filter(h => !holidayMap.has(h.date));
  }, [seedYear, holidayMap]);

  const openSeedDialog = () => {
    const y = viewYear in LIBUR_NASIONAL ? viewYear : Math.max(...Object.keys(LIBUR_NASIONAL).map(Number));
    setSeedYear(y);
    const list = (LIBUR_NASIONAL[y] ?? []).filter(h => !holidayMap.has(h.date));
    setSeedChecked(new Set(list.map(h => h.date)));
    setSeedOpen(true);
  };

  // Recalculate checked when year changes inside dialog
  const onSeedYearChange = (y: number) => {
    setSeedYear(y);
    const list = (LIBUR_NASIONAL[y] ?? []).filter(h => !holidayMap.has(h.date));
    setSeedChecked(new Set(list.map(h => h.date)));
  };

  const handleSeed = async () => {
    const list = (LIBUR_NASIONAL[seedYear] ?? []).filter(h => seedChecked.has(h.date));
    if (list.length === 0) return;
    setSeeding(true);
    try {
      const res = await fetch(`${base}/api/holidays/batch`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(list),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: HOLIDAY_KEY });
      toast({ title: `${data.inserted} hari libur nasional berhasil ditambahkan${data.skipped ? `, ${data.skipped} dilewati (sudah ada)` : ""}` });
      setSeedOpen(false);
    } catch {
      toast({ title: "Gagal memuat libur nasional", variant: "destructive" });
    } finally { setSeeding(false); }
  };

  // ── Add holiday dialog ────────────────────────────────────────────────────
  const [addDialog, setAddDialog] = useState<{ date: string; dayLabel: string } | null>(null);
  const [holidayName, setHolidayName] = useState("");
  const [saving, setSaving] = useState(false);

  const openAddDialog = (date: string) => {
    const [y, m, d] = date.split("-").map(Number);
    const dayLabel = HARI_PANJANG[new Date(y, m - 1, d).getDay()];
    setHolidayName("");
    setAddDialog({ date, dayLabel });
  };

  const handleSave = async () => {
    if (!addDialog || !holidayName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/api/holidays`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: addDialog.date, name: holidayName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error ?? "Gagal menambahkan hari libur", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: HOLIDAY_KEY });
      toast({ title: `Hari libur "${holidayName.trim()}" ditambahkan` });
      setAddDialog(null);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number, name: string) => {
    await fetch(`${base}/api/holidays/${id}`, { method: "DELETE", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: HOLIDAY_KEY });
    toast({ title: `Hari libur "${name}" dihapus` });
  };

  const today = todayStr();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Hari Libur
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdminOrCS
              ? "Kelola hari libur. Hari Minggu dan hari libur yang terdaftar tidak akan masuk ke jadwal otomatis."
              : "Daftar hari libur. Hari Minggu dan hari libur di bawah tidak masuk ke jadwal kerja."}
          </p>
        </div>
        {isAdminOrCS && (
          <Button variant="outline" size="sm" className="shrink-0 mt-0.5" onClick={openSeedDialog}>
            <Download className="mr-2 h-4 w-4" />
            Muat Libur Nasional
          </Button>
        )}
      </div>

      {/* ── Kalender ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {/* Navigasi bulan */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {BULAN[viewMonth - 1]} {viewYear}
            </span>
            {(viewYear !== now.getFullYear() || viewMonth !== now.getMonth() + 1) && (
              <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={goToday}>
                Hari ini
              </Button>
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Grid kalender */}
        <div className="p-3">
          {/* Header hari */}
          <div className="grid grid-cols-7 mb-1">
            {HARI_PENDEK.map((h, i) => (
              <div
                key={h}
                className={cn(
                  "text-center text-xs font-medium py-1",
                  i === 0 ? "text-red-500" : "text-muted-foreground"
                )}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Sel tanggal */}
          <div className="grid grid-cols-7 gap-0.5">
            {calendarDays.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} />;

              const [cy, cm, cd] = cell.date.split("-").map(Number);
              const dow = new Date(cy, cm - 1, cd).getDay();
              const isSunday = dow === 0;
              const holiday = holidayMap.get(cell.date);
              const isToday = cell.date === today;

              let cellClass = "relative flex flex-col items-center justify-center rounded-lg h-10 text-sm transition-colors ";

              if (isSunday) {
                cellClass += "text-red-400 bg-red-50 dark:bg-red-950/20 cursor-default";
              } else if (holiday) {
                cellClass += "text-white bg-orange-500 dark:bg-orange-600 font-semibold ";
                if (isAdminOrCS) cellClass += "cursor-pointer hover:bg-orange-600";
                else cellClass += "cursor-default";
              } else {
                cellClass += "text-foreground hover:bg-muted ";
                if (isAdminOrCS) cellClass += "cursor-pointer";
                else cellClass += "cursor-default";
              }

              return (
                <div
                  key={cell.date}
                  className={cellClass}
                  onClick={() => {
                    if (!isAdminOrCS) return;
                    if (isSunday) return;
                    if (holiday) {
                      handleDelete(holiday.id, holiday.name);
                    } else {
                      openAddDialog(cell.date);
                    }
                  }}
                  title={
                    isSunday ? "Hari Minggu (libur otomatis)"
                    : holiday ? `${holiday.name} — klik untuk hapus`
                    : isAdminOrCS ? "Klik untuk jadikan hari libur"
                    : undefined
                  }
                >
                  {/* Today ring */}
                  {isToday && (
                    <span className={cn(
                      "absolute inset-0.5 rounded-md ring-2",
                      holiday ? "ring-white/60" : "ring-primary"
                    )} />
                  )}
                  <span className="relative z-10 leading-none">{cell.day}</span>
                  {/* Dot indicator for holiday */}
                  {holiday && (
                    <span className="relative z-10 text-[9px] leading-none text-white/80 truncate max-w-[3rem] px-0.5 mt-0.5">
                      {holiday.name}
                    </span>
                  )}
                  {isSunday && (
                    <span className="relative z-10 text-[9px] leading-none text-red-300 mt-0.5">Libur</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" />
              Minggu
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500" />
              Hari Libur
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded border-2 border-primary" />
              Hari ini
            </span>
            {isAdminOrCS && (
              <span className="ml-auto italic">Klik tanggal untuk tambah/hapus libur</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Daftar Hari Libur Bulan Ini ───────────────────────────────── */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h3 className="font-semibold text-sm">
            Hari Libur — {BULAN[viewMonth - 1]} {viewYear}
          </h3>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : monthHolidays.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground italic">
            Tidak ada hari libur pada bulan ini.
          </div>
        ) : (
          <ul className="divide-y">
            {monthHolidays
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(h => {
                const [y, m, d] = h.date.split("-").map(Number);
                const dayName = HARI_PANJANG[new Date(y, m - 1, d).getDay()];
                return (
                  <li key={h.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center shrink-0">
                      <span className="text-orange-600 font-bold text-sm">{d}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{h.name}</p>
                      <p className="text-xs text-muted-foreground">{dayName}, {d} {BULAN[m - 1]} {y}</p>
                    </div>
                    {isAdminOrCS && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleDelete(h.id, h.name)}
                        title="Hapus hari libur"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {/* ── Semua Hari Libur (ringkasan) ─────────────────────────────── */}
      {allHolidays.length > 0 && (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="font-semibold text-sm">Semua Hari Libur Terdaftar</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{allHolidays.length} hari libur total</p>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y">
            {allHolidays
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(h => {
                const [y, m, d] = h.date.split("-").map(Number);
                const dayName = HARI_PANJANG[new Date(y, m - 1, d).getDay()];
                return (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-xs text-muted-foreground w-[88px] shrink-0">{h.date}</span>
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{dayName}</span>
                    <span className="text-sm flex-1 truncate">{h.name}</span>
                    {isAdminOrCS && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => handleDelete(h.id, h.name)}
                        title="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ── Dialog Muat Libur Nasional ───────────────────────────────── */}
      <Dialog open={seedOpen} onOpenChange={o => { if (!o) setSeedOpen(false); }}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Muat Libur Nasional Indonesia
            </DialogTitle>
            <DialogDescription>
              Pilih tahun, lalu centang hari libur yang ingin ditambahkan. Hari yang sudah ada di daftar otomatis dilewati.
            </DialogDescription>
          </DialogHeader>

          {/* Pilih tahun */}
          <div className="flex gap-2 pt-1 pb-2 border-b shrink-0">
            {Object.keys(LIBUR_NASIONAL).map(y => (
              <Button
                key={y}
                variant={seedYear === Number(y) ? "default" : "outline"}
                size="sm"
                onClick={() => onSeedYearChange(Number(y))}
              >
                {y}
              </Button>
            ))}
          </div>

          {/* Daftar libur */}
          <div className="flex-1 overflow-y-auto space-y-1 py-1">
            {(() => {
              const allForYear = LIBUR_NASIONAL[seedYear] ?? [];
              const newOnes = allForYear.filter(h => !holidayMap.has(h.date));
              const alreadyIn = allForYear.filter(h => holidayMap.has(h.date));

              return (
                <>
                  {newOnes.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4 italic">
                      Semua hari libur nasional {seedYear} sudah terdaftar.
                    </p>
                  )}
                  {newOnes.map(h => {
                    const [y, m, d] = h.date.split("-").map(Number);
                    const dayName = HARI_PANJANG[new Date(y, m - 1, d).getDay()];
                    const checked = seedChecked.has(h.date);
                    return (
                      <label
                        key={h.date}
                        className={cn(
                          "flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                          checked ? "bg-primary/5" : "hover:bg-muted/60"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={v => {
                            setSeedChecked(prev => {
                              const next = new Set(prev);
                              v ? next.add(h.date) : next.delete(h.date);
                              return next;
                            });
                          }}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{h.name}</span>
                            {h.approx && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                ~perkiraan
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {dayName}, {d} {BULAN[m - 1]} {y}
                          </p>
                        </div>
                      </label>
                    );
                  })}

                  {alreadyIn.length > 0 && (
                    <div className="pt-2 mt-2 border-t">
                      <p className="text-xs text-muted-foreground px-3 pb-1 font-medium">Sudah terdaftar:</p>
                      {alreadyIn.map(h => {
                        const [y, m, d] = h.date.split("-").map(Number);
                        const dayName = HARI_PANJANG[new Date(y, m - 1, d).getDay()];
                        return (
                          <div key={h.date} className="flex items-center gap-3 px-3 py-2 opacity-50">
                            <Checkbox checked disabled className="shrink-0" />
                            <div>
                              <p className="text-sm line-through">{h.name}</p>
                              <p className="text-xs text-muted-foreground">{dayName}, {d} {BULAN[m - 1]} {y}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Note perkiraan */}
          {(LIBUR_NASIONAL[seedYear] ?? []).some(h => h.approx) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 shrink-0">
              Tanggal bertanda <strong>~perkiraan</strong> adalah hari raya Islam — tanggal pastinya tergantung hasil rukyat hilal dan dapat berbeda 1–2 hari. Silakan sesuaikan jika pengumuman resmi sudah keluar.
            </p>
          )}

          <DialogFooter className="shrink-0">
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs text-muted-foreground flex-1">
                {seedChecked.size} dipilih dari {(LIBUR_NASIONAL[seedYear] ?? []).filter(h => !holidayMap.has(h.date)).length} tersedia
              </span>
              <Button variant="outline" onClick={() => setSeedOpen(false)}>Batal</Button>
              <Button disabled={seedChecked.size === 0 || seeding} onClick={handleSeed}>
                {seeding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Tambahkan {seedChecked.size > 0 ? `${seedChecked.size} Libur` : ""}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Tambah Hari Libur ──────────────────────────────────── */}
      <Dialog open={addDialog !== null} onOpenChange={o => { if (!o) setAddDialog(null); }}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Tambah Hari Libur
            </DialogTitle>
            <DialogDescription>
              {addDialog && (
                <>
                  <span className="font-semibold text-foreground">{addDialog.dayLabel}</span>,{" "}
                  {addDialog.date.split("-").reverse().join(" / ")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nama Hari Libur</Label>
              <Input
                placeholder="Contoh: Lebaran, Natal, Tahun Baru..."
                value={holidayName}
                onChange={e => setHolidayName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(null)}>Batal</Button>
            <Button disabled={!holidayName.trim() || saving} onClick={handleSave}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
