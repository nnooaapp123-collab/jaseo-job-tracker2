import { useState } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Plus, Trash2, Loader2, Pencil, Check, X, Search, Users, FileUp, FileDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";

type Customer = {
  id: number;
  name: string;
  wa: string | null;
  email: string | null;
  firstOrderDate: string | null;
  notes: string | null;
  createdAt: string;
};

type CustomerForm = {
  name: string; wa: string; email: string; firstOrderDate: string; notes: string;
};

const EMPTY_FORM: CustomerForm = { name: "", wa: "", email: "", firstOrderDate: "", notes: "" };

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CUSTOMERS_KEY = ["customers"];

// ─── InlineCell: edit on click ───────────────────────────────────────────────
function InlineCell({
  value, onSave, disabled, placeholder, type = "text", className,
}: {
  value: string; onSave: (v: string) => void; disabled?: boolean;
  placeholder?: string; type?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  if (!editing) {
    return (
      <button
        disabled={disabled}
        onClick={() => { setLocal(value); setEditing(true); }}
        className={`text-left w-full min-w-[80px] px-1 py-0.5 rounded hover:bg-muted/60 transition-colors text-sm ${!value ? "text-muted-foreground italic" : ""} ${className ?? ""}`}
      >
        {value || placeholder || "—"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        autoFocus
        type={type}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(local); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 text-sm px-1.5 min-w-[80px]"
      />
      <button onClick={() => { onSave(local); setEditing(false); }}
        className="text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /></button>
      <button onClick={() => setEditing(false)}
        className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function PelangganPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const isAdminOrCS = currentUser?.role === "admin" || currentUser?.role === "cs";

  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: CUSTOMERS_KEY,
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/customers`, { credentials: "include" });
      if (!res.ok) throw new Error("Gagal memuat data pelanggan");
      return res.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (body: CustomerForm) => {
      const res = await fetch(`${BASE}/api/customers`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal menambah pelanggan");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      setIsAddOpen(false);
      setForm(EMPTY_FORM);
      toast({ title: "Pelanggan ditambahkan" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const patchField = async (id: number, field: Partial<CustomerForm>) => {
    const customer = customers.find(c => c.id === id);
    if (!customer) return;
    const res = await fetch(`${BASE}/api/customers/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...customer, ...field }),
    });
    if (!res.ok) { toast({ title: "Gagal menyimpan", variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/customers/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Gagal menghapus");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      setDeleteId(null);
      toast({ title: "Pelanggan dihapus" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BASE}/api/customers/import`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gagal import");
      return res.json() as Promise<{ inserted: number; skipped: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      setImportOpen(false);
      setImportFile(null);
      toast({
        title: `Import selesai — ${data.inserted} pelanggan berhasil`,
        description: data.skipped > 0 ? `${data.skipped} baris dilewati (nama kosong)` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Gagal Import", description: e.message, variant: "destructive" }),
  });

  const downloadTemplate = () => {
    window.open(`${BASE}/api/customers/template`, "_blank");
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.wa ?? "").includes(search) ||
    (c.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Users className="h-5 w-5 text-primary shrink-0" />
          <h2 className="text-xl font-serif font-semibold truncate">Data Pelanggan</h2>
          <span className="text-sm text-muted-foreground ml-1">({customers.length})</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari nama, WA, email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-52"
            />
          </div>
          {isAdminOrCS && (
            <>
              <Button size="sm" variant="outline" onClick={downloadTemplate} title="Download template Excel">
                <FileDown className="h-4 w-4 mr-1" /> Template
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} title="Import dari Excel">
                <FileUp className="h-4 w-4 mr-1" /> Import Excel
              </Button>
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Pelanggan
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center font-semibold">No</TableHead>
                <TableHead className="min-w-[160px] font-semibold">Nama</TableHead>
                <TableHead className="min-w-[140px] font-semibold">No WA</TableHead>
                <TableHead className="min-w-[180px] font-semibold">Email</TableHead>
                <TableHead className="min-w-[140px] font-semibold">Tgl Pertama Order</TableHead>
                <TableHead className="min-w-[200px] font-semibold">Notes</TableHead>
                {isAdminOrCS && <TableHead className="w-12 text-center font-semibold">Hapus</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {search ? "Tidak ada pelanggan yang cocok" : "Belum ada data pelanggan"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c, idx) => (
                  <TableRow key={c.id} className="hover:bg-muted/30">
                    <TableCell className="text-center text-sm text-muted-foreground font-mono">{idx + 1}</TableCell>
                    <TableCell>
                      <InlineCell
                        value={c.name}
                        onSave={v => patchField(c.id, { name: v })}
                        disabled={!isAdminOrCS}
                        placeholder="Nama pelanggan"
                        className="font-medium"
                      />
                    </TableCell>
                    <TableCell>
                      <InlineCell
                        value={c.wa ?? ""}
                        onSave={v => patchField(c.id, { wa: v })}
                        disabled={!isAdminOrCS}
                        placeholder="08xx-xxxx-xxxx"
                        type="tel"
                      />
                    </TableCell>
                    <TableCell>
                      <InlineCell
                        value={c.email ?? ""}
                        onSave={v => patchField(c.id, { email: v })}
                        disabled={!isAdminOrCS}
                        placeholder="email@domain.com"
                        type="email"
                      />
                    </TableCell>
                    <TableCell>
                      <InlineCell
                        value={c.firstOrderDate ?? ""}
                        onSave={v => patchField(c.id, { firstOrderDate: v })}
                        disabled={!isAdminOrCS}
                        placeholder="yyyy-MM-dd"
                        type="date"
                      />
                    </TableCell>
                    <TableCell>
                      <InlineCell
                        value={c.notes ?? ""}
                        onSave={v => patchField(c.id, { notes: v })}
                        disabled={!isAdminOrCS}
                        placeholder="Catatan..."
                      />
                    </TableCell>
                    {isAdminOrCS && (
                      <TableCell className="text-center">
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Dialog Tambah */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Pelanggan Baru</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nama <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nama lengkap pelanggan" />
            </div>
            <div className="grid gap-1.5">
              <Label>No WhatsApp</Label>
              <Input type="tel" value={form.wa} onChange={e => setForm(f => ({ ...f, wa: e.target.value }))} placeholder="08xx-xxxx-xxxx" />
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@domain.com" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tanggal Pertama Order</Label>
              <Input type="date" value={form.firstOrderDate} onChange={e => setForm(f => ({ ...f, firstOrderDate: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Catatan tambahan..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Batal</Button>
            <Button onClick={() => addMutation.mutate(form)} disabled={!form.name || addMutation.isPending}>
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Konfirmasi Hapus */}
      <Dialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Pelanggan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Data pelanggan{" "}
            <strong>{customers.find(c => c.id === deleteId)?.name}</strong>{" "}
            akan dihapus permanen.
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

      {/* Dialog Import Excel */}
      <Dialog open={importOpen} onOpenChange={o => { setImportOpen(o); if (!o) setImportFile(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-4 w-4" /> Import Pelanggan dari Excel
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Kolom yang didukung:</p>
              <ul className="text-xs space-y-0.5 list-disc list-inside text-blue-700 dark:text-blue-300">
                <li>Nama <span className="text-red-500">*</span></li>
                <li>No WA</li>
                <li>Email</li>
                <li>Tgl Pertama Order (yyyy-MM-dd)</li>
                <li>Notes</li>
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
