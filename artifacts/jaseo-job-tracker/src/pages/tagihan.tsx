import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Plus, Trash2, Loader2, FileText, Printer, Pencil, Save, X, Settings as SettingsIcon, Download, MessageCircle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import logoJaseo from "../assets/logo-jaseo.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const INVOICES_KEY = ["invoices"];
const CUSTOMERS_KEY = ["customers"];
const SETTINGS_KEY = ["invoice-settings"];

type Customer = { id: number; name: string; wa: string | null };
type ArticleOrder = {
  id: number; jobCode: string; customerId: number | null;
  articleCount: number; wordCount: number; price: number;
};
type ItemForm = { description: string; quantity: string; unitPrice: string };
type InvoiceListRow = {
  id: number; invoiceNumber: string; invoiceDate: string; dueDate: string | null;
  customerName: string; status: string; tax: number; paidAmount: number;
  subtotal: number; total: number; remaining: number; itemCount: number;
};
type InvoiceDetail = InvoiceListRow & {
  customerId: number | null; notes: string | null;
  items: { id: number; description: string; quantity: number; unitPrice: number }[];
};
type InvoiceSettings = { companyName: string; paymentNotes: string; footer: string; logoUrl: string };

type InvoiceForm = {
  invoiceNumber: string; invoiceDate: string; dueDate: string;
  customerMode: string; // "manual" | customerId(string)
  customerName: string;
  status: "belum_dibayar" | "lunas" | "sebagian";
  tax: string; paidAmount: string; notes: string;
  items: ItemForm[];
};

const EMPTY_ITEM: ItemForm = { description: "", quantity: "1", unitPrice: "0" };
const emptyForm = (): InvoiceForm => ({
  invoiceNumber: "", invoiceDate: format(new Date(), "yyyy-MM-dd"), dueDate: "",
  customerMode: "manual", customerName: "",
  status: "belum_dibayar", tax: "0", paidAmount: "0", notes: "",
  items: [{ ...EMPTY_ITEM }],
});

const STATUS_LABEL: Record<string, string> = {
  belum_dibayar: "BELUM DIBAYAR",
  lunas: "LUNAS",
  sebagian: "DIBAYAR SEBAGIAN",
};
const STATUS_BADGE: Record<string, string> = {
  belum_dibayar: "bg-rose-500/10 text-rose-600 border-rose-200",
  lunas: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  sebagian: "bg-amber-500/10 text-amber-600 border-amber-200",
};

