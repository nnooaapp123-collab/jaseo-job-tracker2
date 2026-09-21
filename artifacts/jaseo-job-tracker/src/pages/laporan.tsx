import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Loader2, TrendingUp, Users, Pen, Download, Wallet, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface WriterReport {
  writerId: number;
  writerName: string;
  allJobs: number;
  doneJobs: number;
  allWords: number;
  doneWords: number;
  income: number;
  editorIncome: number;
  combinedIncome: number;
  linkedEditorId: number | null;
}

interface EditorReport {
  editorId: number;
  editorName: string;
  allJobs: number;
  doneJobs: number;
  allWords: number;
  doneWords: number;
  income: number;
  isDualRole: boolean;
}

interface CsReport {
  topAchievement: number;
  bonus: number;
  pendapatanArtikel: number;
}

interface MonthlyReport {
  year: number;
  month: number;
  writers: WriterReport[];
  editors: EditorReport[];
  cs: CsReport;
}

interface HistoryMonth {
  year: number;
  month: number;
  doneJobs: number;
  doneWords: number;
  writerIncome: number;
  editorIncome: number;
  csIncome: number;
  additionalIncome: number;
  income: number;
  cumulative: number;
}

interface SalaryHistory {
  role: string;
  joinDate: string | null;
  totalIncome: number;
  months: HistoryMonth[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const fmtNum = (n: number) => n.toLocaleString("id-ID");

const MONTHS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function pct(done: number, all: number) {
  if (all === 0) return 0;
  return Math.round((done / all) * 100);
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{value}%</span>
    </div>
  );
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Personal Report View ────────────────────────────────────────────────────
function PersonalLaporanView() {
  const { currentUser } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<SalaryHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const role = currentUser?.role ?? "";

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${base}/api/salary/history`, { credentials: "include" })
      .then(r => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then(setData)
      .catch((e: unknown) => setError(typeof e === "string" ? e : "Gagal memuat laporan"))
      .finally(() => setLoading(false));
  }, [base]);


  const allYears = [...new Set((data?.months ?? []).map(m => m.year))].sort((a, b) => b - a);
  const yearOptions = allYears.length > 0 ? allYears : [now.getFullYear()];

  const filteredMonths = (data?.months ?? []).filter(m => m.year === year);

  const maxIncome = Math.max(...filteredMonths.map(m => m.income), 1);
  const maxWords = Math.max(...filteredMonths.map(m => m.doneWords), 1);

  const totalIncome = filteredMonths.reduce((s, m) => s + m.income, 0);
  const totalJobs = filteredMonths.reduce((s, m) => s + m.doneJobs, 0);
  const totalWords = filteredMonths.reduce((s, m) => s + m.doneWords, 0);
  const activeMonths = filteredMonths.filter(m => m.doneJobs > 0).length;

  const roleLabel = role === "penulis" ? "Penulis" : role === "editor" ? "Editor" : "Customer Service";

  const handleExport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const rows = [
      ["Tanggal", "Bulan", "Job Selesai", "Kata Selesai", "Pendapatan", "Pendapatan Tambahan", "Pendapatan Total"],
      ...filteredMonths.map(m => [
        `${m.year}-${String(m.month).padStart(2, "0")}-01`,
        `${MONTHS[m.month - 1]} ${m.year}`,
        m.doneJobs,
        m.doneWords,
        role === "editor" ? m.editorIncome : role === "cs" ? m.csIncome : m.writerIncome + m.editorIncome,
        m.additionalIncome,
        m.income,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, `Kinerja ${year}`);
    XLSX.writeFile(wb, `Laporan_Pribadi_${roleLabel}_${year}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Laporan Kinerja
          </h2>
          <p className="text-muted-foreground text-sm">
            Progres kinerja Anda sepanjang tahun — {roleLabel}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[110px] h-9 bg-background shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || filteredMonths.length === 0} className="h-9 shadow-sm">
            <Download className="mr-2 h-4 w-4" />
            Ekspor Excel
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Pendapatan</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono leading-tight">{fmt(totalIncome)}</p>
                <p className="text-xs text-muted-foreground">tahun {year}</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Job Selesai</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-xl font-bold text-primary font-mono leading-tight">{fmtNum(totalJobs)}</p>
                <p className="text-xs text-muted-foreground">artikel</p>
              </CardContent>
            </Card>
            {role !== "cs" && (
              <Card className="shadow-sm">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                    {role === "editor" ? "Kata Diedit" : "Kata Ditulis"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <p className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono leading-tight">{fmtNum(totalWords)}</p>
                  <p className="text-xs text-muted-foreground">kata selesai</p>
                </CardContent>
              </Card>
            )}
            <Card className="shadow-sm">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Bulan Aktif</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-xl font-bold font-mono leading-tight">{activeMonths}</p>
                <p className="text-xs text-muted-foreground">dari 12 bulan</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabel Per Bulan */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Progres Per Bulan — {year}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {filteredMonths.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Belum ada data untuk tahun {year}.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4 font-bold text-foreground">Bulan</TableHead>
                      <TableHead className="text-right font-bold text-foreground">
                        {role === "cs" ? "Job Tim" : "Job Selesai"}
                      </TableHead>
                      {role !== "cs" && (
                        <TableHead className="text-right font-bold text-foreground">
                          {role === "editor" ? "Kata Diedit" : "Kata Ditulis"}
                        </TableHead>
                      )}
                      {role !== "cs" && (
                        <TableHead className="min-w-[100px] font-bold text-foreground hidden sm:table-cell">
                          {role === "editor" ? "Progres Edit" : "Progres Kata"}
                        </TableHead>
                      )}
                      <TableHead className="text-right font-bold text-foreground">Pendapatan</TableHead>
                      <TableHead className="min-w-[80px] font-bold text-foreground hidden sm:table-cell"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMonths.map(m => {
                      const isCurrentMonth = m.year === now.getFullYear() && m.month === now.getMonth() + 1;
                      const displayIncome = m.income;
                      const displayWords = m.doneWords;
                      return (
                        <TableRow key={`${m.year}-${m.month}`} className={isCurrentMonth ? "bg-primary/5" : ""}>
                          <TableCell className="pl-4">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{MONTHS[m.month - 1]}</span>
                              {isCurrentMonth && <Badge variant="secondary" className="text-xs py-0">Sekarang</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {m.doneJobs > 0 ? fmtNum(m.doneJobs) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          {role !== "cs" && (
                            <TableCell className="text-right font-mono text-sm">
                              {displayWords > 0 ? fmtNum(displayWords) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          )}
                          {role !== "cs" && (
                            <TableCell className="hidden sm:table-cell">
                              <MiniBar value={displayWords} max={maxWords} />
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <span className={displayIncome > 0 ? "font-bold text-sm font-mono text-emerald-700 dark:text-emerald-400" : "text-sm text-muted-foreground"}>
                              {displayIncome > 0 ? fmt(displayIncome) : "—"}
                            </span>
                            {m.additionalIncome > 0 && (
                              <p className="text-xs text-muted-foreground">+ {fmt(m.additionalIncome)} tambahan</p>
                            )}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <MiniBar value={displayIncome} max={maxIncome} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Totals row */}
                    <TableRow className="bg-muted/60 font-bold border-t-2">
                      <TableCell className="pl-4 text-sm">Total {year}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtNum(totalJobs)}</TableCell>
                      {role !== "cs" && <TableCell className="text-right font-mono text-sm">{fmtNum(totalWords)}</TableCell>}
                      {role !== "cs" && <TableCell className="hidden sm:table-cell" />}
                      <TableCell className="text-right font-bold text-sm font-mono text-emerald-700 dark:text-emerald-400">{fmt(totalIncome)}</TableCell>
                      <TableCell className="hidden sm:table-cell" />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

    </div>
  );
}

// ─── Admin Report View ───────────────────────────────────────────────────────
function AdminLaporanView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${base}/api/reports/monthly-all?year=${year}&month=${month}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then(setData)
      .catch((e: unknown) => setError(typeof e === "string" ? e : "Gagal memuat laporan"))
      .finally(() => setLoading(false));
  }, [year, month, base]);

  const yearOptions = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  const handleExport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const label = `${MONTHS[month - 1]} ${year}`;

    const writerSheet = XLSX.utils.aoa_to_sheet([
      [`Rekap Kinerja Penulis — ${label}`],
      [],
      ["Tanggal", "Nama Penulis", "Total Job", "Job Selesai", "Penyelesaian", "Total Kata", "Kata Selesai", "Pendapatan Penulis", "Pendapatan Editor", "Total Pendapatan"],
      ...data.writers.map(w => [
        `${year}-${String(month).padStart(2, "0")}-01`,
        w.writerName,
        w.allJobs, w.doneJobs,
        `${pct(w.doneJobs, w.allJobs)}%`,
        w.allWords, w.doneWords,
        w.income, w.editorIncome, w.combinedIncome,
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, writerSheet, "Kinerja Penulis");

    const editorSheet = XLSX.utils.aoa_to_sheet([
      [`Rekap Kinerja Editor — ${label}`],
      [],
      ["Tanggal", "Nama Editor", "Total Job Diedit", "Job Selesai", "Penyelesaian", "Kata Selesai Diedit", "Pendapatan", "Keterangan"],
      ...data.editors.map(e => [
        `${year}-${String(month).padStart(2, "0")}-01`,
        e.editorName,
        e.allJobs, e.doneJobs,
        `${pct(e.doneJobs, e.allJobs)}%`,
        e.doneWords, e.income,
        e.isDualRole ? "Dual Role (penulis juga)" : "Editor",
      ]),
    ]);
    XLSX.utils.book_append_sheet(wb, editorSheet, "Kinerja Editor");

    const gajiSheet = XLSX.utils.aoa_to_sheet([
      [`Rekap Gaji — ${label}`],
      [],
      ["Peran", "Nama", "Pendapatan"],
      ["CS", "Customer Service", data.cs.pendapatanArtikel],
      [],
      ["Penulis (urut pendapatan)", "", ""],
      ...data.writers.map(w => ["Penulis", w.writerName, w.income]),
      [],
      ["Editor", "", ""],
      ...data.editors.filter(e => !e.isDualRole).map(e => ["Editor", e.editorName, e.income]),
    ]);
    XLSX.utils.book_append_sheet(wb, gajiSheet, "Rekap Gaji");

    XLSX.writeFile(wb, `Laporan_Jaseo_${MONTHS[month - 1]}_${year}.xlsx`);
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight">Laporan Bulanan Tim</h2>
          <p className="text-muted-foreground text-sm">Rekap kinerja dan gaji seluruh tim Jaseo Konten Media.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-[140px] h-9 bg-background shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px] h-9 bg-background shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data} className="h-9 shadow-sm">
            <Download className="mr-2 h-4 w-4" />
            Ekspor Excel
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && !loading && (
        <>

          {/* ── Rekap Kinerja Penulis ──────────────────────────────────────────── */}
          <section>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Pen className="h-4 w-4 text-emerald-600" />
              Rekap Kinerja Penulis
            </h3>
            <Card className="shadow-sm">
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4 font-bold text-foreground">Nama Penulis</TableHead>
                      <TableHead className="text-center font-bold text-foreground">Total Job</TableHead>
                      <TableHead className="text-center font-bold text-foreground">Selesai</TableHead>
                      <TableHead className="min-w-[120px] font-bold text-foreground">Penyelesaian</TableHead>
                      <TableHead className="text-right font-bold text-foreground">Total Kata</TableHead>
                      <TableHead className="text-right pr-4 font-bold text-foreground">Kata Selesai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.writers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data penulis bulan ini.</TableCell>
                      </TableRow>
                    ) : data.writers.map(w => (
                      <TableRow key={w.writerId}>
                        <TableCell className="pl-4 font-medium">{w.writerName}</TableCell>
                        <TableCell className="text-center font-mono text-sm">{w.allJobs}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={w.doneJobs === w.allJobs && w.allJobs > 0 ? "default" : "secondary"} className="font-mono text-xs">{w.doneJobs}</Badge>
                        </TableCell>
                        <TableCell><ProgressBar value={pct(w.doneJobs, w.allJobs)} /></TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtNum(w.allWords)}</TableCell>
                        <TableCell className="text-right pr-4 font-mono text-sm font-semibold">{fmtNum(w.doneWords)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>

          {/* ── Rekap Kinerja Editor ───────────────────────────────────────────── */}
          <section>
            <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              Rekap Kinerja Editor
            </h3>
            <Card className="shadow-sm">
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="pl-4 font-bold text-foreground">Nama Editor</TableHead>
                      <TableHead className="text-center font-bold text-foreground">Total Diedit</TableHead>
                      <TableHead className="text-center font-bold text-foreground">Selesai</TableHead>
                      <TableHead className="min-w-[120px] font-bold text-foreground">Penyelesaian</TableHead>
                      <TableHead className="text-right pr-4 font-bold text-foreground">Kata Selesai Diedit</TableHead>
                      <TableHead className="font-bold text-foreground">Peran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.editors.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Tidak ada data editor bulan ini.</TableCell>
                      </TableRow>
                    ) : data.editors.map(e => (
                      <TableRow key={e.editorId}>
                        <TableCell className="pl-4 font-medium">{e.editorName}</TableCell>
                        <TableCell className="text-center font-mono text-sm">{e.allJobs}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={e.doneJobs === e.allJobs && e.allJobs > 0 ? "default" : "secondary"} className="font-mono text-xs">{e.doneJobs}</Badge>
                        </TableCell>
                        <TableCell><ProgressBar value={pct(e.doneJobs, e.allJobs)} /></TableCell>
                        <TableCell className="text-right pr-4 font-mono text-sm font-semibold">{fmtNum(e.doneWords)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{e.isDualRole ? "Dual Role" : "Editor"}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </section>


          {/* ── Biaya Operasional ──────────────────────────────────────────────── */}
          {(() => {
            type BiayaRow = {
              nama: string; peran: string;
              pendapatanPenulis: number; pendapatanEditor: number;
              pendapatanCs: number; bonus: number; lainnya: number; pulsa: number; tabungan: number;
            };
            const rows: BiayaRow[] = [];

            for (const w of data.writers) {
              const isDual   = w.linkedEditorId !== null;
              const pulsa    = isDual ? 70000 : (w.doneWords >= 48100 ? 70000 : 0);
              const tabungan = isDual ? 100000 : (w.doneWords >= 70000 ? 100000 : 0);
              rows.push({
                nama: w.writerName,
                peran: isDual ? "Penulis + Editor" : "Penulis",
                pendapatanPenulis: w.income ?? 0,
                pendapatanEditor: isDual ? (w.editorIncome ?? 0) : 0,
                pendapatanCs: 0,
                bonus: (w as any).bonus ?? 0,
                lainnya: (w as any).additionalIncome ?? 0,
                pulsa, tabungan,
              });
            }
            for (const e of data.editors.filter(e => !e.isDualRole)) {
              rows.push({
                nama: e.editorName,
                peran: "Editor",
                pendapatanPenulis: 0,
                pendapatanEditor: e.income ?? 0,
                pendapatanCs: 0,
                bonus: (e as any).bonus ?? 0,
                lainnya: (e as any).additionalIncome ?? 0,
                pulsa: 70000,
                tabungan: 100000,
              });
            }
            if (data.cs?.pendapatanArtikel) {
              rows.push({
                nama: "CS",
                peran: "Customer Service",
                pendapatanPenulis: 0,
                pendapatanEditor: 0,
                pendapatanCs: data.cs.pendapatanArtikel ?? 0,
                bonus: 0,
                lainnya: (data.cs as any).additionalIncome ?? 0,
                pulsa: 70000,
                tabungan: 100000,
              });
            }

            rows.sort((a, b) => {
              const sumA = a.pendapatanPenulis + a.pendapatanEditor + a.pendapatanCs + a.bonus + a.lainnya + a.pulsa + a.tabungan;
              const sumB = b.pendapatanPenulis + b.pendapatanEditor + b.pendapatanCs + b.bonus + b.lainnya + b.pulsa + b.tabungan;
              return sumB - sumA;
            });

            const totals = rows.reduce(
              (acc, r) => ({
                pendapatanPenulis: acc.pendapatanPenulis + r.pendapatanPenulis,
                pendapatanEditor:  acc.pendapatanEditor  + r.pendapatanEditor,
                pendapatanCs:      acc.pendapatanCs      + r.pendapatanCs,
                bonus:             acc.bonus             + r.bonus,
                lainnya:           acc.lainnya           + r.lainnya,
                pulsa:             acc.pulsa             + r.pulsa,
                tabungan:          acc.tabungan          + r.tabungan,
              }),
              { pendapatanPenulis: 0, pendapatanEditor: 0, pendapatanCs: 0, bonus: 0, lainnya: 0, pulsa: 0, tabungan: 0 }
            );
            const totalJumlah = (r: typeof totals) =>
              r.pendapatanPenulis + r.pendapatanEditor + r.pendapatanCs + r.bonus + r.lainnya + r.pulsa + r.tabungan;

            return (
              <section>
                <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-orange-500" />
                  Biaya Operasional
                </h3>
                <Card className="shadow-sm">
                  <CardContent className="px-0 pb-0 overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow>
                          <TableHead className="pl-4 font-bold text-foreground">Nama</TableHead>
                          <TableHead className="font-bold text-foreground text-xs">Peran</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Pend. Penulis</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Pend. Editor</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Pend. CS</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Bonus</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Pend. Lainnya</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Pulsa</TableHead>
                          <TableHead className="text-right font-bold text-foreground text-xs">Tabungan</TableHead>
                          <TableHead className="text-right pr-4 font-bold text-foreground text-xs">Jumlah</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => {
                          const jumlah = r.pendapatanPenulis + r.pendapatanEditor + r.pendapatanCs + r.bonus + r.lainnya + r.pulsa + r.tabungan;
                          return (
                            <TableRow key={i}>
                              <TableCell className="pl-4 font-medium text-sm">{r.nama}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.peran}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.pendapatanPenulis > 0 ? fmt(r.pendapatanPenulis) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.pendapatanEditor > 0 ? fmt(r.pendapatanEditor) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.pendapatanCs > 0 ? fmt(r.pendapatanCs) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.bonus > 0 ? fmt(r.bonus) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.lainnya > 0 ? fmt(r.lainnya) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.pulsa > 0 ? fmt(r.pulsa) : "—"}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{r.tabungan > 0 ? fmt(r.tabungan) : "—"}</TableCell>
                              <TableCell className="text-right pr-4 font-bold text-sm text-orange-700 dark:text-orange-400">{fmt(jumlah)}</TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/60 font-bold border-t-2">
                          <TableCell className="pl-4 text-sm" colSpan={2}>Total</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.pendapatanPenulis)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.pendapatanEditor)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.pendapatanCs)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.bonus)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.lainnya)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.pulsa)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmt(totals.tabungan)}</TableCell>
                          <TableCell className="text-right pr-4 font-bold text-sm text-orange-700 dark:text-orange-400">{fmt(totalJumlah(totals))}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </section>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function LaporanPage() {
  const { currentUser } = useAuth();
  const [adminViewMode, setAdminViewMode] = useState<"team" | "personal">("team");

  const role = currentUser?.role ?? "";

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role === "admin") {
    return (
      <>
        <div className="max-w-[1400px] mx-auto mb-4 flex items-center gap-2">
          <Button
            variant={adminViewMode === "team" ? "default" : "outline"}
            size="sm"
            onClick={() => setAdminViewMode("team")}
            className="h-8 text-xs"
          >
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Laporan Tim
          </Button>
          <Button
            variant={adminViewMode === "personal" ? "default" : "outline"}
            size="sm"
            onClick={() => setAdminViewMode("personal")}
            className="h-8 text-xs"
          >
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Kinerja Pribadi
          </Button>
        </div>
        {adminViewMode === "team" ? <AdminLaporanView /> : <PersonalLaporanView />}
      </>
    );
  }

  return <PersonalLaporanView />;
}
