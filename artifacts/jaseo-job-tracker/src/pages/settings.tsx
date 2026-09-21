import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, differenceInDays, differenceInMonths, differenceInYears } from "date-fns";
import { id } from "date-fns/locale";
import {
  Plus, Loader2, Lock, AlertCircle,
  Camera, Pencil, X, User, PenLine, UserX, UserCheck, Trash2, Monitor, AlertTriangle,
  CloudUpload, ExternalLink, CheckCircle2, Download, Clock, Save, LogIn, Eye, EyeOff, KeyRound,
} from "lucide-react";
import {
  useListWriters, getListWritersQueryKey, useCreateWriter, useUpdateWriter,
  useListEditors, getListEditorsQueryKey, useListUsers,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

// ─── Masa Aktif Helper ──────────────────────────────────────────────
function calcMasaAktif(joinDate: string | null | undefined): string {
  if (!joinDate) return "-";
  const join = new Date(joinDate);
  const now = new Date();
  if (isNaN(join.getTime())) return "-";

  const years = differenceInYears(now, join);
  const months = differenceInMonths(now, join) % 12;
  const days = differenceInDays(now, new Date(join.getFullYear() + years, join.getMonth() + months, join.getDate()));

  const parts = [];
  if (years > 0) parts.push(`${years} tahun`);
  if (months > 0) parts.push(`${months} bulan`);
  if (days > 0) parts.push(`${days} hari`);
  return parts.length > 0 ? parts.join(", ") : "Baru bergabung";
}

// ─── Photo Upload ────────────────────────────────────────────────────
function PhotoUpload({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Ukuran foto maksimal 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative w-24 h-24 rounded-full border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden cursor-pointer hover:bg-muted/70 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        {value ? (
          <img src={value} alt="Foto" className="w-full h-full object-cover" />
        ) : (
          <User className="h-10 w-10 text-muted-foreground/50" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity rounded-full">
          <Camera className="h-6 w-6 text-white" />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
          {value ? "Ganti" : "Pilih Foto"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => onChange(null)}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Maks. 2MB</p>
    </div>
  );
}

// ─── Writer Form Fields ──────────────────────────────────────────────
interface WriterFormState {
  name: string;
  fullName: string;
  address: string;
  email: string;
  phone: string;
  bankAccount: string;
  bankName: string;
  accountOwner: string;
  joinDate: string;
  photoUrl: string | null;
  maxDailyWords: string;
}

const emptyWriterForm = (): WriterFormState => ({
  name: "", fullName: "", address: "", email: "",
  phone: "", bankAccount: "", bankName: "", accountOwner: "", joinDate: "", photoUrl: null,
  maxDailyWords: "",
});

function WriterFormFields({ form, setForm }: {
  form: WriterFormState;
  setForm: (f: WriterFormState) => void;
}) {
  const set = (key: keyof WriterFormState, val: string | null) =>
    setForm({ ...form, [key]: val });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Foto — full width, centered */}
      <div className="sm:col-span-2 flex justify-center">
        <PhotoUpload value={form.photoUrl} onChange={v => set("photoUrl", v)} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="fullName">Nama Penulis Lengkap</Label>
        <Input id="fullName" value={form.fullName} onChange={e => set("fullName", e.target.value)} placeholder="Contoh: Ahmad Budi Santoso" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name">Nama di Job <span className="text-destructive">*</span></Label>
        <Input id="name" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Contoh: Budi" required />
        <p className="text-xs text-muted-foreground">Nama singkat yang ditampilkan pada tabel job.</p>
      </div>

      <div className="grid gap-2 sm:col-span-2">
        <Label htmlFor="address">Alamat</Label>
        <Textarea id="address" value={form.address} onChange={e => set("address", e.target.value)} placeholder="Alamat lengkap..." rows={2} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@contoh.com" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="phone">No WhatsApp</Label>
        <Input id="phone" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="08xx-xxxx-xxxx" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="bankName">Nama Bank</Label>
        <Input id="bankName" value={form.bankName} onChange={e => set("bankName", e.target.value)} placeholder="Contoh: BCA" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bankAccount">No Rekening</Label>
        <Input id="bankAccount" value={form.bankAccount} onChange={e => set("bankAccount", e.target.value)} placeholder="Nomor rekening" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="accountOwner">Nama Pemilik Rekening</Label>
        <Input id="accountOwner" value={form.accountOwner} onChange={e => set("accountOwner", e.target.value)} placeholder="Sesuai buku rekening" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="joinDate">Tanggal Bergabung</Label>
        <Input id="joinDate" type="date" value={form.joinDate} onChange={e => set("joinDate", e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="maxDailyWords">Maks. Kata per Hari</Label>
        <Input
          id="maxDailyWords"
          type="number"
          min="0"
          value={form.maxDailyWords}
          onChange={e => set("maxDailyWords", e.target.value)}
          placeholder="Kosong = tidak ada batas"
        />
        <p className="text-xs text-muted-foreground">Kapasitas maksimal kata yang bisa dikerjakan dalam satu hari.</p>
      </div>
    </div>
  );
}

// ─── Delete Writer Button ─────────────────────────────────────────────
function DeleteWriterButton({ writerId, writerName }: { writerId: number; writerName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    setLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/writers/${writerId}/permanent`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: `Penulis "${writerName}" dihapus permanen` });
        queryClient.invalidateQueries({ queryKey: getListWritersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListEditorsQueryKey() });
        setOpen(false);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: data.error || "Gagal menghapus", variant: "destructive" });
      }
    } catch {
      toast({ title: "Tidak dapat terhubung ke server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
          title="Hapus penulis"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-destructive">Hapus Penulis</DialogTitle>
          <DialogDescription>
            Anda akan menghapus permanen <strong>{writerName}</strong> beserta akun loginnya. Jika penulis ini merangkap editor, data editornya juga ikut dihapus.
          </DialogDescription>
        </DialogHeader>
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Tindakan ini tidak dapat dibatalkan. Gunakan tombol nonaktif jika hanya ingin menghapus sementara.</AlertDescription>
        </Alert>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ya, Hapus Permanen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Writer Manager ───────────────────────────────────────────────────
type UserWithPw = { id: number; username: string; role: string; writerId: number | null; plainPassword?: string; isActive?: boolean };

function WriterManager({ canManage, isCs, isAdmin }: { canManage: boolean; isCs: boolean; isAdmin: boolean }) {
  const { data: writers = [], isLoading } = useListWriters({ query: { queryKey: getListWritersQueryKey() } });
  const { data: allUsers = [] } = useListUsers({ query: {} as never });
  const createWriter = useCreateWriter();
  const updateWriter = useUpdateWriter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { login } = useAuth();
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  const [showPw, setShowPw] = useState<Record<number, boolean>>({});
  const [loginAsLoading, setLoginAsLoading] = useState<number | null>(null);

  // Map writerId → user (with plainPassword cast)
  const usersWithPw = allUsers as unknown as UserWithPw[];
  const usersByWriterId = Object.fromEntries(
    usersWithPw.filter(u => u.writerId).map(u => [u.writerId!, u])
  );

  const handleToggleAlsoEditor = (writerId: number, checked: boolean) => {
    updateWriter.mutate({ id: writerId, data: { isAlsoEditor: checked } }, {
      onSuccess: () => {
        toast({
          title: checked ? "Penulis diaktifkan sebagai editor" : "Status editor penulis dinonaktifkan",
        });
        queryClient.invalidateQueries({ queryKey: getListWritersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListEditorsQueryKey() });
      },
    });
  };

  const handleLoginAs = async (userId: number) => {
    setLoginAsLoading(userId);
    try {
      const res = await fetch(`${base}/api/auth/login-as`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data);
        window.location.href = base + "/";
      } else {
        toast({ variant: "destructive", title: data.error ?? "Gagal login sebagai user ini" });
      }
    } catch {
      toast({ variant: "destructive", title: "Tidak dapat terhubung ke server" });
    } finally {
      setLoginAsLoading(null);
    }
  };

  const handleToggleCs = async (writerId: number, currentIsCs: boolean) => {
    const user = usersByWriterId[writerId];
    if (!user) { toast({ variant: "destructive", title: "Akun user tidak ditemukan" }); return; }
    try {
      const res = await fetch(`${base}/api/users/${user.id}/assign-cs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ asCs: !currentIsCs }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Gagal mengubah peran");
      }
      toast({ title: currentIsCs ? "Peran CS dicabut, kembali ke Penulis" : "Penulis ditugaskan sebagai CS" });
      queryClient.invalidateQueries({ queryKey: getListWritersQueryKey() });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Terjadi kesalahan" });
    }
  };

  const handleToggleActive = (writerId: number, currentlyActive: boolean) => {
    const nowActive = !currentlyActive;
    updateWriter.mutate({
      id: writerId,
      data: { isActive: nowActive, lastActiveDate: nowActive ? null : undefined },
    }, {
      onSuccess: () => {
        toast({ title: nowActive ? "Penulis diaktifkan kembali" : "Penulis dinonaktifkan" });
        queryClient.invalidateQueries({ queryKey: getListWritersQueryKey() });
      },
    });
  };

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<WriterFormState>(emptyWriterForm());

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<WriterFormState>(emptyWriterForm());

  const openEdit = useCallback((w: typeof writers[0]) => {
    setEditForm({
      name: w.name,
      fullName: w.fullName ?? "",
      address: w.address ?? "",
      email: w.email ?? "",
      phone: w.phone ?? "",
      bankAccount: w.bankAccount ?? "",
      bankName: w.bankName ?? "",
      accountOwner: w.accountOwner ?? "",
      joinDate: w.joinDate ?? "",
      photoUrl: w.photoUrl ?? null,
      maxDailyWords: w.maxDailyWords != null ? String(w.maxDailyWords) : "",
    });
    setEditingId(w.id);
  }, []);

  const handleAdd = () => {
    if (!addForm.name.trim()) return;
    createWriter.mutate({
      data: {
        name: addForm.name.trim(),
        fullName: addForm.fullName || null,
        address: addForm.address || null,
        email: addForm.email || null,
        phone: addForm.phone || null,
        bankAccount: addForm.bankAccount || null,
        bankName: addForm.bankName || null,
        accountOwner: addForm.accountOwner || null,
        joinDate: addForm.joinDate || null,
        photoUrl: addForm.photoUrl || null,
        maxDailyWords: addForm.maxDailyWords ? parseInt(addForm.maxDailyWords) : null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Penulis ditambahkan" });
        queryClient.invalidateQueries({ queryKey: getListWritersQueryKey() });
        setAddForm(emptyWriterForm());
        setIsAddOpen(false);
      },
    });
  };

  const handleEdit = () => {
    if (!editingId || !editForm.name.trim()) return;
    updateWriter.mutate({
      id: editingId,
      data: {
        name: editForm.name.trim(),
        fullName: editForm.fullName || null,
        address: editForm.address || null,
        email: editForm.email || null,
        phone: editForm.phone || null,
        bankAccount: editForm.bankAccount || null,
        bankName: editForm.bankName || null,
        accountOwner: editForm.accountOwner || null,
        joinDate: editForm.joinDate || null,
        photoUrl: editForm.photoUrl || null,
        maxDailyWords: editForm.maxDailyWords ? parseInt(editForm.maxDailyWords) : null,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Data penulis diperbarui" });
        queryClient.invalidateQueries({ queryKey: getListWritersQueryKey() });
        setEditingId(null);
      },
    });
  };

  return (
    <Card className={cn(!canManage && "opacity-80")}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xl flex items-center gap-2">
            Daftar Penulis
            {!canManage && <Lock className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
          <CardDescription>
            {canManage ? "Kelola tim penulis konten." : "Hanya Admin/CS yang dapat mengelola tim penulis."}
          </CardDescription>
        </div>
        {canManage && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1">
                <Plus className="h-4 w-4" />Tambah
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tambah Penulis Baru</DialogTitle>
                <DialogDescription>Lengkapi data penulis. Kolom bertanda * wajib diisi.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <WriterFormFields form={addForm} setForm={setAddForm} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setIsAddOpen(false); setAddForm(emptyWriterForm()); }}>Batal</Button>
                <Button onClick={handleAdd} disabled={createWriter.isPending || !addForm.name.trim()}>
                  {createWriter.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Simpan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>

      <CardContent>
        {!canManage && (
          <Alert className="mb-3">
            <Lock className="h-4 w-4" />
            <AlertDescription>Mode tampilan saja. Login sebagai Admin atau CS untuk mengelola.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : writers.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Belum ada penulis.</p>
        ) : (
          <div className="space-y-3">
            {writers.map(w => (
              <div key={w.id} className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                w.isActive
                  ? "border-border bg-card hover:bg-muted/30"
                  : "border-border/50 bg-muted/40 opacity-70"
              )}>
                {/* Foto */}
                <div className="shrink-0 relative">
                  {w.photoUrl ? (
                    <img src={w.photoUrl} alt={w.name} className={cn("w-12 h-12 rounded-full object-cover border border-border", !w.isActive && "grayscale")} />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center border border-border">
                      <User className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}
                  {!w.isActive && (
                    <div className="absolute -bottom-1 -right-1 bg-destructive/80 rounded-full p-0.5">
                      <UserX className="h-2.5 w-2.5 text-white" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{w.fullName || w.name}</span>
                    {w.fullName && <Badge variant="secondary" className="text-xs px-1.5 py-0">{w.name}</Badge>}
                    {!w.isActive && (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0 opacity-80">
                        <UserX className="h-2.5 w-2.5 mr-1" />Nonaktif
                      </Badge>
                    )}
                    {w.isAlsoEditor && w.isActive && (
                      <Badge className="text-xs px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800">
                        <PenLine className="h-2.5 w-2.5 mr-1" />Juga Editor
                      </Badge>
                    )}
                    {usersByWriterId[w.id]?.role === "cs" && (
                      <Badge className="text-xs px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                        <Monitor className="h-2.5 w-2.5 mr-1" />CS
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    {w.email && <span>📧 {w.email}</span>}
                    {w.phone && <span>📱 {w.phone}</span>}
                    {(w.bankName || w.bankAccount || w.accountOwner) && (
                      <span>🏦 {[w.bankName, w.bankAccount, w.accountOwner].filter(Boolean).join(" · ")}</span>
                    )}
                    {w.address && <span className="sm:col-span-2">📍 {w.address}</span>}
                    {w.joinDate && (
                      <span className="sm:col-span-2 text-primary/80 font-medium">
                        🗓 Bergabung: {format(new Date(w.joinDate), "d MMMM yyyy", { locale: id })}
                        {w.isActive && <>{" "}·{" "}<span className="text-emerald-600 dark:text-emerald-400">{calcMasaAktif(w.joinDate)}</span></>}
                      </span>
                    )}
                    {!w.joinDate && (
                      <span>🗓 Terdaftar: {format(new Date(w.createdAt), "d MMMM yyyy", { locale: id })}</span>
                    )}
                    {!w.isActive && w.lastActiveDate && (
                      <span className="sm:col-span-2 text-destructive/70 font-medium">
                        🚫 Nonaktif sejak: {format(new Date(w.lastActiveDate), "d MMMM yyyy", { locale: id })}
                      </span>
                    )}
                  </div>

                  {/* Info akun login — hanya Admin */}
                  {isAdmin && usersByWriterId[w.id] && (
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                      <span className="text-xs text-muted-foreground font-mono">
                        {usersByWriterId[w.id].username}
                      </span>
                      <span className="text-xs text-muted-foreground">/</span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {showPw[w.id]
                          ? (usersByWriterId[w.id].plainPassword ?? "jaseo12")
                          : "••••••••"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPw(p => ({ ...p, [w.id]: !p[w.id] }))}
                        className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        title={showPw[w.id] ? "Sembunyikan" : "Tampilkan password"}
                      >
                        {showPw[w.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                  )}

                  {/* Toggle: Merangkap Editor — hanya CS/Admin & penulis aktif */}
                  {isCs && w.isActive && usersByWriterId[w.id]?.role !== "cs" && (
                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        id={`also-editor-${w.id}`}
                        checked={w.isAlsoEditor}
                        onCheckedChange={checked => handleToggleAlsoEditor(w.id, checked)}
                        className="scale-90"
                      />
                      <label htmlFor={`also-editor-${w.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                        Merangkap sebagai editor
                      </label>
                    </div>
                  )}
                  {/* Toggle: Tugaskan sebagai CS — hanya Admin */}
                  {isAdmin && w.isActive && usersByWriterId[w.id] && (
                    (() => {
                      const userRole = usersByWriterId[w.id]?.role;
                      const isUserCs = userRole === "cs";
                      if (userRole !== "penulis" && userRole !== "cs") return null;
                      return (
                        <div className="flex items-center gap-2 pt-0.5">
                          <Switch
                            id={`cs-${w.id}`}
                            checked={isUserCs}
                            onCheckedChange={() => handleToggleCs(w.id, isUserCs)}
                            className="scale-90"
                          />
                          <label htmlFor={`cs-${w.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                            Tugaskan sebagai Customer Service
                          </label>
                        </div>
                      );
                    })()
                  )}
                </div>

                {/* Tombol aksi */}
                {canManage && (
                  <div className="flex flex-col gap-1 shrink-0">
                    {/* Login Sebagai — admin only, hanya penulis aktif */}
                    {isAdmin && w.isActive && usersByWriterId[w.id] && (
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-primary/70 hover:text-primary hover:bg-primary/10"
                        title={`Login sebagai ${w.fullName || w.name}`}
                        disabled={loginAsLoading === usersByWriterId[w.id].id}
                        onClick={() => handleLoginAs(usersByWriterId[w.id].id)}
                      >
                        {loginAsLoading === usersByWriterId[w.id].id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <LogIn className="h-4 w-4" />}
                      </Button>
                    )}
                    {/* Edit */}
                    <Dialog open={editingId === w.id} onOpenChange={open => { if (!open) setEditingId(null); }}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)} title="Edit data">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Penulis — {w.fullName || w.name}</DialogTitle>
                          <DialogDescription>Perbarui data penulis.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <WriterFormFields form={editForm} setForm={setEditForm} />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
                          <Button onClick={handleEdit} disabled={updateWriter.isPending || !editForm.name.trim()}>
                            {updateWriter.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Simpan Perubahan
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost" size="icon"
                      className={cn("h-8 w-8", w.isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700")}
                      title={w.isActive ? "Hapus sementara / nonaktifkan penulis" : "Aktifkan kembali penulis"}
                      onClick={() => handleToggleActive(w.id, w.isActive)}
                    >
                      {w.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </Button>
                    <DeleteWriterButton writerId={w.id} writerName={w.fullName || w.name} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Editor Manager ───────────────────────────────────────────────────
function EditorManager() {
  const { data: editors = [], isLoading } = useListEditors({ query: { queryKey: getListEditorsQueryKey() } });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-xl">Daftar Editor</CardTitle>
          <CardDescription>Editor otomatis berasal dari penulis yang diaktifkan sebagai editor di atas.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Editor</TableHead>
                <TableHead>Tanggal Bergabung</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={2} className="h-24 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : editors.length === 0 ? (
                <TableRow><TableCell colSpan={2} className="h-24 text-center text-muted-foreground">Belum ada editor.</TableCell></TableRow>
              ) : (
                editors.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(e.createdAt), "d MMMM yyyy", { locale: id })}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Backup Section ─────────────────────────────────────────────────────────
interface BackupSummary {
  jobs: number;
  savings: number;
  withdrawals: number;
  orders: number;
  customers: number;
}
interface BackupResult {
  ok: boolean;
  spreadsheetId: string;
  spreadsheetUrl: string;
  summary: BackupSummary;
}

function BackupSection() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { toast } = useToast();

  // Google Sheets backup state
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<BackupResult | null>(null);
  const [lastTime, setLastTime] = useState<Date | null>(null);

  // Download state
  const [downloading, setDownloading] = useState(false);

  // Schedule state
  const [schedHour, setSchedHour] = useState(16);
  const [schedMinute, setSchedMinute] = useState(1);
  const [schedLoading, setSchedLoading] = useState(false);
  const [schedSaved, setSchedSaved] = useState(false);

  // Load current schedule from server
  useEffect(() => {
    fetch(`${base}/api/backup/schedule`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setSchedHour(d.hour); setSchedMinute(d.minute); } })
      .catch(() => {});
  }, [base]);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/backup/run`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Backup gagal", variant: "destructive" });
        return;
      }
      setLastResult(data as BackupResult);
      setLastTime(new Date());
      toast({ title: "Backup berhasil disimpan ke Google Sheets" });
    } catch {
      toast({ title: "Gagal terhubung ke server", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${base}/api/backup/download`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: data.error ?? "Gagal membuat file", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const nameMatch = disposition.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = nameMatch?.[1] ?? "Backup_Jaseo.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "File Excel berhasil diunduh" });
    } catch {
      toast({ title: "Gagal mengunduh file", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveSchedule = async () => {
    setSchedLoading(true);
    setSchedSaved(false);
    try {
      const res = await fetch(`${base}/api/backup/schedule`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hour: schedHour, minute: schedMinute }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Gagal menyimpan jadwal", variant: "destructive" });
        return;
      }
      setSchedSaved(true);
      toast({ title: `Jadwal backup diperbarui: ${String(schedHour).padStart(2,"0")}:${String(schedMinute).padStart(2,"0")} WIB` });
      setTimeout(() => setSchedSaved(false), 3000);
    } catch {
      toast({ title: "Gagal menyimpan jadwal", variant: "destructive" });
    } finally {
      setSchedLoading(false);
    }
  };

  const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const formatTime = (d: Date) =>
    `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")} WIB`;

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CloudUpload className="h-5 w-5 text-blue-600" />
          Backup Data
        </CardTitle>
        <CardDescription>
          Simpan data ke Google Sheets otomatis atau unduh langsung sebagai file Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Data yang dibackup */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            { label: "Jobs", desc: "Semua data job" },
            { label: "Tabungan", desc: "Riwayat & penarikan" },
            { label: "Order Artikel", desc: "Semua order masuk" },
            { label: "Pelanggan", desc: "Data pelanggan" },
          ].map(item => (
            <div key={item.label} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="font-semibold text-foreground">{item.label}</p>
              <p className="text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* ── Jadwal Otomatis ── */}
        <div className="rounded-lg border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-800 dark:text-blue-300">
            <Clock className="h-4 w-4" />
            Backup Otomatis ke Google Sheets
          </div>
          <p className="text-xs text-muted-foreground">
            Backup akan berjalan secara otomatis setiap hari pada jam yang ditentukan (waktu WIB).
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Jam</Label>
              <Input
                type="number" min={0} max={23}
                value={schedHour}
                onChange={e => setSchedHour(Math.max(0, Math.min(23, Number(e.target.value))))}
                className="w-20 h-8 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Menit</Label>
              <Input
                type="number" min={0} max={59}
                value={schedMinute}
                onChange={e => setSchedMinute(Math.max(0, Math.min(59, Number(e.target.value))))}
                className="w-20 h-8 text-sm"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs invisible">Zona</Label>
              <div className="flex items-center h-8 px-3 rounded-md border border-border bg-muted/30 text-sm font-medium text-muted-foreground">WIB</div>
            </div>
            <Button
              size="sm" variant="outline"
              onClick={handleSaveSchedule}
              disabled={schedLoading}
              className={cn("h-8", schedSaved && "border-green-500 text-green-600")}
            >
              {schedLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : schedSaved
                  ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Tersimpan</>
                  : <><Save className="h-3.5 w-3.5 mr-1" />Simpan Jadwal</>
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Jadwal aktif:{" "}
            <span className="font-semibold text-foreground">
              {String(schedHour).padStart(2,"0")}:{String(schedMinute).padStart(2,"0")} WIB
            </span>
          </p>
        </div>

        {/* Hasil backup terakhir */}
        {lastResult && lastTime && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Backup terakhir: {formatTime(lastTime)}
            </div>
            <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
              <span>{lastResult.summary.jobs} job</span>
              <span>{lastResult.summary.savings} tabungan</span>
              <span>{lastResult.summary.withdrawals} penarikan</span>
              <span>{lastResult.summary.orders} order</span>
              <span>{lastResult.summary.customers} pelanggan</span>
            </div>
            <a
              href={lastResult.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline font-medium"
            >
              <ExternalLink className="h-3 w-3" />
              Buka Spreadsheet di Google Sheets
            </a>
          </div>
        )}

        {/* Tombol aksi */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={handleBackup}
            disabled={loading}
            className="flex-1 sm:flex-none"
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sedang Backup...</>
              : <><CloudUpload className="mr-2 h-4 w-4" />Backup ke Google Sheets</>
            }
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
            className="flex-1 sm:flex-none"
          >
            {downloading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Membuat file...</>
              : <><Download className="mr-2 h-4 w-4" />Unduh Excel ke PC</>
            }
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          File Excel berisi semua data dalam format .xlsx yang bisa dibuka di Microsoft Excel atau Google Sheets.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Danger Zone ────────────────────────────────────────────────────────
const CONFIRM_WORD = "HAPUS";

interface DangerAction {
  label: string;
  description: string;
  endpoint: string;
  successMsg: string;
  invalidateKeys?: string[][];
}

const DANGER_ACTIONS: DangerAction[] = [
  {
    label: "Hapus Semua Data Job",
    description: "Menghapus seluruh data job di semua tanggal secara permanen. Data tidak dapat dipulihkan.",
    endpoint: "/api/jobs/delete-all",
    successMsg: "Semua data job berhasil dihapus.",
    invalidateKeys: [["jobs"], ["stats"]],
  },
  {
    label: "Hapus Semua Data Tabungan",
    description: "Menghapus seluruh riwayat tabungan dan pengajuan penarikan semua penulis secara permanen.",
    endpoint: "/api/savings/delete-all",
    successMsg: "Semua data tabungan berhasil dihapus.",
    invalidateKeys: [["savings"]],
  },
  {
    label: "Hapus Semua Data Order Artikel",
    description: "Menghapus seluruh data order artikel dari semua pelanggan secara permanen.",
    endpoint: "/api/article-orders/delete-all",
    successMsg: "Semua data order artikel berhasil dihapus.",
    invalidateKeys: [["article-orders"]],
  },
];

function DangerActionDialog({ action }: { action: DangerAction }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleDelete = async () => {
    if (confirm !== CONFIRM_WORD) return;
    setLoading(true);
    try {
      const res = await fetch(`${base}${action.endpoint}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error ?? "Terjadi kesalahan", variant: "destructive" }); return; }
      action.invalidateKeys?.forEach(k => queryClient.invalidateQueries({ queryKey: k }));
      toast({ title: action.successMsg });
      setOpen(false);
    } catch {
      toast({ title: "Gagal menghapus data", variant: "destructive" });
    } finally {
      setLoading(false);
      setConfirm("");
    }
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4 py-4 border-b last:border-0">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-destructive">{action.label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          className="shrink-0"
          onClick={() => { setConfirm(""); setOpen(true); }}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Hapus
        </Button>
      </div>

      <Dialog open={open} onOpenChange={o => { if (!o) { setOpen(false); setConfirm(""); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Konfirmasi Hapus
            </DialogTitle>
            <DialogDescription>
              Tindakan ini <strong>tidak dapat dibatalkan</strong>. Seluruh data akan dihapus permanen dari database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
              <p className="text-sm font-medium text-destructive">{action.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
            </div>
            <div className="space-y-1.5">
              <Label>
                Ketik <span className="font-mono font-bold">{CONFIRM_WORD}</span> untuk mengkonfirmasi:
              </Label>
              <Input
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder={CONFIRM_WORD}
                className={cn(confirm === CONFIRM_WORD && "border-destructive ring-1 ring-destructive")}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setConfirm(""); }}>Batal</Button>
            <Button
              variant="destructive"
              disabled={confirm !== CONFIRM_WORD || loading}
              onClick={handleDelete}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ya, Hapus Permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Settings Page ─────────────────────────────────────────────────────
export default function SettingsPage() {
  const { currentUser } = useAuth();
  const canManageTeam = currentUser?.role === "admin" || currentUser?.role === "cs";
  const isCs = currentUser?.role === "admin" || currentUser?.role === "cs";
  const isAdmin = currentUser?.role === "admin";

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-10">
      <div>
        <h2 className="text-2xl font-serif font-bold tracking-tight">Pengaturan</h2>
        <p className="text-muted-foreground">Kelola akun dan tim redaksi Anda.</p>
      </div>

      <div>
        <h3 className="text-xl font-serif font-bold mb-1">Kelola Tim</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {canManageTeam
            ? "Tambah atau perbarui data anggota tim penulis dan editor."
            : "Anda dapat melihat daftar tim, tetapi hanya Admin/CS yang dapat mengelola."}
        </p>
        <div className="grid grid-cols-1 gap-6">
          <WriterManager canManage={canManageTeam} isCs={isCs} isAdmin={isAdmin} />
          <EditorManager />
        </div>
      </div>

      {/* Backup ke Google Sheets — Admin only */}
      {isAdmin && (
        <div>
          <h3 className="text-xl font-serif font-bold mb-1">Backup Data</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Simpan salinan data ke Google Sheets sebagai cadangan.
          </p>
          <BackupSection />
        </div>
      )}

      {/* Zona Berbahaya — Admin only */}
      {isAdmin && (
        <div>
          <h3 className="text-xl font-serif font-bold mb-1 text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Zona Berbahaya
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan. Gunakan dengan sangat hati-hati.
          </p>
          <Card className="border-destructive/30">
            <CardContent className="pt-2 pb-0 px-6">
              {DANGER_ACTIONS.map(action => (
                <DangerActionDialog key={action.endpoint} action={action} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
