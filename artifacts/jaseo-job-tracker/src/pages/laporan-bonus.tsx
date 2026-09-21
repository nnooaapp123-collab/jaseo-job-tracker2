import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, Loader2, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const currentYear = new Date().getFullYear();

interface BonusRow {
  orderId: number;
  orderDate: string;
  month: number;
  year: number;
  customerId: number | null;
  customerName: string;
  jobCode: string;
  website: string | null;
  bonusArticles: number;
  bonusValue: number;
}

interface BonusReport {
  year: number;
  summary: { totalBonus: number; totalBonusArticles: number; totalCustomers: number };
  rows: BonusRow[];
}

interface CustomerGroup {
  customerId: number | null;
  customerName: string;
  totalBonus: number;
  totalArticles: number;
  months: MonthGroup[];
}

interface MonthGroup {
  month: number;
  year: number;
  label: string;
  totalBonus: number;
  totalArticles: number;
  orders: BonusRow[];
}

export default function LaporanBonusPage() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin";

  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterCustomerId, setFilterCustomerId] = useState<string>("all");
  const [view, setView] = useState<"customer" | "month">("customer");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const { data, isLoading, error } = useQuery<BonusReport>({
    queryKey: ["bonus-report", filterYear],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/reports/bonus?year=${filterYear}`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat laporan bonus");
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const allCustomers = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const r of data.rows) {
      const key = String(r.customerId ?? "none");
      if (!seen.has(key)) seen.set(key, r.customerName);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (filterCustomerId === "all") return data.rows;
    return data.rows.filter(r => String(r.customerId ?? "none") === filterCustomerId);
  }, [data, filterCustomerId]);

  const customerGroups = useMemo((): CustomerGroup[] => {
    const map = new Map<string, CustomerGroup>();
    for (const r of filteredRows) {
      const key = String(r.customerId ?? "none");
      if (!map.has(key)) {
        map.set(key, { customerId: r.customerId, customerName: r.customerName, totalBonus: 0, totalArticles: 0, months: [] });
      }
      const cg = map.get(key)!;
      cg.totalBonus += r.bonusValue;
      cg.totalArticles += r.bonusArticles;
      const mKey = `${r.year}-${r.month}`;
      let mg = cg.months.find(m => `${m.year}-${m.month}` === mKey);
      if (!mg) {
        mg = { month: r.month, year: r.year, label: `${MONTHS[r.month - 1]} ${r.year}`, totalBonus: 0, totalArticles: 0, orders: [] };
        cg.months.push(mg);
      }
      mg.totalBonus += r.bonusValue;
      mg.totalArticles += r.bonusArticles;
      mg.orders.push(r);
    }
    return [...map.values()]
      .sort((a, b) => b.totalBonus - a.totalBonus)
      .map(cg => ({ ...cg, months: cg.months.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month) }));
  }, [filteredRows]);

  const monthGroups = useMemo((): MonthGroup[] => {
    const map = new Map<string, MonthGroup>();
    for (const r of filteredRows) {
      const key = `${r.year}-${r.month}`;
      if (!map.has(key)) {
        map.set(key, { month: r.month, year: r.year, label: `${MONTHS[r.month - 1]} ${r.year}`, totalBonus: 0, totalArticles: 0, orders: [] });
      }
      const mg = map.get(key)!;
      mg.totalBonus += r.bonusValue;
      mg.totalArticles += r.bonusArticles;
      mg.orders.push(r);
    }
    return [...map.values()].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  }, [filteredRows]);

  const filteredSummary = useMemo(() => {
    const totalBonus = filteredRows.reduce((s, r) => s + r.bonusValue, 0);
    const totalArticles = filteredRows.reduce((s, r) => s + r.bonusArticles, 0);
    const uniqueCustomers = new Set(filteredRows.map(r => String(r.customerId ?? "none"))).size;
    return { totalBonus, totalArticles, totalCustomers: uniqueCustomers };
  }, [filteredRows]);

  const toggleCustomer = (key: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
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
      <div>
        <h2 className="text-2xl font-serif font-bold tracking-tight flex items-center gap-2">
          <Star className="h-6 w-6 text-amber-500" />
          Laporan Bonus Artikel
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Rincian bonus artikel per pelanggan dan bulan — tidak dihitung sebagai pengeluaran keuangan.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterYear} onValueChange={v => { setFilterYear(v); setFilterCustomerId("all"); }}>
          <SelectTrigger className="w-28 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: currentYear - 2022 + 1 }, (_, i) => currentYear - i).map(y => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCustomerId} onValueChange={setFilterCustomerId}>
          <SelectTrigger className="w-52 h-9">
            <SelectValue placeholder="Semua Pelanggan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Pelanggan</SelectItem>
            {allCustomers.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-md border overflow-hidden ml-auto">
          <button
            onClick={() => setView("customer")}
            className={cn("px-3 py-1.5 text-sm font-medium transition-colors", view === "customer" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}
          >
            Per Pelanggan
          </button>
          <button
            onClick={() => setView("month")}
            className={cn("px-3 py-1.5 text-sm font-medium transition-colors", view === "month" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}
          >
            Per Bulan
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Memuat laporan bonus...</span>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-16 gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">Gagal memuat data. Coba refresh halaman.</span>
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="shadow-sm border-amber-200 dark:border-amber-900">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Nilai Bonus</p>
                <p className="text-2xl font-bold text-amber-600 font-serif mt-0.5">{fmt(filteredSummary.totalBonus)}</p>
                {filterCustomerId !== "all" && data.summary.totalBonus > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">dari total {fmt(data.summary.totalBonus)}</p>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Artikel Bonus</p>
                <p className="text-2xl font-bold text-primary font-serif mt-0.5">{filteredSummary.totalArticles.toLocaleString("id-ID")} artikel</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pelanggan Penerima Bonus</p>
                <p className="text-2xl font-bold text-emerald-600 font-serif mt-0.5">{filteredSummary.totalCustomers} pelanggan</p>
              </CardContent>
            </Card>
          </div>

          {/* No data */}
          {filteredRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground gap-2">
              <Star className="h-12 w-12 opacity-20" />
              <p className="text-sm">Tidak ada data bonus untuk filter yang dipilih.</p>
            </div>
          )}

          {/* ── VIEW: Per Pelanggan ── */}
          {view === "customer" && filteredRows.length > 0 && (
            <div className="space-y-3">
              {customerGroups.map(cg => {
                const key = String(cg.customerId ?? "none");
                const open = expandedCustomers.has(key);
                return (
                  <Card key={key} className="shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleCustomer(key)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{cg.customerName}</p>
                          <p className="text-xs text-muted-foreground">{cg.totalArticles} artikel bonus · {cg.months.length} bulan</p>
                        </div>
                      </div>
                      <span className="font-bold text-amber-600 font-mono text-sm shrink-0 ml-4">{fmt(cg.totalBonus)}</span>
                    </button>

                    {open && (
                      <div className="border-t">
                        {cg.months.map(mg => (
                          <div key={`${mg.year}-${mg.month}`} className="border-b last:border-b-0">
                            <div className="flex items-center justify-between px-6 py-2.5 bg-muted/20">
                              <div>
                                <span className="text-sm font-medium">{mg.label}</span>
                                <span className="ml-3 text-xs text-muted-foreground">{mg.totalArticles} artikel</span>
                              </div>
                              <span className="font-semibold text-sm text-amber-700">{fmt(mg.totalBonus)}</span>
                            </div>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow className="hover:bg-transparent bg-muted/10">
                                    <TableHead className="pl-8 font-medium text-xs">Kode Job</TableHead>
                                    <TableHead className="font-medium text-xs">Website</TableHead>
                                    <TableHead className="font-medium text-xs">Tanggal Order</TableHead>
                                    <TableHead className="text-right font-medium text-xs">Artikel Bonus</TableHead>
                                    <TableHead className="text-right font-medium text-xs">Nilai Bonus</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {mg.orders.map(o => (
                                    <TableRow key={o.orderId} className="hover:bg-muted/20">
                                      <TableCell className="pl-8 text-sm font-mono">{o.jobCode}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate">{o.website ?? "—"}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{o.orderDate}</TableCell>
                                      <TableCell className="text-right text-sm font-medium">{o.bonusArticles}</TableCell>
                                      <TableCell className="text-right text-sm font-semibold text-amber-700">{fmt(o.bonusValue)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── VIEW: Per Bulan ── */}
          {view === "month" && filteredRows.length > 0 && (
            <div className="space-y-3">
              {monthGroups.map(mg => {
                const key = `${mg.year}-${mg.month}`;
                const open = expandedMonths.has(key);
                return (
                  <Card key={key} className="shadow-sm overflow-hidden">
                    <button
                      onClick={() => toggleMonth(key)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <div>
                          <p className="font-semibold text-sm">{mg.label}</p>
                          <p className="text-xs text-muted-foreground">{mg.totalArticles} artikel · {new Set(mg.orders.map(o => o.customerId)).size} pelanggan</p>
                        </div>
                      </div>
                      <span className="font-bold text-amber-600 font-mono text-sm shrink-0 ml-4">{fmt(mg.totalBonus)}</span>
                    </button>

                    {open && (
                      <div className="border-t overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent bg-muted/20">
                              <TableHead className="pl-8 font-medium text-xs">Pelanggan</TableHead>
                              <TableHead className="font-medium text-xs">Kode Job</TableHead>
                              <TableHead className="font-medium text-xs">Website</TableHead>
                              <TableHead className="font-medium text-xs">Tanggal Order</TableHead>
                              <TableHead className="text-right font-medium text-xs">Artikel Bonus</TableHead>
                              <TableHead className="text-right font-medium text-xs">Nilai Bonus</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mg.orders
                              .sort((a, b) => a.customerName.localeCompare(b.customerName))
                              .map(o => (
                                <TableRow key={o.orderId} className="hover:bg-muted/20">
                                  <TableCell className="pl-8 text-sm font-medium">{o.customerName}</TableCell>
                                  <TableCell className="text-sm font-mono">{o.jobCode}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">{o.website ?? "—"}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">{o.orderDate}</TableCell>
                                  <TableCell className="text-right text-sm font-medium">{o.bonusArticles}</TableCell>
                                  <TableCell className="text-right text-sm font-semibold text-amber-700">{fmt(o.bonusValue)}</TableCell>
                                </TableRow>
                              ))}
                            <TableRow className="bg-amber-50/50 dark:bg-amber-950/20 font-semibold hover:bg-amber-50/50">
                              <TableCell colSpan={4} className="pl-8 text-sm">Total {mg.label}</TableCell>
                              <TableCell className="text-right text-sm">{mg.totalArticles}</TableCell>
                              <TableCell className="text-right text-sm text-amber-700">{fmt(mg.totalBonus)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* Grand total */}
              {monthGroups.length > 1 && (
                <Card className="shadow-sm border-amber-200 dark:border-amber-900">
                  <CardContent className="py-3 px-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">Total Keseluruhan {filterYear}</p>
                        <p className="text-xs text-muted-foreground">{filteredSummary.totalArticles} artikel dari {filteredSummary.totalCustomers} pelanggan</p>
                      </div>
                      <span className="font-bold text-xl text-amber-600 font-mono">{fmt(filteredSummary.totalBonus)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