function fmtRupiah(n: number): string {
  return new Intl.NumberFormat("id-ID").format(n || 0);
}
function parseNum(s: string): number {
  const n = parseInt(String(s).replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}
function fmtTanggal(d: string | null): string {
  if (!d) return "-";
  try { return format(new Date(d + "T00:00:00"), "dd/MM/yyyy", { locale: localeId }); }
  catch { return d; }
}

export default function TagihanPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<InvoiceForm>(emptyForm());
  const [printInvoice, setPrintInvoice] = useState<InvoiceDetail | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState<InvoiceSettings>({ companyName: "", paymentNotes: "", footer: "", logoUrl: "" });
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const canAccess = currentUser?.role === "admin" || currentUser?.role === "cs";

  const { data: invoices = [], isLoading } = useQuery<InvoiceListRow[]>({
    queryKey: INVOICES_KEY,
    enabled: canAccess,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat tagihan");
      return res.json();
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: CUSTOMERS_KEY,
    enabled: canAccess,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/customers`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat pelanggan");
      return res.json();
    },
  });

  const { data: settings } = useQuery<InvoiceSettings>({
    queryKey: SETTINGS_KEY,
    enabled: canAccess,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/invoice-settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat pengaturan");
      return res.json();
    },
  });

  // ─── derived totals untuk form ──────────────────────────────────────────────
  const formSubtotal = useMemo(
    () => form.items.reduce((s, it) => s + parseNum(it.quantity) * parseNum(it.unitPrice), 0),
    [form.items],
  );
  const formTotal = formSubtotal + parseNum(form.tax);
  const formPaid = parseNum(form.paidAmount);
  const formRemaining = formTotal - formPaid;
  // Status diturunkan otomatis dari jumlah yang dibayar agar selalu konsisten.
  const formStatus: InvoiceForm["status"] =
    formTotal > 0 && formPaid >= formTotal ? "lunas" : formPaid > 0 ? "sebagian" : "belum_dibayar";

  // ─── form handlers ──────────────────────────────────────────────────────────
  function setItem(idx: number, patch: Partial<ItemForm>) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { ...EMPTY_ITEM }] }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items }));
  }

  async function openCreate() {
    const f = emptyForm();
    try {
      const res = await fetch(`${BASE}/api/invoices/next-number`, { credentials: "include" });
      if (res.ok) { const d = await res.json(); f.invoiceNumber = d.invoiceNumber; }
    } catch { /* ignore */ }
    setForm(f);
    setEditId(null);
    setFormOpen(true);
  }

  async function openEdit(id: number) {
    const res = await fetch(`${BASE}/api/invoices/${id}`, { credentials: "include" });
    if (!res.ok) { toast({ title: "Gagal memuat tagihan", variant: "destructive" }); return; }
    const d: InvoiceDetail = await res.json();
    setForm({
      invoiceNumber: d.invoiceNumber,
      invoiceDate: d.invoiceDate,
      dueDate: d.dueDate ?? "",
      customerMode: d.customerId != null ? String(d.customerId) : "manual",
      customerName: d.customerName,
      status: (d.status as InvoiceForm["status"]) ?? "belum_dibayar",
      tax: String(d.tax),
      paidAmount: String(d.paidAmount),
      notes: d.notes ?? "",
      items: d.items.length
        ? d.items.map((it) => ({ description: it.description, quantity: String(it.quantity), unitPrice: String(it.unitPrice) }))
        : [{ ...EMPTY_ITEM }],
    });
    setEditId(id);
    setFormOpen(true);
  }

  function onCustomerChange(mode: string) {
    if (mode === "manual") {
      setForm((f) => ({ ...f, customerMode: "manual" }));
    } else {
      const c = customers.find((x) => String(x.id) === mode);
      setForm((f) => ({ ...f, customerMode: mode, customerName: c?.name ?? f.customerName }));
    }
  }

  async function pullFromOrders() {
    if (form.customerMode === "manual") {
      toast({ title: "Pilih pelanggan dulu", description: "Fitur ini mengambil dari order pelanggan terdaftar.", variant: "destructive" });
      return;
    }
    const cid = Number(form.customerMode);
    const res = await fetch(`${BASE}/api/article-orders`, { credentials: "include" });
    if (!res.ok) { toast({ title: "Gagal memuat order", variant: "destructive" }); return; }
    const orders: ArticleOrder[] = await res.json();
    const mine = orders.filter((o) => o.customerId === cid);
    if (!mine.length) { toast({ title: "Tidak ada order", description: "Pelanggan ini belum punya order artikel." }); return; }
    const newItems: ItemForm[] = mine.map((o) => ({
      description: `Artikel ${o.jobCode} (${o.articleCount} artikel @ ${o.wordCount} kata)`,
      quantity: String(o.articleCount || 1),
      unitPrice: String(o.articleCount > 0 ? Math.round(o.price / o.articleCount) : o.price),
    }));
    setForm((f) => {
      const base = f.items.length === 1 && !f.items[0].description ? [] : f.items;
      return { ...f, items: [...base, ...newItems] };
    });
    toast({ title: `${newItems.length} baris ditambahkan dari order` });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        invoiceNumber: form.invoiceNumber.trim(),
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || null,
        customerId: form.customerMode === "manual" ? null : Number(form.customerMode),
        customerName: form.customerName.trim(),
        status: formStatus,
        tax: parseNum(form.tax),
        paidAmount: parseNum(form.paidAmount),
        notes: form.notes.trim() || null,
        items: form.items
          .filter((it) => it.description.trim())
          .map((it) => ({ description: it.description.trim(), quantity: parseNum(it.quantity), unitPrice: parseNum(it.unitPrice) })),
      };
      if (!body.customerName) throw new Error("Nama pelanggan wajib diisi");
      if (!body.items.length) throw new Error("Minimal satu baris tagihan");
      const url = editId ? `${BASE}/api/invoices/${editId}` : `${BASE}/api/invoices`;
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Gagal menyimpan"); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      setFormOpen(false);
      toast({ title: editId ? "Tagihan diperbarui" : "Tagihan dibuat" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/invoices/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Gagal menghapus");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: INVOICES_KEY });
      setDeleteId(null);
      toast({ title: "Tagihan dihapus" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/invoice-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(settingsForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Gagal menyimpan pengaturan");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
      setSettingsOpen(false);
      toast({ title: "Pengaturan disimpan" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // Baca file gambar logo, kecilkan agar hemat (maks 500px), simpan sebagai data URL
  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "File harus berupa gambar (PNG/JPG)", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 500;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/png");
        if (dataUrl.length > 1_500_000) {
          toast({ title: "Ukuran logo terlalu besar, coba gambar yang lebih kecil", variant: "destructive" });
          return;
        }
        setSettingsForm((s) => ({ ...s, logoUrl: dataUrl }));
      };
      img.onerror = () => toast({ title: "Gagal membaca gambar", variant: "destructive" });
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function openPrint(id: number) {
    const res = await fetch(`${BASE}/api/invoices/${id}`, { credentials: "include" });
    if (!res.ok) { toast({ title: "Gagal memuat tagihan", variant: "destructive" }); return; }
    setPrintInvoice(await res.json());
  }

  function openSettings() {
    if (settings) setSettingsForm(settings);
    setSettingsOpen(true);
  }

  useEffect(() => {
    if (settings && !settingsForm.companyName) setSettingsForm(settings);
  }, [settings]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canAccess) {
    return <div className="p-6 text-center text-muted-foreground">Halaman ini hanya untuk Admin & CS.</div>;
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> Tagihan</h1>
          <p className="text-sm text-muted-foreground">Buat & kelola invoice tagihan artikel.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openSettings}><SettingsIcon className="h-4 w-4 mr-1" /> Pengaturan</Button>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Buat Tagihan</Button>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>No. Tagihan</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Pelanggan</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Sisa</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>
            ) : invoices.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Belum ada tagihan.</TableCell></TableRow>
            ) : (
              invoices.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono font-medium">#{inv.invoiceNumber}</TableCell>
                  <TableCell>{fmtTanggal(inv.invoiceDate)}</TableCell>
                  <TableCell>{inv.customerName}</TableCell>
                  <TableCell className="text-right font-medium">{fmtRupiah(inv.total)}</TableCell>
                  <TableCell className="text-right">{fmtRupiah(inv.remaining)}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_BADGE[inv.status]}>{STATUS_LABEL[inv.status]}</Badge></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" title="Cetak / PDF" onClick={() => openPrint(inv.id)}><Printer className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(inv.id)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Hapus" onClick={() => setDeleteId(inv.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* ─── Form Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Edit Tagihan" : "Buat Tagihan Baru"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>No. Tagihan</Label>
                <Input value={form.invoiceNumber} onChange={(e) => setForm((f) => ({ ...f, invoiceNumber: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <div className="h-9 flex items-center">
                  <Badge variant="outline" className={STATUS_BADGE[formStatus]}>{STATUS_LABEL[formStatus]}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">otomatis dari jumlah dibayar</span>
                </div>
              </div>
              <div>
                <Label>Tanggal</Label>
                <Input type="date" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} />
              </div>
              <div>
                <Label>Batas Akhir Bayar</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <Label>Pelanggan</Label>
                <Select value={form.customerMode} onValueChange={onCustomerChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">— Ketik manual —</SelectItem>
                    {customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nama Pelanggan (tampil di tagihan)</Label>
                <Input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Nama pelanggan" />
              </div>
            </div>

            {/* Baris tagihan */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Baris Tagihan</Label>
                <div className="flex gap-2">
                  {form.customerMode !== "manual" && (
                    <Button type="button" variant="outline" size="sm" onClick={pullFromOrders}><Download className="h-4 w-4 mr-1" /> Ambil dari Order</Button>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 mr-1" /> Baris</Button>
                </div>
              </div>
              <div className="space-y-2">
                {form.items.map((it, idx) => {
                  const jumlah = parseNum(it.quantity) * parseNum(it.unitPrice);
                  return (
                    <div key={idx} className="flex flex-wrap items-end gap-2 border rounded-md p-2">
                      <div className="flex-1 min-w-[180px]">
                        <Label className="text-xs">Jenis Tagihan</Label>
                        <Input value={it.description} onChange={(e) => setItem(idx, { description: e.target.value })} placeholder="Keterangan" />
                      </div>
                      <div className="w-20">
                        <Label className="text-xs">Banyaknya</Label>
                        <Input value={it.quantity} onChange={(e) => setItem(idx, { quantity: e.target.value })} inputMode="numeric" />
                      </div>
                      <div className="w-32">
                        <Label className="text-xs">Harga</Label>
                        <Input value={it.unitPrice} onChange={(e) => setItem(idx, { unitPrice: e.target.value })} inputMode="numeric" />
                      </div>
                      <div className="w-32 text-right">
                        <Label className="text-xs">Jumlah</Label>
                        <div className="h-9 flex items-center justify-end font-medium">{fmtRupiah(jumlah)}</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ringkasan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div>
                  <Label>Pajak (manual)</Label>
                  <Input value={form.tax} onChange={(e) => setForm((f) => ({ ...f, tax: e.target.value }))} inputMode="numeric" />
                </div>
                <div>
                  <Label>Sudah Dibayar</Label>
                  <Input value={form.paidAmount} onChange={(e) => setForm((f) => ({ ...f, paidAmount: e.target.value }))} inputMode="numeric" />
                </div>
                <div>
                  <Label>Catatan</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
                </div>
              </div>
              <div className="rounded-md border p-3 space-y-1 text-sm self-start">
                <div className="flex justify-between"><span>Subtotal</span><span>{fmtRupiah(formSubtotal)}</span></div>
                <div className="flex justify-between"><span>Pajak</span><span>{fmtRupiah(parseNum(form.tax))}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{fmtRupiah(formTotal)}</span></div>
                <div className="flex justify-between"><span>Sudah Dibayar</span><span>{fmtRupiah(parseNum(form.paidAmount))}</span></div>
                <div className="flex justify-between font-semibold text-rose-600"><span>Sisa Tagihan</span><span>{fmtRupiah(formRemaining)}</span></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Settings Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Pengaturan Tagihan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Logo Tagihan</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="h-16 w-28 border rounded-md bg-white flex items-center justify-center overflow-hidden shrink-0">
                  <img src={settingsForm.logoUrl || logoJaseo} alt="Logo" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Input type="file" accept="image/*" onChange={handleLogoFile} className="text-xs" />
                  {settingsForm.logoUrl ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => setSettingsForm((s) => ({ ...s, logoUrl: "" }))}>
                      <X className="h-3.5 w-3.5 mr-1" /> Kembalikan Logo Default
                    </Button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Memakai logo default. Unggah gambar untuk mengganti.</p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <Label>Nama Perusahaan</Label>
              <Input value={settingsForm.companyName} onChange={(e) => setSettingsForm((s) => ({ ...s, companyName: e.target.value }))} />
            </div>
            <div>
              <Label>Catatan Pembayaran (rekening)</Label>
              <Textarea value={settingsForm.paymentNotes} onChange={(e) => setSettingsForm((s) => ({ ...s, paymentNotes: e.target.value }))} rows={7} />
            </div>
            <div>
              <Label>Teks Penutup</Label>
              <Textarea value={settingsForm.footer} onChange={(e) => setSettingsForm((s) => ({ ...s, footer: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Batal</Button>
            <Button onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
              {saveSettingsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete confirm ──────────────────────────────────────────────────── */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus Tagihan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Tagihan ini akan dihapus permanen.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />} Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Print overlay ───────────────────────────────────────────────────── */}
      {printInvoice && settings && (
        <InvoicePrint
          invoice={printInvoice}
          settings={settings}
          customerWa={customers.find((c) => c.id === printInvoice.customerId)?.wa ?? null}
          onClose={() => setPrintInvoice(null)}
        />
      )}
    </div>
  );
}

// ─── Print view (layout mengikuti contoh PDF) ─────────────────────────────────
const OFFICE_ADDRESS = "Krinjing RT 06, Mertelu, Gedangsari, Gunungkidul, Yogyakarta";

function normalizeWa(wa: string | null): string {
  if (!wa) return "";
  let d = wa.replace(/\D/g, "");
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

function InvoicePrint({ invoice, settings, customerWa, onClose }: { invoice: InvoiceDetail; settings: InvoiceSettings; customerWa: string | null; onClose: () => void }) {
  function shareWa() {
    const lines: string[] = [
      `*TAGIHAN ${settings.companyName}*`,
      `No: #${invoice.invoiceNumber}`,
      `Kepada: ${invoice.customerName}`,
      `Tanggal: ${fmtTanggal(invoice.invoiceDate)}`,
      ...(invoice.dueDate ? [`Batas akhir bayar: ${fmtTanggal(invoice.dueDate)}`] : []),
      "",
      ...invoice.items.map((it, i) => `${i + 1}. ${it.description} — ${it.quantity} x ${fmtRupiah(it.unitPrice)} = ${fmtRupiah(it.quantity * it.unitPrice)}`),
      "",
      `Total: ${fmtRupiah(invoice.total)}`,
      `Pajak: ${fmtRupiah(invoice.tax)}`,
      `Sudah dibayar: ${fmtRupiah(invoice.paidAmount)}`,
      `*Sisa tagihan: ${fmtRupiah(invoice.remaining)}*`,
      "",
      settings.paymentNotes,
      "",
      settings.footer,
    ];
    const text = encodeURIComponent(lines.join("\n"));
    const phone = normalizeWa(customerWa);
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto print:bg-white print:static print:inset-auto">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print, #invoice-print * { visibility: visible !important; }
          #invoice-print { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
      <div className="max-w-3xl mx-auto my-6 print:my-0">
        <div className="no-print flex justify-end gap-2 mb-2">
          <Button variant="secondary" size="sm" onClick={onClose}><X className="h-4 w-4 mr-1" /> Tutup</Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={shareWa}><MessageCircle className="h-4 w-4 mr-1" /> Share ke WA</Button>
          <Button size="sm" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Cetak / Simpan PDF</Button>
        </div>
        <div id="invoice-print" className="bg-white text-black p-8 shadow-lg text-[13px] leading-relaxed">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold text-base">{settings.companyName}</div>
              <img src={settings.logoUrl || logoJaseo} alt={settings.companyName} className="h-20 w-auto object-contain mt-2" />
              <div className="text-[11px] text-gray-700 mt-1 max-w-[220px] leading-snug">{OFFICE_ADDRESS}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tracking-wide">TAGIHAN</div>
              <div className="font-mono">NO : #{invoice.invoiceNumber}</div>
            </div>
          </div>

          {/* Meta */}
          <div className="flex justify-end mt-4">
            <table className="text-[12px]">
              <tbody>
                <tr><td className="pr-3 font-semibold">TANGGAL</td><td>: {fmtTanggal(invoice.invoiceDate)}</td></tr>
                <tr><td className="pr-3 font-semibold">KETERANGAN</td><td>: {STATUS_LABEL[invoice.status]}</td></tr>
                <tr><td className="pr-3 font-semibold">BATAS AKHIR BAYAR</td><td>: {fmtTanggal(invoice.dueDate)}</td></tr>
                <tr><td className="pr-3 font-semibold">TAGIHAN HARUS DIBAYAR</td><td className="text-right font-bold">: {fmtRupiah(invoice.total)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Billed to */}
          <div className="mt-4">
            <div className="font-semibold">TAGIHAN KEPADA :</div>
            <div>{invoice.customerName}</div>
          </div>

          {/* Items table */}
          <table className="w-full mt-4 border-collapse text-[12px]">
            <thead>
              <tr className="border-y-2 border-black">
                <th className="text-left py-1 w-8">NO</th>
                <th className="text-left py-1">JENIS TAGIHAN</th>
                <th className="text-right py-1 w-20">BANYAKNYA</th>
                <th className="text-right py-1 w-28">HARGA</th>
                <th className="text-right py-1 w-28">JUMLAH</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={it.id} className="border-b border-gray-300">
                  <td className="py-1 align-top">{i + 1}</td>
                  <td className="py-1 align-top">{it.description}</td>
                  <td className="py-1 text-right align-top">{it.quantity}</td>
                  <td className="py-1 text-right align-top">{fmtRupiah(it.unitPrice)}</td>
                  <td className="py-1 text-right align-top">{fmtRupiah(it.quantity * it.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mt-2">
            <table className="text-[12px]">
              <tbody>
                <tr><td className="pr-6 py-0.5">TOTAL</td><td className="text-right font-semibold">{fmtRupiah(invoice.subtotal)}</td></tr>
                <tr><td className="pr-6 py-0.5">PAJAK</td><td className="text-right">{fmtRupiah(invoice.tax)}</td></tr>
                <tr><td className="pr-6 py-0.5">SUDAH DIBAYAR</td><td className="text-right">{fmtRupiah(invoice.paidAmount)}</td></tr>
                <tr className="border-t border-black"><td className="pr-6 py-0.5 font-bold">SISA TAGIHAN</td><td className="text-right font-bold">{fmtRupiah(invoice.remaining)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Payment notes */}
          <div className="mt-6 border border-gray-400 rounded p-3 text-[11px] whitespace-pre-line">
            <div className="font-semibold mb-1">CATATAN PEMBAYARAN :</div>
            {settings.paymentNotes}
          </div>

          {/* Footer */}
          <div className="mt-4 text-[11px] whitespace-pre-line">{settings.footer}</div>

          {invoice.notes && <div className="mt-3 text-[11px] italic">Catatan: {invoice.notes}</div>}
        </div>
      </div>
    </div>
  );
}
