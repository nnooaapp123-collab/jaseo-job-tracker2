import { useState, useEffect, useRef, useMemo } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Plus, Trash2, Loader2, Check, X, Search, ShoppingBag, Link2, AlertCircle, FileUp, FileDown, Eye, Pencil, Save, CalendarDays } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Link } from "wouter";

type Customer = { id: number; name: string; wa: string | null; };
type ArticleOrder = {
  id: number;
  jobCode: string;
  orderDate: string;
  deadlineDate: string | null;
  customerId: number | null;
  customerName: string | null;
  customerWa: string | null;
  articleCount: number;
  wordCount: number;
  tool: string | null;
  paymentBank: string | null;
  price: number;
  bonusArticles: number;
  bonusValue: number;
  notes: string | null;
  website: string | null;
  siteUser: string | null;
  sitePassword: string | null;
  petunjuk: string | null;
  jobExists: boolean;
  createdAt: string;
};
type OrderForm = {
  jobCode: string; orderDate: string; deadlineDate: string; customerId: string;
  articleCount: string; wordCount: string; tool: string;
  paymentBank: string; price: string; bonusArticles: string; bonusValue: string; notes: string;
  website: string; siteUser: string; sitePassword: string;
};
const EMPTY_FORM: OrderForm = {
  jobCode: "", orderDate: format(new Date(), "yyyy-MM-dd"), deadlineDate: "", customerId: "",
  articleCount: "1", wordCount: "", tool: "", paymentBank: "", price: "", bonusArticles: "0", bonusValue: "0", notes: "",
  website: "", siteUser: "", sitePassword: "",
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ORDERS_KEY = ["article-orders"];
const CUSTOMERS_KEY = ["customers"];

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

// Sort kode job: angka besar di atas, suffix alfabet (A < B)
function cmpJobCode(a: string, b: string): number {
  const nA = parseInt(a) || 0;
  const nB = parseInt(b) || 0;
  if (nA !== nB) return nB - nA;
  const sA = a.slice(String(nA).length);
  const sB = b.slice(String(nB).length);
  return sA.localeCompare(sB);
}

// ─── InlineCell ──────────────────────────────────────────────────────────────
function InlineCell({
  value, onSave, disabled, placeholder, type = "text", className, isMoney,
}: {
  value: string; onSave: (v: string) => void; disabled?: boolean;
  placeholder?: string; type?: string; className?: string; isMoney?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const display = isMoney && value ? `Rp ${parseInt(value).toLocaleString("id-ID")}` : value;

  if (!editing) {
    return (
      <button
        disabled={disabled}
        onClick={() => { setLocal(value); setEditing(true); }}
        className={`text-left w-full min-w-[60px] px-1 py-0.5 rounded hover:bg-muted/60 transition-colors text-sm ${!value ? "text-muted-foreground italic" : ""} ${className ?? ""}`}
      >
        {display || placeholder || "—"}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus type={type} value={local}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(local); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 text-sm px-1.5 min-w-[80px]"
      />
      <button onClick={() => { onSave(local); setEditing(false); }} className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

// ─── InlineSelect ─────────────────────────────────────────────────────────────
function InlineSelectCustomer({
  customerId, customers, onSave, disabled,
}: {
  customerId: number | null; customers: Customer[];
  onSave: (id: string) => void; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const label = customers.find(c => c.id === customerId)?.name;

  if (!editing) {
    return (
      <button
        disabled={disabled}
        onClick={() => setEditing(true)}
        className={`text-left w-full min-w-[120px] px-1 py-0.5 rounded hover:bg-muted/60 transition-colors text-sm ${!label ? "text-muted-foreground italic" : ""}`}
      >
        {label || "— pilih pelanggan —"}
      </button>
    );
  }
  return (
    <Select
      value={customerId?.toString() ?? "__none__"}
      onValueChange={v => { onSave(v === "__none__" ? "" : v); setEditing(false); }}
      open
      onOpenChange={o => !o && setEditing(false)}
    >
      <SelectTrigger className="h-7 text-sm min-w-[140px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— Tidak ada —</SelectItem>
        {customers.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ─── SitePasswordCell — tampilkan password tersamar, klik untuk lihat ─────────
function SitePasswordCell({ value }: { value: string | null }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-xs text-muted-foreground italic">—</span>;
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs font-mono">{show ? value : "••••••••"}</span>
      <button
        onClick={() => setShow(s => !s)}
        className="text-muted-foreground hover:text-primary transition-colors shrink-0"
        title={show ? "Sembunyikan" : "Tampilkan password"}
      >
        <Eye className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function OrderPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdminOrCS = currentUser?.role === "admin" || currentUser?.role === "cs";

  const now = new Date();
  const [filterMode, setFilterMode] = useState<"month" | "year" | "all">("month");
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustWa, setNewCustWa] = useState("");
  // Import Excel
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  // Petunjuk view dialog
  const [petunjukDialog, setPetunjukDialog] = useState<{ open: boolean; jobCode: string; text: string | null }>({ open: false, jobCode: "", text: null });
  const [petunjukDialogEditing, setPetunjukDialogEditing] = useState(false);
  const [petunjukDialogLocal, setPetunjukDialogLocal] = useState("");
  const [petunjukDialogSaving, setPetunjukDialogSaving] = useState(false);
  // Edit order
  const [editOrder, setEditOrder] = useState<ArticleOrder | null>(null);
  const [editForm, setEditForm] = useState<OrderForm>(EMPTY_FORM);
  // Petunjuk lookup di form (Add / Edit)
  const [formPetunjuk, setFormPetunjuk] = useState<{ petunjuk: string | null; exists: boolean } | null>(null);
  const [formPetunjukLoading, setFormPetunjukLoading] = useState(false);
  const petunjukTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Petunjuk input sementara di form (input langsung oleh CS)
  const [formPetunjukInput, setFormPetunjukInput] = useState("");

  const { data: orders = [], isLoading } = useQuery<ArticleOrder[]>({
    queryKey: ORDERS_KEY,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/article-orders`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat order");
      return res.json();
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/customers`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat pelanggan");
      return res.json();
    },
  });

  // Helper: simpan petunjuk ke jobs table jika diisi CS di form
  const savePetunjukToJob = async (jobCode: string, petunjuk: string) => {
    if (!jobCode.trim() || !petunjuk.trim()) return;
    await fetch(`${BASE}/api/jobs/batch-petunjuk`, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ jobCode, petunjuk }] }),
    });
  };

  // Simpan petunjuk langsung dari popup view (berlaku ke semua job + order dengan kode yang sama)
  const handleSavePetunjukDialog = async () => {
    if (!petunjukDialog.jobCode.trim()) return;
    setPetunjukDialogSaving(true);
    try {
      await fetch(`${BASE}/api/jobs/batch-petunjuk`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ jobCode: petunjukDialog.jobCode, petunjuk: petunjukDialogLocal }] }),
      });
      setPetunjukDialog(d => ({ ...d, text: petunjukDialogLocal || null }));
      setPetunjukDialogEditing(false);
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
      toast({ title: "Petunjuk penulisan berhasil disimpan" });
    } catch {
      toast({ title: "Gagal menyimpan petunjuk", variant: "destructive" });
    } finally {
      setPetunjukDialogSaving(false);
    }
  };

  const addMutation = useMutation({
    mutationFn: async (body: OrderForm) => {
      const res = await fetch(`${BASE}/api/article-orders`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobCode: body.jobCode,
          orderDate: body.orderDate,
          deadlineDate: body.deadlineDate || null,
          customerId: body.customerId ? parseInt(body.customerId) : null,
          articleCount: parseInt(body.articleCount) || 1,
          wordCount: parseInt(body.wordCount) || 0,
          tool: body.tool || null,
          paymentBank: body.paymentBank || null,
          price: parseInt(body.price) || 0,
          bonusArticles: parseInt(body.bonusArticles) || 0,
          bonusValue: parseInt(body.bonusValue) || 0,
          notes: body.notes || null,
          website: body.website || null,
          siteUser: body.siteUser || null,
          sitePassword: body.sitePassword || null,
          petunjuk: formPetunjukInput.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal menambah order");
      // Juga update jobs yang sudah ada (jika sudah ada di dashboard)
      if (formPetunjukInput.trim()) {
        await savePetunjukToJob(body.jobCode, formPetunjukInput.trim());
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
      setIsAddOpen(false);
      setForm(EMPTY_FORM);
      setFormPetunjukInput("");
      const saved = formPetunjukInput.trim();
      toast({ title: "Order ditambahkan", description: saved ? "Petunjuk penulisan tersimpan — akan otomatis masuk saat job dijadwalkan" : undefined });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/customers`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCustName, wa: newCustWa }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal");
      return res.json() as Promise<Customer>;
    },
    onSuccess: (cust) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      setForm(f => ({ ...f, customerId: cust.id.toString() }));
      setAddCustomerOpen(false);
      setNewCustName(""); setNewCustWa("");
      toast({ title: `Pelanggan "${cust.name}" ditambahkan` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchField = async (id: number, field: Partial<Record<string, unknown>>) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const res = await fetch(`${BASE}/api/article-orders/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...order, ...field }),
    });
    if (!res.ok) { toast({ title: "Gagal menyimpan", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ORDERS_KEY });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/article-orders/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Gagal menghapus");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
      setDeleteId(null);
      toast({ title: "Order dihapus" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/article-orders/import`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal import");
      return res.json() as Promise<{ inserted: number; skipped: number; skippedDetails: string[]; petunjukUpdated: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
      setImportOpen(false);
      setImportFile(null);
      const parts = [`${data.inserted} order diimpor`];
      if (data.petunjukUpdated > 0) parts.push(`${data.petunjukUpdated} Petunjuk Penulisan disinkronkan ke Dashboard`);
      if (data.skipped > 0) parts.push(`${data.skipped} baris dilewati`);
      toast({ title: "Import selesai", description: parts.join(" · ") });
    },
    onError: (e: Error) => toast({ title: "Gagal Import", description: e.message, variant: "destructive" }),
  });

  const downloadTemplate = () => {
    window.open(`${BASE}/api/article-orders/template`, "_blank");
  };

  const exportExcel = () => {
    window.open(`${BASE}/api/article-orders/export`, "_blank");
  };

  // Debounced petunjuk lookup — dipanggil saat jobCode berubah di dialog Add/Edit
  const lookupPetunjuk = (code: string) => {
    if (petunjukTimerRef.current) clearTimeout(petunjukTimerRef.current);
    if (!code.trim()) { setFormPetunjuk(null); return; }
    setFormPetunjukLoading(true);
    petunjukTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/jobs/lookup-petunjuk?code=${encodeURIComponent(code)}`, { credentials: "include" });
        if (res.ok) setFormPetunjuk(await res.json());
      } finally {
        setFormPetunjukLoading(false);
      }
    }, 500);
  };

  // useEffect: reset petunjuk saat dialog Add dibuka/ditutup
  useEffect(() => {
    if (!isAddOpen) { setFormPetunjuk(null); setFormPetunjukLoading(false); setFormPetunjukInput(""); return; }
    lookupPetunjuk(form.jobCode);
  }, [isAddOpen]);

  // useEffect: lookup petunjuk saat jobCode di form Add berubah
  useEffect(() => {
    if (isAddOpen) lookupPetunjuk(form.jobCode);
  }, [form.jobCode]);

  // useEffect: lookup petunjuk saat dialog Edit dibuka / jobCode berubah
  useEffect(() => {
    if (!editOrder) { setFormPetunjuk(null); setFormPetunjukInput(""); return; }
    lookupPetunjuk(editForm.jobCode);
  }, [editForm.jobCode, editOrder]);

  // useEffect: reset input petunjuk saat kode job berubah (tidak otomatis prefill ulang)
  useEffect(() => {
    setFormPetunjukInput("");
  }, [form.jobCode, editForm.jobCode]);

  const editMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: OrderForm }) => {
      const res = await fetch(`${BASE}/api/article-orders/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobCode: body.jobCode,
          orderDate: body.orderDate,
          deadlineDate: body.deadlineDate || null,
          customerId: body.customerId ? parseInt(body.customerId) : null,
          articleCount: parseInt(body.articleCount) || 1,
          wordCount: parseInt(body.wordCount) || 0,
          tool: body.tool || null,
          paymentBank: body.paymentBank || null,
          price: parseInt(body.price) || 0,
          bonusArticles: parseInt(body.bonusArticles) || 0,
          bonusValue: parseInt(body.bonusValue) || 0,
          notes: body.notes || null,
          website: body.website || null,
          siteUser: body.siteUser || null,
          sitePassword: body.sitePassword || null,
          petunjuk: formPetunjukInput.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal menyimpan");
      // Juga update jobs yang sudah ada (jika sudah ada di dashboard)
      if (formPetunjukInput.trim()) {
        await savePetunjukToJob(body.jobCode, formPetunjukInput.trim());
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORDERS_KEY });
      setEditOrder(null);
      setFormPetunjukInput("");
      const saved = formPetunjukInput.trim();
      toast({ title: "Order diperbarui", description: saved ? "Petunjuk penulisan tersimpan — akan otomatis masuk saat job dijadwalkan" : undefined });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openEdit = (o: ArticleOrder) => {
    setEditForm({
      jobCode: o.jobCode,
      orderDate: o.orderDate,
      deadlineDate: o.deadlineDate ?? "",
      customerId: o.customerId?.toString() ?? "",
      articleCount: String(o.articleCount),
      wordCount: String(o.wordCount),
      tool: o.tool ?? "",
      paymentBank: o.paymentBank ?? "",
      price: String(o.price),
      bonusArticles: String(o.bonusArticles),
      bonusValue: String(o.bonusValue),
      notes: o.notes ?? "",
      website: o.website ?? "",
      siteUser: o.siteUser ?? "",
      sitePassword: o.sitePassword ?? "",
    });
    setEditOrder(o);
  };

  // Tahun yang tersedia (dari data order)
  const availableYears = useMemo(() => {
    const yrs = new Set(orders.map(o => parseInt(o.orderDate?.slice(0, 4) ?? "0")).filter(y => y > 2000));
    yrs.add(new Date().getFullYear());
    return [...yrs].sort((a, b) => b - a);
  }, [orders]);

  // Diurutkan kode job terbesar → terkecil
  const sorted = useMemo(() => [...orders].sort((a, b) => cmpJobCode(a.jobCode, b.jobCode)), [orders]);

  // Filter periode
  const periodFiltered = useMemo(() => sorted.filter(o => {
    if (filterMode === "all") return true;
    if (!o.orderDate) return false;
    const [y, m] = o.orderDate.split("-").map(Number);
    if (filterMode === "year") return y === filterYear;
    return y === filterYear && m === filterMonth;
  }), [sorted, filterMode, filterYear, filterMonth]);

  // Filter pencarian
  const filtered = useMemo(() => periodFiltered.filter(o =>
    o.jobCode.toLowerCase().includes(search.toLowerCase()) ||
    (o.customerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (o.paymentBank ?? "").toLowerCase().includes(search.toLowerCase())
  ), [periodFiltered, search]);

  const totalPrice = filtered.reduce((s, o) => s + o.price, 0);
  const totalBonus = filtered.reduce((s, o) => s + o.bonusValue, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <ShoppingBag className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-xl font-serif font-semibold truncate">Order Artikel</h2>
          <span className="text-sm text-muted-foreground ml-1">
            ({filtered.length}{filterMode !== "all" ? ` dari ${orders.length}` : ""} order)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari kode job, pelanggan..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-56"
            />
          </div>
          {isAdminOrCS && (
            <>
              <Button size="sm" variant="outline" onClick={exportExcel} title="Export semua order ke Excel">
                <FileDown className="h-4 w-4 mr-1" /> Export Excel
              </Button>
              <Button size="sm" variant="outline" onClick={downloadTemplate} title="Download template Excel untuk import">
                <FileDown className="h-4 w-4 mr-1" /> Template
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} title="Import dari Excel">
                <FileUp className="h-4 w-4 mr-1" /> Import Excel
              </Button>
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Order
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Filter Periode ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        {/* Mode toggle */}
        <div className="flex rounded-md border overflow-hidden text-sm">
          {(["month","year","all"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1.5 transition-colors ${filterMode === mode ? "bg-primary text-primary-foreground font-medium" : "bg-background hover:bg-muted/60 text-foreground"}`}
            >
              {mode === "month" ? "Per Bulan" : mode === "year" ? "Per Tahun" : "Semua"}
            </button>
          ))}
        </div>

        {/* Year selector */}
        {filterMode !== "all" && (
          <Select value={String(filterYear)} onValueChange={v => setFilterYear(Number(v))}>
            <SelectTrigger className="h-8 text-sm w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Month selector — hanya tampil di mode "month" */}
        {filterMode === "month" && (
          <Select value={String(filterMonth)} onValueChange={v => setFilterMonth(Number(v))}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_ID.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Label periode aktif */}
        <span className="text-xs text-muted-foreground">
          {filterMode === "month"
            ? `${MONTHS_ID[filterMonth - 1]} ${filterYear} · ${periodFiltered.length} order`
            : filterMode === "year"
            ? `Tahun ${filterYear} · ${periodFiltered.length} order`
            : `Semua waktu · ${orders.length} order`}
        </span>
      </div>

      {/* Summary strip */}
      {filtered.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          {[
            { label: "Total Order", value: filtered.length, fmt: false },
            { label: "Total Artikel", value: filtered.reduce((s, o) => s + o.articleCount, 0), fmt: false },
            { label: "Total Kata", value: filtered.reduce((s, o) => s + o.wordCount, 0), fmt: true },
            { label: "Total Harga", value: totalPrice, fmt: true, money: true },
            { label: "Total Bonus", value: totalBonus, fmt: true, money: true },
          ].map(({ label, value, fmt, money }) => (
            <Card key={label} className="px-4 py-2.5 flex flex-col gap-0.5 shadow-sm">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
              <span className="text-lg font-bold font-serif text-primary">
                {money ? `Rp ${value.toLocaleString("id-ID")}` : fmt ? value.toLocaleString("id-ID") : value}
              </span>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 text-center font-semibold sticky left-0 bg-muted/40">No</TableHead>
                <TableHead className="min-w-[130px] font-semibold">Kode Job</TableHead>
                <TableHead className="min-w-[120px] font-semibold">Tgl Order</TableHead>
                <TableHead className="min-w-[120px] font-semibold">Deadline</TableHead>
                <TableHead className="min-w-[160px] font-semibold">Pelanggan</TableHead>
                <TableHead className="min-w-[80px] text-right font-semibold">Artikel</TableHead>
                <TableHead className="min-w-[90px] text-right font-semibold">Kata</TableHead>
                <TableHead className="min-w-[120px] font-semibold">Tool</TableHead>
                <TableHead className="min-w-[130px] font-semibold">Bank Bayar</TableHead>
                <TableHead className="min-w-[130px] text-right font-semibold">Harga (Rp)</TableHead>
                <TableHead className="min-w-[80px] text-right font-semibold">Bonus Art.</TableHead>
                <TableHead className="min-w-[130px] text-right font-semibold">Nilai Bonus</TableHead>
                <TableHead className="min-w-[180px] font-semibold">Website</TableHead>
                <TableHead className="min-w-[120px] font-semibold">User</TableHead>
                <TableHead className="min-w-[120px] font-semibold">Password</TableHead>
                <TableHead className="min-w-[220px] font-semibold">Petunjuk Penulisan</TableHead>
                {isAdminOrCS && <TableHead className="w-20 text-center font-semibold">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={17} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                    {search ? "Tidak ada order yang cocok" : "Belum ada data order"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((o, idx) => {
                  const isDeadlineClose = o.deadlineDate && o.deadlineDate <= format(new Date(Date.now() + 2 * 86400000), "yyyy-MM-dd");
                  const isDeadlinePassed = o.deadlineDate && o.deadlineDate < format(new Date(), "yyyy-MM-dd");
                  return (
                    <TableRow key={o.id} className="hover:bg-muted/30">
                      <TableCell className="text-center text-sm text-muted-foreground font-mono sticky left-0 bg-background">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <InlineCell value={o.jobCode} onSave={v => patchField(o.id, { jobCode: v })} disabled={!isAdminOrCS} placeholder="JS-001" className="font-mono font-medium" />
                          {o.jobExists && (
                            <span title="Kode job terhubung ke Dashboard" className="text-emerald-500 shrink-0">
                              <Link2 className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <InlineCell value={o.orderDate} onSave={v => patchField(o.id, { orderDate: v })} disabled={!isAdminOrCS} type="date" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <InlineCell
                            value={o.deadlineDate ?? ""}
                            onSave={v => patchField(o.id, { deadlineDate: v || null })}
                            disabled={!isAdminOrCS}
                            type="date"
                            placeholder="Pilih deadline"
                            className={isDeadlinePassed ? "text-red-600 font-medium" : isDeadlineClose ? "text-amber-600 font-medium" : ""}
                          />
                          {isDeadlinePassed && <span title="Deadline terlewat!"><AlertCircle className="h-3 w-3 text-red-500 shrink-0" /></span>}
                          {!isDeadlinePassed && isDeadlineClose && <span title="Deadline mendekati!"><AlertCircle className="h-3 w-3 text-amber-500 shrink-0" /></span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <InlineSelectCustomer
                          customerId={o.customerId}
                          customers={customers}
                          onSave={v => patchField(o.id, { customerId: v ? parseInt(v) : null })}
                          disabled={!isAdminOrCS}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <InlineCell value={String(o.articleCount)} onSave={v => patchField(o.id, { articleCount: parseInt(v) || 1 })} disabled={!isAdminOrCS} type="number" className="text-right font-mono" />
                      </TableCell>
                      <TableCell className="text-right">
                        <InlineCell value={String(o.wordCount)} onSave={v => patchField(o.id, { wordCount: parseInt(v) || 0 })} disabled={!isAdminOrCS} type="number" className="text-right font-mono" />
                      </TableCell>
                      <TableCell>
                        <InlineCell value={o.tool ?? ""} onSave={v => patchField(o.id, { tool: v || null })} disabled={!isAdminOrCS} placeholder="GPT-4o, dll" />
                      </TableCell>
                      <TableCell>
                        <InlineCell value={o.paymentBank ?? ""} onSave={v => patchField(o.id, { paymentBank: v || null })} disabled={!isAdminOrCS} placeholder="BCA, Mandiri..." />
                      </TableCell>
                      <TableCell className="text-right">
                        <InlineCell value={String(o.price)} onSave={v => patchField(o.id, { price: parseInt(v) || 0 })} disabled={!isAdminOrCS} type="number" isMoney className="text-right font-mono" />
                      </TableCell>
                      <TableCell className="text-right">
                        <InlineCell value={String(o.bonusArticles)} onSave={v => patchField(o.id, { bonusArticles: parseInt(v) || 0 })} disabled={!isAdminOrCS} type="number" className="text-right font-mono" />
                      </TableCell>
                      <TableCell className="text-right">
                        <InlineCell value={String(o.bonusValue)} onSave={v => patchField(o.id, { bonusValue: parseInt(v) || 0 })} disabled={!isAdminOrCS} type="number" isMoney className="text-right font-mono" />
                      </TableCell>
                      {/* Website */}
                      <TableCell className="max-w-[180px]">
                        {o.website ? (
                          <div className="flex items-center gap-1">
                            <a href={o.website.startsWith("http") ? o.website : `https://${o.website}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline truncate max-w-[140px] block"
                              title={o.website}
                            >{o.website}</a>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      {/* User */}
                      <TableCell>
                        {o.siteUser ? (
                          <span className="text-xs font-mono">{o.siteUser}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      {/* Password — masked */}
                      <TableCell>
                        <SitePasswordCell value={o.sitePassword} />
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {o.petunjuk ? (
                          <div className="flex items-start gap-1.5">
                            <span title="Tersinkron dari jobs table"><Link2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" /></span>
                            <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line flex-1">{o.petunjuk}</p>
                            <button
                              onClick={() => setPetunjukDialog({ open: true, jobCode: o.jobCode, text: o.petunjuk })}
                              className="shrink-0 text-primary hover:text-primary/70 transition-colors"
                              title="Lihat petunjuk lengkap"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : o.jobExists ? (
                          <span className="text-xs text-muted-foreground italic">Job ada, petunjuk penulisan belum diisi</span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      {isAdminOrCS && (
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <button onClick={() => openEdit(o)} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Edit order">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteId(o.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1" title="Hapus order">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Dialog Tambah Order ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah Order Artikel</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Kode Job <span className="text-destructive">*</span></Label>
              <Input value={form.jobCode} onChange={e => setForm(f => ({ ...f, jobCode: e.target.value }))} placeholder="JS-001" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tgl Order <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.orderDate} onChange={e => setForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            {/* Petunjuk Preview dari Jobs Table */}
            {(formPetunjukLoading || formPetunjuk) && (
              <div className="col-span-2">
                {formPetunjukLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Mencari petunjuk penulisan...
                  </div>
                ) : formPetunjuk?.exists ? (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> Job ditemukan di Dashboard
                      </span>
                      {formPetunjuk.petunjuk && (
                        <button
                          type="button"
                          onClick={() => setPetunjukDialog({ open: true, jobCode: form.jobCode, text: formPetunjuk.petunjuk })}
                          className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" /> Lihat lengkap
                        </button>
                      )}
                    </div>
                    {formPetunjuk.petunjuk ? (
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 line-clamp-3 whitespace-pre-line">{formPetunjuk.petunjuk}</p>
                    ) : (
                      <p className="text-xs text-emerald-600 dark:text-emerald-500 italic">Job ditemukan, petunjuk penulisan belum diisi di Dashboard</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                    <AlertCircle className="h-3 w-3" /> Kode job tidak ditemukan di Dashboard
                  </div>
                )}
              </div>
            )}
            {/* Textarea input petunjuk — muncul jika belum ada petunjuk & kode job sudah diisi */}
            {!formPetunjukLoading && form.jobCode.trim() && !formPetunjuk?.petunjuk && (
              <div className="col-span-2 grid gap-1.5">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Pencil className="h-3.5 w-3.5 text-primary" />
                  {formPetunjuk?.exists
                    ? "Tambahkan Petunjuk Penulisan (akan disimpan ke Dashboard)"
                    : "Petunjuk Penulisan (opsional — disimpan saat job ada di Dashboard)"}
                </Label>
                <textarea
                  rows={4}
                  value={formPetunjukInput}
                  onChange={e => setFormPetunjukInput(e.target.value)}
                  placeholder="Tulis instruksi penulisan lengkap untuk penulis di sini..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[80px]"
                />
                {formPetunjukInput.trim() && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Petunjuk akan otomatis tersimpan ke Dashboard saat order disimpan
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-1.5 col-span-2">
              <Label>Tanggal Deadline</Label>
              <Input type="date" value={form.deadlineDate} onChange={e => setForm(f => ({ ...f, deadlineDate: e.target.value }))} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label className="flex items-center justify-between">
                Pelanggan
                <button
                  type="button"
                  onClick={() => setAddCustomerOpen(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Tambah Pelanggan Baru
                </button>
              </Label>
              <Select
                value={form.customerId || "__none__"}
                onValueChange={v => setForm(f => ({ ...f, customerId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="— Pilih pelanggan —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak ada —</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}{c.wa ? ` (${c.wa})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Jumlah Artikel</Label>
              <Input type="number" min="1" value={form.articleCount} onChange={e => setForm(f => ({ ...f, articleCount: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Jumlah Kata</Label>
              <Input type="number" min="0" value={form.wordCount} onChange={e => setForm(f => ({ ...f, wordCount: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tool</Label>
              <Input value={form.tool} onChange={e => setForm(f => ({ ...f, tool: e.target.value }))} placeholder="GPT-4o, Gemini..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Bank Pembayaran</Label>
              <Input value={form.paymentBank} onChange={e => setForm(f => ({ ...f, paymentBank: e.target.value }))} placeholder="BCA, Mandiri, OVO..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Harga (Rp)</Label>
              <Input type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Bonus Artikel</Label>
              <Input type="number" min="0" value={form.bonusArticles} onChange={e => setForm(f => ({ ...f, bonusArticles: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Nilai Bonus (Rp)</Label>
              <Input type="number" min="0" value={form.bonusValue} onChange={e => setForm(f => ({ ...f, bonusValue: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Catatan</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Catatan tambahan..." />
            </div>
            <div className="col-span-2 border-t pt-2 mt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Akun Website Klien</p>
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Website</Label>
              <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://namadomain.com/wp-admin" />
            </div>
            <div className="grid gap-1.5">
              <Label>User</Label>
              <Input value={form.siteUser} onChange={e => setForm(f => ({ ...f, siteUser: e.target.value }))} placeholder="Username login..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Password</Label>
              <Input value={form.sitePassword} onChange={e => setForm(f => ({ ...f, sitePassword: e.target.value }))} placeholder="Password login..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Batal</Button>
            <Button onClick={() => addMutation.mutate(form)} disabled={!form.jobCode || !form.orderDate || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Simpan Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Tambah Pelanggan Cepat ── */}
      <Dialog open={addCustomerOpen} onOpenChange={setAddCustomerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan Baru</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nama <span className="text-destructive">*</span></Label>
              <Input value={newCustName} onChange={e => setNewCustName(e.target.value)} placeholder="Nama pelanggan" />
            </div>
            <div className="grid gap-1.5">
              <Label>No WA</Label>
              <Input type="tel" value={newCustWa} onChange={e => setNewCustWa(e.target.value)} placeholder="08xx-xxxx-xxxx" />
            </div>
            <p className="text-xs text-muted-foreground">
              Detail lainnya bisa dilengkapi di{" "}
              <Link href="/pelanggan" className="text-primary underline">halaman Pelanggan</Link>.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCustomerOpen(false)}>Batal</Button>
            <Button onClick={() => addCustomerMutation.mutate()} disabled={!newCustName || addCustomerMutation.isPending}>
              {addCustomerMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Simpan & Pilih
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Edit Order ── */}
      <Dialog open={!!editOrder} onOpenChange={o => { if (!o) setEditOrder(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Edit Order — <span className="font-mono text-primary">{editOrder?.jobCode}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Kode Job <span className="text-destructive">*</span></Label>
              <Input value={editForm.jobCode} onChange={e => setEditForm(f => ({ ...f, jobCode: e.target.value }))} placeholder="JS-001" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tgl Order <span className="text-destructive">*</span></Label>
              <Input type="date" value={editForm.orderDate} onChange={e => setEditForm(f => ({ ...f, orderDate: e.target.value }))} />
            </div>
            {/* Petunjuk Preview di dialog Edit */}
            {(formPetunjukLoading || formPetunjuk) && (
              <div className="col-span-2">
                {formPetunjukLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Mencari petunjuk penulisan...
                  </div>
                ) : formPetunjuk?.exists ? (
                  <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md p-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <Link2 className="h-3 w-3" /> Job ditemukan di Dashboard
                      </span>
                      {formPetunjuk.petunjuk && (
                        <button type="button"
                          onClick={() => setPetunjukDialog({ open: true, jobCode: editForm.jobCode, text: formPetunjuk.petunjuk })}
                          className="text-xs text-emerald-600 hover:underline flex items-center gap-1"
                        >
                          <Eye className="h-3 w-3" /> Lihat lengkap
                        </button>
                      )}
                    </div>
                    {formPetunjuk.petunjuk ? (
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 line-clamp-3 whitespace-pre-line">{formPetunjuk.petunjuk}</p>
                    ) : (
                      <p className="text-xs text-emerald-600 dark:text-emerald-500 italic">Job ditemukan, petunjuk penulisan belum diisi di Dashboard</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
                    <AlertCircle className="h-3 w-3" /> Kode job tidak ditemukan di Dashboard
                  </div>
                )}
              </div>
            )}
            {/* Textarea input petunjuk — muncul jika belum ada petunjuk & kode job sudah diisi */}
            {!formPetunjukLoading && editForm.jobCode.trim() && !formPetunjuk?.petunjuk && (
              <div className="col-span-2 grid gap-1.5">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <Pencil className="h-3.5 w-3.5 text-primary" />
                  {formPetunjuk?.exists
                    ? "Tambahkan Petunjuk Penulisan (akan disimpan ke Dashboard)"
                    : "Petunjuk Penulisan (opsional — disimpan saat job ada di Dashboard)"}
                </Label>
                <textarea
                  rows={4}
                  value={formPetunjukInput}
                  onChange={e => setFormPetunjukInput(e.target.value)}
                  placeholder="Tulis instruksi penulisan lengkap untuk penulis di sini..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[80px]"
                />
                {formPetunjukInput.trim() && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" /> Petunjuk akan otomatis tersimpan ke Dashboard saat order disimpan
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-1.5 col-span-2">
              <Label>Tanggal Deadline</Label>
              <Input type="date" value={editForm.deadlineDate} onChange={e => setEditForm(f => ({ ...f, deadlineDate: e.target.value }))} />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Pelanggan</Label>
              <Select
                value={editForm.customerId || "__none__"}
                onValueChange={v => setEditForm(f => ({ ...f, customerId: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="— Pilih pelanggan —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Tidak ada —</SelectItem>
                  {customers.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}{c.wa ? ` (${c.wa})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Jumlah Artikel</Label>
              <Input type="number" min="1" value={editForm.articleCount} onChange={e => setEditForm(f => ({ ...f, articleCount: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Jumlah Kata</Label>
              <Input type="number" min="0" value={editForm.wordCount} onChange={e => setEditForm(f => ({ ...f, wordCount: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Tool</Label>
              <Input value={editForm.tool} onChange={e => setEditForm(f => ({ ...f, tool: e.target.value }))} placeholder="GPT-4o, Gemini..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Bank Pembayaran</Label>
              <Input value={editForm.paymentBank} onChange={e => setEditForm(f => ({ ...f, paymentBank: e.target.value }))} placeholder="BCA, Mandiri, OVO..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Harga (Rp)</Label>
              <Input type="number" min="0" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label>Bonus Artikel</Label>
              <Input type="number" min="0" value={editForm.bonusArticles} onChange={e => setEditForm(f => ({ ...f, bonusArticles: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Nilai Bonus (Rp)</Label>
              <Input type="number" min="0" value={editForm.bonusValue} onChange={e => setEditForm(f => ({ ...f, bonusValue: e.target.value }))} placeholder="0" />
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Catatan</Label>
              <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Catatan tambahan..." />
            </div>
            <div className="col-span-2 border-t pt-2 mt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Akun Website Klien</p>
            </div>
            <div className="grid gap-1.5 col-span-2">
              <Label>Website</Label>
              <Input value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} placeholder="https://namadomain.com/wp-admin" />
            </div>
            <div className="grid gap-1.5">
              <Label>User</Label>
              <Input value={editForm.siteUser} onChange={e => setEditForm(f => ({ ...f, siteUser: e.target.value }))} placeholder="Username login..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Password</Label>
              <Input value={editForm.sitePassword} onChange={e => setEditForm(f => ({ ...f, sitePassword: e.target.value }))} placeholder="Password login..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Batal</Button>
            <Button
              onClick={() => editOrder && editMutation.mutate({ id: editOrder.id, body: editForm })}
              disabled={!editForm.jobCode || !editForm.orderDate || editMutation.isPending}
            >
              {editMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Konfirmasi Hapus ── */}
      <Dialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus Order?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Order <strong>{orders.find(o => o.id === deleteId)?.jobCode}</strong> akan dihapus permanen.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Petunjuk Lengkap ── */}
      <Dialog open={petunjukDialog.open} onOpenChange={o => {
        if (!o) { setPetunjukDialog(d => ({ ...d, open: false })); setPetunjukDialogEditing(false); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-emerald-500" />
              Petunjuk Penulisan — <span className="font-mono text-primary">{petunjukDialog.jobCode}</span>
            </DialogTitle>
          </DialogHeader>

          {petunjukDialogEditing && (currentUser?.role === "cs" || currentUser?.role === "admin") ? (
            <div className="space-y-2">
              <Textarea
                value={petunjukDialogLocal}
                onChange={e => setPetunjukDialogLocal(e.target.value)}
                rows={10}
                placeholder="Tulis petunjuk penulisan untuk artikel ini..."
                className="resize-none font-mono text-sm leading-relaxed"
                autoFocus
              />
              <p className="text-xs text-amber-600">Perubahan akan berlaku untuk semua job dan order dengan kode <span className="font-mono font-semibold">{petunjukDialog.jobCode}</span>.</p>
            </div>
          ) : (
            <div className="bg-muted/40 rounded-md p-4 max-h-[60vh] overflow-y-auto">
              {petunjukDialog.text ? (
                <p className="text-sm whitespace-pre-line leading-relaxed">{petunjukDialog.text}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">Belum ada petunjuk penulisan.</p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Link2 className="h-3 w-3 text-emerald-500" />
            Tersinkron otomatis ke dashboard job dan semua tempat petunjuk digunakan.
          </p>
          <DialogFooter className="gap-2">
            {(currentUser?.role === "cs" || currentUser?.role === "admin") && !petunjukDialogEditing && (
              <Button variant="outline" size="sm" onClick={() => {
                setPetunjukDialogLocal(petunjukDialog.text ?? "");
                setPetunjukDialogEditing(true);
              }}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit Petunjuk
              </Button>
            )}
            {petunjukDialogEditing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setPetunjukDialogEditing(false)}>Batal</Button>
                <Button size="sm" onClick={handleSavePetunjukDialog} disabled={petunjukDialogSaving}>
                  {petunjukDialogSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                  Simpan
                </Button>
              </>
            )}
            {!petunjukDialogEditing && (
              <Button onClick={() => setPetunjukDialog(d => ({ ...d, open: false }))}>Tutup</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Import Excel ── */}
      <Dialog open={importOpen} onOpenChange={o => { setImportOpen(o); if (!o) setImportFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-4 w-4" /> Import Order dari Excel
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Kolom yang didukung:</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside text-blue-700 dark:text-blue-300">
                <li>Kode Job <span className="text-red-500">*</span></li>
                <li>Tanggal Order (yyyy-MM-dd) <span className="text-red-500">*</span></li>
                <li>Tanggal Deadline (yyyy-MM-dd)</li>
                <li>Nama Pelanggan (harus cocok dengan data pelanggan)</li>
                <li>Jumlah Artikel, Jumlah Kata, Tool, Bank Bayar</li>
                <li>Harga (Rp), Bonus Artikel, Nilai Bonus (Rp), Catatan</li>
                <li>Website, User, Password (opsional — akun website klien)</li>
              </ul>
            </div>
            <div className="grid gap-1.5">
              <Label>File Excel (.xlsx / .xls)</Label>
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                className="cursor-pointer"
              />
            </div>
            <button
              onClick={downloadTemplate}
              className="text-sm text-primary hover:underline flex items-center gap-1 w-fit"
            >
              <FileDown className="h-3.5 w-3.5" /> Download template Excel terlebih dahulu
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportFile(null); }}>Batal</Button>
            <Button
              onClick={() => importFile && importMutation.mutate(importFile)}
              disabled={!importFile || importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Import Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
