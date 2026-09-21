import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Plus, Pencil, Trash2, Loader2,
  Settings2, X, CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FinancialCategoryItem {
  id: number | null;
  type: "income" | "expense";
  key: string;
  label: string;
  color: string;
  auto: boolean;
  isDefault: boolean;
}

interface Transaction {
  id: string;
  _id?: number;
  type: "income" | "expense";
  category: string;
  categoryLabel: string;
  amount: number;
  description: string;
  date: string;
  isAuto: boolean;
  referenceId?: number | null;
  referenceType?: string | null;
}

interface Summary {
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  byCategory: { category: string; type: string; label: string; total: number }[];
  byMonth: { key: string; year: number; month: number; monthLabel: string; income: number; expense: number; netProfit: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"];

const COLOR_SWATCHES = [
  "#10b981","#3b82f6","#8b5cf6","#6366f1","#0ea5e9","#06b6d4","#14b8a6",
  "#ef4444","#f97316","#f59e0b","#84cc16","#a855f7","#ec4899","#d946ef",
  "#f43f5e","#0891b2","#7c3aed","#059669","#64748b","#b45309","#0369a1",
  "#be185d","#9333ea","#c2410c","#15803d","#1d4ed8","#94a3b8",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}rb`;
  return `Rp ${n}`;
};

function buildColorMap(cats: FinancialCategoryItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of cats) map[c.key] = c.color;
  return map;
}

// ─── Kelola Kategori Dialog ────────────────────────────────────────────────
function KelolaCategoryDialog({
  open, onClose, categories, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  categories: FinancialCategoryItem[];
  onChanged: () => void;
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();
  const [tab, setTab] = useState<"income" | "expense">("income");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#f59e0b");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = categories.filter(c => c.type === tab);

  const handleAdd = async () => {
    if (!newLabel.trim()) {
      toast({ title: "Nama kategori harus diisi", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${base}/api/financials/categories`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: tab, label: newLabel.trim(), color: newColor }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Gagal menambah kategori", variant: "destructive" });
      } else {
        toast({ title: `Kategori "${newLabel.trim()}" ditambahkan` });
        setNewLabel("");
        onChanged();
      }
    } catch {
      toast({ title: "Gagal terhubung ke server", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: FinancialCategoryItem) => {
    if (!cat.id) return;
    if (!confirm(`Hapus kategori "${cat.label}"? Transaksi yang sudah ada tidak akan terhapus.`)) return;
    setDeletingId(cat.id);
    try {
      const res = await fetch(`${base}/api/financials/categories/${cat.id}`, {
        method: "DELETE", credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Gagal menghapus", variant: "destructive" });
      } else {
        toast({ title: `Kategori "${cat.label}" dihapus` });
        onChanged();
      }
    } catch {
      toast({ title: "Gagal terhubung ke server", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kelola Kategori</DialogTitle>
          <DialogDescription>Tambah atau hapus kategori keuangan kustom.</DialogDescription>
        </DialogHeader>

        {/* Tab */}
        <div className="flex gap-1 border rounded-lg p-1 bg-muted/40">
          {(["income", "expense"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 text-sm py-1.5 rounded-md font-medium transition-colors",
                tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "income" ? "Pemasukan" : "Pengeluaran"}
            </button>
          ))}
        </div>

        {/* Daftar kategori */}
        <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
          {filtered.map(cat => (
            <div key={cat.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/40 group">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="flex-1 text-sm truncate">{cat.label}</span>
              {cat.auto && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">otomatis</Badge>
              )}
              {cat.isDefault ? (
                <span className="text-xs text-muted-foreground px-1">bawaan</span>
              ) : (
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                  disabled={deletingId === cat.id}
                  onClick={() => handleDelete(cat)}
                >
                  {deletingId === cat.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />}
                </Button>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Belum ada kategori.</p>
          )}
        </div>

        {/* Form tambah */}
        <div className="border-t pt-3 space-y-3">
          <p className="text-sm font-medium">Tambah Kategori Baru</p>
          <div className="flex gap-2">
            <Input
              placeholder={`Nama kategori ${tab === "income" ? "pemasukan" : "pengeluaran"}...`}
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              className="flex-1"
            />
          </div>
          {/* Color picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Warna</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "w-6 h-6 rounded-full border-2 transition-transform",
                    newColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button onClick={handleAdd} disabled={saving || !newLabel.trim()}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            <Plus className="h-4 w-4 mr-1" />Tambah
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Form dialog transaksi ────────────────────────────────────────────────────
interface FormState {
  type: "income" | "expense";
  category: string;
  amount: string;
  description: string;
  date: string;
}

const emptyForm = (): FormState => ({
  type: "income",
  category: "",
  amount: "",
  description: "",
  date: new Date().toLocaleDateString("sv"),
});

function TransactionForm({
  open, onClose, initial, onSaved, allCategories,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Transaction | null;
  onSaved: () => void;
  allCategories: FinancialCategoryItem[];
}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        type: initial.type,
        category: initial.category,
        amount: String(initial.amount),
        description: initial.description ?? "",
        date: initial.date,
      });
    } else {
      setForm(emptyForm());
    }
  }, [initial, open]);

  const categories = allCategories
    .filter(c => c.type === form.type && !c.auto)
    .sort((a, b) => a.label.localeCompare(b.label, "id", { sensitivity: "base" }));

  const handleSubmit = async () => {
    if (!form.category || !form.amount || !form.date) {
      toast({ title: "Lengkapi semua field", variant: "destructive" }); return;
    }
    const amount = parseInt(form.amount.replace(/\D/g, ""));
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Jumlah tidak valid", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const isEdit = !!initial?._id;
      const url = isEdit ? `${base}/api/financials/${initial!._id}` : `${base}/api/financials`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, category: form.category, amount, description: form.description, date: form.date }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Gagal menyimpan", variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: isEdit ? "Transaksi diperbarui" : "Transaksi ditambahkan" });
      setLoading(false);
      onClose();
      onSaved();
    } catch {
      toast({ title: "Gagal terhubung ke server", variant: "destructive" });
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Transaksi" : "Tambah Transaksi"}</DialogTitle>
          <DialogDescription>Isi detail transaksi keuangan manual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Jenis</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as "income"|"expense", category: "" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Pemasukan</SelectItem>
                  <SelectItem value="expense">Pengeluaran</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c.key} value={c.key}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                        {c.label}
                      </div>
                    </SelectItem>
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
            <Label>Tanggal</Label>
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Keterangan</Label>
            <Textarea
              placeholder="Deskripsi opsional..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {initial ? "Perbarui" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ title, amount, icon: Icon, color, sub }: {
  title: string; amount: number; icon: any; color: string; sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={cn("text-2xl font-bold", color)}>{fmt(amount)}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={cn("p-2 rounded-lg", color === "text-emerald-600" ? "bg-emerald-100 dark:bg-emerald-900/30" : color === "text-red-600" ? "bg-red-100 dark:bg-red-900/30" : "bg-blue-100 dark:bg-blue-900/30")}>
            <Icon className={cn("h-5 w-5", color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Custom tooltip for bar chart ────────────────────────────────────────────
function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-xs space-y-1">
      <p className="font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt(p.value)}
        </p>
      ))}
      {payload.length === 2 && (
        <p className={cn("font-semibold border-t pt-1 mt-1",
          (payload[0]?.value - payload[1]?.value) >= 0 ? "text-emerald-600" : "text-red-600")}>
          Laba: {fmt(payload[0]?.value - payload[1]?.value)}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KeuanganPage() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();

  // Categories (loaded from API)
  const [categories, setCategories] = useState<FinancialCategoryItem[]>([]);
  const [manageOpen, setManageOpen] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch(`${base}/api/financials/categories`, { credentials: "include" });
      if (res.ok) setCategories(await res.json());
    } catch { /* silent */ }
  }, [base]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  const incomeCategories = categories.filter(c => c.type === "income");
  const expenseCategories = categories.filter(c => c.type === "expense");
  const allCategories = categories;
  const colorMap = buildColorMap(categories);
  const getCatColor = (cat: string, type: string) =>
    colorMap[cat] ?? (type === "income" ? "#10b981" : "#94a3b8");

  // Filters
  const currentYear = String(new Date().getFullYear());
  const currentMonth = String(new Date().getMonth() + 1);
  const [years, setYears] = useState<string[]>([currentYear]);
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState<string>(currentMonth);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingTx, setLoadingTx] = useState(false);
  const [loadingSum, setLoadingSum] = useState(false);

  // Form
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);


  // Load years
  useEffect(() => {
    fetch(`${base}/api/financials/years`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [currentYear])
      .then(setYears)
      .catch(() => {});
  }, [base]);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterYear && filterYear !== "all") params.set("year", filterYear);
    if (filterMonth !== "all") params.set("month", filterMonth);
    if (filterType !== "all") params.set("type", filterType);
    if (filterCategory !== "all") params.set("category", filterCategory);
    const qs = params.toString();

    setLoadingTx(true);
    setLoadingSum(true);

    fetch(`${base}/api/financials${qs ? "?" + qs : ""}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoadingTx(false));

    const sumParams = new URLSearchParams();
    if (filterYear && filterYear !== "all") sumParams.set("year", filterYear);
    if (filterMonth !== "all") sumParams.set("month", filterMonth);

    fetch(`${base}/api/financials/summary?${sumParams.toString()}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoadingSum(false));
  }, [base, filterYear, filterMonth, filterType, filterCategory]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async (tx: Transaction) => {
    if (!tx._id) return;
    if (!confirm(`Hapus transaksi "${tx.description || tx.categoryLabel}"?`)) return;
    try {
      const res = await fetch(`${base}/api/financials/${tx._id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) { toast({ title: "Transaksi dihapus" }); loadData(); }
      else { const d = await res.json(); toast({ title: d.error ?? "Gagal hapus", variant: "destructive" }); }
    } catch { toast({ title: "Gagal terhubung", variant: "destructive" }); }
  };

  // Chart data
  const chartData = summary?.byMonth?.slice(-12) ?? [];
  const incomeByCategory = summary?.byCategory?.filter(c => c.type === "income") ?? [];
  const expenseByCategory = summary?.byCategory?.filter(c => c.type === "expense") ?? [];

  const periodLabel = filterMonth === "all"
    ? filterYear === "all" ? "Semua waktu" : `Tahun ${filterYear}`
    : `${MONTHS_ID[Number(filterMonth) - 1]} ${filterYear}`;

  const filterCategoryOptions =
    filterType === "income" ? incomeCategories :
    filterType === "expense" ? expenseCategories : allCategories;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">

      {/* ── Header + Filter ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Keuangan</h1>
            <p className="text-sm text-muted-foreground">{periodLabel}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline" size="sm"
              className="gap-1.5"
              onClick={() => setManageOpen(true)}
            >
              <Settings2 className="h-4 w-4" />Kelola Kategori
            </Button>
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />Tambah Transaksi
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Year */}
          <Select value={filterYear} onValueChange={v => { setFilterYear(v); setFilterMonth("all"); }}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue placeholder="Tahun" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Tahun</SelectItem>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Month */}
          {filterYear !== "all" && (
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue placeholder="Bulan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Bulan</SelectItem>
                {MONTHS_ID.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Type */}
          <Select value={filterType} onValueChange={v => { setFilterType(v); setFilterCategory("all"); }}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Jenis</SelectItem>
              <SelectItem value="income">Pemasukan</SelectItem>
              <SelectItem value="expense">Pengeluaran</SelectItem>
            </SelectContent>
          </Select>

          {/* Category */}
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-8 w-[170px] text-xs">
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kategori</SelectItem>
              {filterCategoryOptions.map(c => (
                <SelectItem key={c.key} value={c.key}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {loadingSum ? (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard title="Total Pemasukan" amount={summary.totalIncome} icon={TrendingUp} color="text-emerald-600" />
          <SummaryCard title="Total Pengeluaran" amount={summary.totalExpense} icon={TrendingDown} color="text-red-600" />
          <SummaryCard
            title="Laba Bersih" amount={summary.netProfit} icon={Wallet}
            color={summary.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}
            sub={summary.netProfit >= 0 ? "Profit" : "Rugi"}
          />
        </div>
      )}

      {/* ── Charts ── */}
      {summary && chartData.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

          <Card className="xl:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pemasukan vs Pengeluaran per Bulan</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => v >= 1_000_000 ? `${v/1_000_000}jt` : v >= 1_000 ? `${v/1_000}rb` : String(v)} tick={{ fontSize: 11 }} />
                  <Tooltip content={<BarTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Pemasukan" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name="Pengeluaran" fill="#ef4444" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Rincian Pengeluaran</CardTitle>
              <CardDescription>Proporsi per kategori</CardDescription>
            </CardHeader>
            <CardContent>
              {expenseByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Belum ada pengeluaran</p>
              ) : (
                <div className="space-y-2">
                  {expenseByCategory.map(c => {
                    const totalExp = summary.totalExpense || 1;
                    const pct = Math.round((c.total / totalExp) * 100);
                    const color = colorMap[c.category] ?? "#94a3b8";
                    return (
                      <div key={c.category} className="space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium" style={{ color }}>{c.label}</span>
                          <span className="text-muted-foreground">{fmtShort(c.total)} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground pt-1 border-t">
                    Total: <span className="font-semibold text-red-600">{fmt(summary.totalExpense)}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Category Breakdown Tables ── */}
      {summary && (incomeByCategory.length > 0 || expenseByCategory.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-emerald-600 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4" />Pemasukan per Kategori
              </CardTitle>
            </CardHeader>
            <CardContent>
              {incomeByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada pemasukan</p>
              ) : (
                <div className="space-y-1">
                  {incomeByCategory.map(c => (
                    <div key={c.category} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorMap[c.category] ?? "#10b981" }} />
                        <span>{c.label}</span>
                      </div>
                      <span className="font-semibold text-emerald-600">{fmt(c.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-1.5 font-bold">
                    <span>Total</span>
                    <span className="text-emerald-600">{fmt(summary.totalIncome)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-600 flex items-center gap-1.5">
                <TrendingDown className="h-4 w-4" />Pengeluaran per Kategori
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expenseByCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Belum ada pengeluaran</p>
              ) : (
                <div className="space-y-1">
                  {expenseByCategory.map(c => (
                    <div key={c.category} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colorMap[c.category] ?? "#94a3b8" }} />
                        <span>{c.label}</span>
                      </div>
                      <span className="font-semibold text-red-600">{fmt(c.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-1.5 font-bold">
                    <span>Total</span>
                    <span className="text-red-600">{fmt(summary.totalExpense)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Transaction List ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Daftar Transaksi</CardTitle>
            <span className="text-xs text-muted-foreground">{transactions.length} transaksi</span>
          </div>
          <CardDescription>
            Data otomatis (order, tabungan, gaji) tidak dapat diedit. Tambahkan transaksi manual untuk yang lain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTx ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Belum ada transaksi untuk periode ini.</p>
          ) : (
            <div className="space-y-1">
              {transactions.map(tx => (
                <div key={tx.id} className={cn(
                  "rounded-lg px-3 py-3 transition-colors overflow-hidden",
                  "hover:bg-muted/40 border border-transparent hover:border-border/50",
                )}>
                  <div className="flex items-start gap-2.5 w-full min-w-0">
                    <div className="shrink-0 w-2.5 h-2.5 rounded-full mt-1.5"
                      style={{ backgroundColor: getCatColor(tx.category, tx.type) }} />
                    <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                      <div className="grid items-start gap-2" style={{ gridTemplateColumns: "1fr auto" }}>
                        <p className="text-sm font-medium leading-snug break-words min-w-0">
                          {tx.description || tx.categoryLabel}
                        </p>
                        <span className={cn(
                          "text-sm font-semibold text-right whitespace-nowrap",
                          tx.type === "income" ? "text-emerald-600" : "text-red-600",
                        )}>
                          {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-xs px-1.5 py-0"
                          style={{ borderColor: getCatColor(tx.category, tx.type), color: getCatColor(tx.category, tx.type) }}>
                          {tx.categoryLabel}
                        </Badge>
                        {tx.isAuto && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">otomatis</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        {!tx.isAuto && (
                          <div className="flex gap-0.5">
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => { setEditing(tx); setFormOpen(true); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(tx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialogs ── */}
      <TransactionForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSaved={loadData}
        allCategories={allCategories}
      />

      <KelolaCategoryDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        categories={categories}
        onChanged={() => { loadCategories(); loadData(); }}
      />
    </div>
  );
}
