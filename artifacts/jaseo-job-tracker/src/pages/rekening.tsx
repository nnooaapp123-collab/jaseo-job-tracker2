import { useState, useCallback, useEffect } from "react";
import {
  Landmark, Plus, Pencil, Trash2, Loader2, ChevronRight,
  ArrowDownLeft, ArrowUpRight, X, TrendingUp, Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const fmt = (n: number) => {
  const abs = Math.abs(n);
  return (n < 0 ? "-" : "") + `Rp ${abs.toLocaleString("id-ID")}`;
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface BankAccount {
  id: number;
  name: string;
  accountNumber: string | null;
  initialBalance: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  balance: number;
  orderIncome: number;
  manualIn: number;
  manualOut: number;
}

interface LedgerEntry {
  id: string;
  _id: number;
  type: "in" | "out";
  amount: number;
  description: string;
  date: string;
  source: "order" | "manual";
  runningBalance: number;
}

// ─── Bank Account Form Dialog ─────────────────────────────────────────────────
function AccountFormDialog({
  open, onClose, initial, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: BankAccount | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", accountNumber: "", initialBalance: "", notes: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        accountNumber: initial.accountNumber ?? "",
        initialBalance: String(initial.initialBalance),
        notes: initial.notes ?? "",
      });
    } else {
      setForm({ name: "", accountNumber: "", initialBalance: "0", notes: "" });
    }
  }, [initial, open]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Nama bank harus diisi", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const isEdit = !!initial;
      const url = isEdit ? `${BASE}/api/bank-accounts/${initial!.id}` : `${BASE}/api/bank-accounts`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          accountNumber: form.accountNumber.trim() || null,
          initialBalance: parseInt(form.initialBalance || "0"),
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "Gagal menyimpan", variant: "destructive" }); return; }
      toast({ title: isEdit ? "Rekening diperbarui" : "Rekening ditambahkan" });
      onClose(); onSaved();
    } catch {
      toast({ title: "Gagal terhubung ke server", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Rekening" : "Tambah Rekening"}</DialogTitle>
          <DialogDescription>
            Nama bank digunakan untuk mencocokkan pembayaran dari order secara otomatis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label>Nama Bank <span className="text-destructive">*</span></Label>
            <Input
              placeholder='Contoh: BCA, Mandiri, BRI...'
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Order dengan kolom "Bank Bayar" yang mengandung nama ini akan otomatis terhitung.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Nomor Rekening <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Input
              placeholder="Contoh: 1234567890"
              value={form.accountNumber}
              onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Saldo Awal (Rp)</Label>
            <Input
              type="text" inputMode="numeric"
              placeholder="0"
              value={form.initialBalance}
              onChange={e => setForm(f => ({ ...f, initialBalance: e.target.value.replace(/\D/g, "") }))}
            />
            {form.initialBalance && Number(form.initialBalance) > 0 && (
              <p className="text-xs text-muted-foreground">{fmt(Number(form.initialBalance))}</p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label>Keterangan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Textarea
              placeholder="Catatan tambahan..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {initial ? "Perbarui" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual Entry Form Dialog (tambah & edit) ────────────────────────────────
function EntryFormDialog({
  open, onClose, accountId, accountName, onSaved, editingEntry,
}: {
  open: boolean;
  onClose: () => void;
  accountId: number;
  accountName: string;
  onSaved: () => void;
  editingEntry?: LedgerEntry | null;
}) {
  const { toast } = useToast();
  const isEdit = !!editingEntry;
  const [form, setForm] = useState({
    type: "in" as "in" | "out",
    amount: "",
    description: "",
    entryDate: new Date().toLocaleDateString("sv"),
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingEntry) {
        setForm({
          type: editingEntry.type,
          amount: String(editingEntry.amount),
          description: editingEntry.description ?? "",
          entryDate: editingEntry.date,
        });
      } else {
        setForm({ type: "in", amount: "", description: "", entryDate: new Date().toLocaleDateString("sv") });
      }
    }
  }, [open, editingEntry]);

  const handleSubmit = async () => {
    const amount = parseInt(form.amount.replace(/\D/g, ""));
    if (!amount || amount <= 0) { toast({ title: "Jumlah harus diisi", variant: "destructive" }); return; }
    if (!form.entryDate) { toast({ title: "Tanggal harus diisi", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const url = isEdit
        ? `${BASE}/api/bank-accounts/${accountId}/entries/${editingEntry!._id}`
        : `${BASE}/api/bank-accounts/${accountId}/entries`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: form.type, amount, description: form.description.trim() || null, entryDate: form.entryDate }),
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "Gagal menyimpan", variant: "destructive" }); return; }
      toast({ title: isEdit ? "Transaksi diperbarui" : `Transaksi ${form.type === "in" ? "masuk" : "keluar"} dicatat` });
      onClose(); onSaved();
    } catch {
      toast({ title: "Gagal terhubung", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaksi" : "Tambah Transaksi Manual"}</DialogTitle>
          <DialogDescription>Rekening: <span className="font-medium">{accountName}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label>Jenis Transaksi</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as "in" | "out" }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="h-4 w-4 text-emerald-600" />Uang Masuk
                  </div>
                </SelectItem>
                <SelectItem value="out">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-red-500" />Uang Keluar
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Jumlah (Rp)</Label>
            <Input
              type="text" inputMode="numeric"
              placeholder="Contoh: 500000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value.replace(/\D/g, "") }))}
            />
            {form.amount && <p className="text-xs text-muted-foreground">{fmt(Number(form.amount))}</p>}
          </div>
          <div className="grid gap-1.5">
            <Label>Tanggal</Label>
            <Input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} />
          </div>
          <div className="grid gap-1.5">
            <Label>Keterangan <span className="text-muted-foreground text-xs">(opsional)</span></Label>
            <Textarea
              placeholder="Misal: Transfer ke vendor, Tarik tunai..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Batal</Button>
          <Button
            onClick={handleSubmit} disabled={loading || !form.amount}
            className={!isEdit && form.type === "out" ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Perbarui" : form.type === "in" ? "Catat Masuk" : "Catat Keluar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Ledger Panel ─────────────────────────────────────────────────────────────
function LedgerPanel({
  account, onClose, onEntryAdded,
}: {
  account: BankAccount;
  onClose: () => void;
  onEntryAdded: () => void;
}) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadLedger = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      const res = await fetch(`${BASE}/api/bank-accounts/${account.id}/ledger?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [account.id, filterFrom, filterTo]);

  useEffect(() => { loadLedger(); }, [loadLedger]);

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    if (!confirm(`Hapus transaksi "${entry.description || "ini"}"?`)) return;
    setDeletingId(entry._id);
    try {
      const res = await fetch(`${BASE}/api/bank-accounts/${account.id}/entries/${entry._id}`, {
        method: "DELETE", credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Transaksi dihapus" });
        loadLedger();
        onEntryAdded();
      } else {
        const d = await res.json();
        toast({ title: d.error ?? "Gagal hapus", variant: "destructive" });
      }
    } catch { toast({ title: "Gagal terhubung", variant: "destructive" }); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="space-y-4">
      {/* Header ledger */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            {account.name}
          </h2>
          {account.accountNumber && (
            <p className="text-sm text-muted-foreground">{account.accountNumber}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>

      {/* Ringkasan saldo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Saldo",          value: account.balance,        color: account.balance >= 0 ? "text-emerald-600" : "text-red-600" },
          { label: "Saldo Awal",     value: account.initialBalance, color: "text-muted-foreground" },
          { label: "Total Masuk",    value: account.orderIncome + account.manualIn, color: "text-emerald-600" },
          { label: "Total Keluar",   value: account.manualOut,      color: "text-red-500" },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={cn("text-sm font-bold", s.color)}>{fmt(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Sub-rincian masuk */}
      <div className="flex gap-2 text-xs text-muted-foreground flex-wrap">
        <span>Dari order: <span className="font-medium text-emerald-600">{fmt(account.orderIncome)}</span></span>
        <span>·</span>
        <span>Masuk manual: <span className="font-medium text-emerald-600">{fmt(account.manualIn)}</span></span>
      </div>

      {/* Filter + tombol tambah */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Dari tanggal</p>
            <Input type="date" className="h-8 text-sm" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sampai tanggal</p>
            <Input type="date" className="h-8 text-sm" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(filterFrom || filterTo) && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setFilterFrom(""); setFilterTo(""); }}>
              <X className="h-3 w-3" />Reset Filter
            </Button>
          )}
          <Button size="sm" className="ml-auto gap-1.5" onClick={() => { setEditingEntry(null); setEntryFormOpen(true); }}>
            <Plus className="h-4 w-4" />Tambah Transaksi
          </Button>
        </div>
      </div>

      {/* Tabel mutasi */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <p className="text-center text-muted-foreground py-10 text-sm">Belum ada mutasi untuk filter ini.</p>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/40 border border-transparent hover:border-border/50">
              {/* Icon */}
              <div className={cn(
                "shrink-0 p-1.5 rounded-full",
                entry.type === "in" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30",
              )}>
                {entry.type === "in"
                  ? <ArrowDownLeft className="h-3.5 w-3.5 text-emerald-600" />
                  : <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {/* Baris 1: deskripsi penuh — tidak ada elemen lain di baris ini */}
                <p className="text-sm font-medium leading-snug break-words">
                  {entry.description || (entry.type === "in" ? "Uang Masuk" : "Uang Keluar")}
                </p>
                {/* Baris 2: tanggal · badge · nominal (kanan) */}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <Badge variant="outline" className={cn("text-xs px-1.5 py-0 shrink-0",
                    entry.source === "order" ? "border-blue-400 text-blue-600" : "border-slate-400 text-slate-600")}>
                    {entry.source === "order" ? "order" : "manual"}
                  </Badge>
                  <span className={cn("ml-auto text-xs font-semibold whitespace-nowrap", entry.type === "in" ? "text-emerald-600" : "text-red-500")}>
                    {entry.type === "in" ? "+" : "-"}{fmt(entry.amount)}
                  </span>
                </div>
                {/* Baris 3: saldo berjalan */}
                <div className="text-xs text-muted-foreground mt-0.5">
                  Saldo: <span className={cn("font-medium", entry.runningBalance >= 0 ? "text-foreground" : "text-red-500")}>
                    {fmt(entry.runningBalance)}
                  </span>
                </div>
              </div>

              {/* Edit & Hapus (manual only) */}
              {entry.source === "manual" && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => { setEditingEntry(entry); setEntryFormOpen(true); }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === entry._id}
                    onClick={() => handleDeleteEntry(entry)}
                  >
                    {deletingId === entry._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <EntryFormDialog
        open={entryFormOpen}
        onClose={() => { setEntryFormOpen(false); setEditingEntry(null); }}
        accountId={account.id}
        accountName={account.name}
        onSaved={() => { loadLedger(); onEntryAdded(); }}
        editingEntry={editingEntry}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function RekeningPage() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [selected, setSelected] = useState<BankAccount | null>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/bank-accounts`, { credentials: "include" });
      if (res.ok) setAccounts(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Refresh selected account data after mutation
  const refreshSelected = useCallback(async () => {
    await loadAccounts();
    if (selected) {
      // Akan diupdate saat setAccounts di-call — sync lewat effect
    }
  }, [loadAccounts, selected]);

  // Keep selected in sync with refreshed list
  useEffect(() => {
    if (selected) {
      const updated = accounts.find(a => a.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [accounts]);

  const handleDelete = async (acc: BankAccount) => {
    if (!confirm(`Hapus rekening "${acc.name}"? Semua entri manual terkait juga akan dihapus.`)) return;
    try {
      const res = await fetch(`${BASE}/api/bank-accounts/${acc.id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast({ title: `Rekening ${acc.name} dihapus` });
        if (selected?.id === acc.id) setSelected(null);
        loadAccounts();
      } else {
        const d = await res.json();
        toast({ title: d.error ?? "Gagal menghapus", variant: "destructive" });
      }
    } catch { toast({ title: "Gagal terhubung", variant: "destructive" }); }
  };

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalIn = accounts.reduce((s, a) => s + a.orderIncome + a.manualIn, 0);
  const totalOut = accounts.reduce((s, a) => s + a.manualOut, 0);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rekening Bank</h1>
          <p className="text-sm text-muted-foreground">Saldo dan mutasi per rekening perusahaan</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" />Tambah Rekening
        </Button>
      </div>

      {/* ── Total ringkasan ── */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Saldo Semua Rekening", value: totalBalance, icon: Wallet,      color: totalBalance >= 0 ? "text-emerald-600" : "text-red-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
            { label: "Total Masuk",                value: totalIn,      icon: ArrowDownLeft, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
            { label: "Total Keluar",               value: totalOut,     icon: ArrowUpRight,  color: "text-red-500",    bg: "bg-red-100 dark:bg-red-900/30" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className={cn("text-2xl font-bold mt-1", s.color)}>{fmt(s.value)}</p>
                  </div>
                  <div className={cn("p-2 rounded-lg", s.bg)}>
                    <s.icon className={cn("h-5 w-5", s.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Two-panel layout (list + ledger) ── */}
      <div className={cn("grid gap-4", selected ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1")}>

        {/* Daftar rekening */}
        <div className={cn("space-y-3", selected ? "lg:col-span-2" : "")}>
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center space-y-3">
                <Landmark className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-muted-foreground">Belum ada rekening.</p>
                <p className="text-sm text-muted-foreground">Tambah rekening bank perusahaan untuk mulai melacak saldo.</p>
                <Button size="sm" className="gap-1.5 mt-2" onClick={() => { setEditing(null); setFormOpen(true); }}>
                  <Plus className="h-4 w-4" />Tambah Rekening
                </Button>
              </CardContent>
            </Card>
          ) : (
            accounts.slice().sort((a, b) => a.name.localeCompare(b.name, "id")).map(acc => (
              <Card
                key={acc.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  selected?.id === acc.id ? "ring-2 ring-primary" : "",
                )}
                onClick={() => setSelected(s => s?.id === acc.id ? null : acc)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Landmark className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold truncate">{acc.name}</span>
                      </div>
                      {acc.accountNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5 ml-6">{acc.accountNumber}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={e => { e.stopPropagation(); setEditing(acc); setFormOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={e => { e.stopPropagation(); handleDelete(acc); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Saldo</p>
                      <p className={cn("text-sm font-bold", acc.balance >= 0 ? "text-emerald-600" : "text-red-500")}>
                        {fmt(acc.balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Masuk</p>
                      <p className="text-sm font-medium text-emerald-600">{fmt(acc.orderIncome + acc.manualIn)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Keluar</p>
                      <p className="text-sm font-medium text-red-500">{fmt(acc.manualOut)}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {acc.orderIncome > 0
                        ? `${fmt(acc.orderIncome)} dari order · ${fmt(acc.manualIn)} manual`
                        : acc.manualIn > 0 ? `${fmt(acc.manualIn)} masuk manual` : "Belum ada pemasukan"}
                    </p>
                    <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", selected?.id === acc.id ? "rotate-90" : "")} />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Panel ledger */}
        {selected && (
          <Card className="lg:col-span-3">
            <CardContent className="p-4">
              <LedgerPanel
                account={selected}
                onClose={() => setSelected(null)}
                onEntryAdded={refreshSelected}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <AccountFormDialog
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        initial={editing}
        onSaved={loadAccounts}
      />
    </div>
  );
}
