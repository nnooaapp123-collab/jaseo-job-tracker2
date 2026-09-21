import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  User, Phone, Mail, MapPin, CreditCard, Calendar, Camera,
  Loader2, Edit3, Save, X, TrendingUp, PiggyBank, Shield,
  Monitor, Pencil, Lock, Eye, EyeOff, AlertCircle, Gauge,
} from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useListUsers } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

// ─── Change Password Section ─────────────────────────────────────────────────
function ChangePasswordSection() {
  const { currentUser, refresh } = useAuth();
  const { toast } = useToast();
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) { setError("Password baru dan konfirmasi tidak cocok."); return; }
    if (newPass.length < 4) { setError("Password minimal 4 karakter."); return; }
    setError(null); setIsLoading(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/auth/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
      });
      if (res.ok) {
        toast({ title: "Password berhasil diubah" });
        setCurrentPass(""); setNewPass(""); setConfirmPass("");
        await refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Gagal mengubah password.");
      }
    } catch { setError("Tidak dapat terhubung ke server."); }
    finally { setIsLoading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          Ganti Password
        </CardTitle>
        <CardDescription>
          Ubah password akun <strong>{currentUser?.username}</strong>. Minimal 4 karakter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
          <div className="grid gap-2">
            <Label>Password Saat Ini</Label>
            <div className="relative">
              <Input type={showCurrent ? "text" : "password"} value={currentPass} onChange={e => setCurrentPass(e.target.value)} required />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Password Baru</Label>
            <div className="relative">
              <Input type={showNew ? "text" : "password"} value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Minimal 4 karakter" required />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Konfirmasi Password Baru</Label>
            <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} required />
          </div>
          {error && <Alert variant="destructive" className="py-2"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
          <Button type="submit" disabled={isLoading || !currentPass || !newPass || !confirmPass}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Simpan Password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface UserProfile {
  userId: number;
  username: string;
  role: string;
  writerId: number | null;
  editorId: number | null;
  name: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  bankAccount: string | null;
  bankName: string | null;
  accountOwner: string | null;
  address: string | null;
  joinDate: string | null;
  photoUrl: string | null;
  isActive: boolean;
  isAlsoEditor: boolean;
  maxDailyWords: number | null;
  kinerja: { allJobs: number; doneJobs: number; allWords: number; doneWords: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  admin:   { label: "Admin",            icon: Shield,  color: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  cs:      { label: "Customer Service", icon: Monitor, color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400" },
  editor:  { label: "Editor",           icon: Pencil,  color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400" },
  penulis: { label: "Penulis",          icon: User,    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
};

function pct(done: number, all: number) {
  if (all === 0) return 0;
  return Math.round((done / all) * 100);
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-muted-foreground font-mono w-8 text-right">{value}%</span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────
export default function ProfilPage() {
  const { currentUser } = useAuth();
  const { toast } = useToast();
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  // Admin bisa pilih user lain
  const { data: allUsers = [] } = useListUsers({ query: {} as never });
  const [selectedUserId, setSelectedUserId] = useState<string>("self");

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<UserProfile>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = currentUser?.role === "admin";

  const targetUserId = isAdmin && selectedUserId !== "self"
    ? selectedUserId
    : undefined;

  // Fetch profile
  useEffect(() => {
    setLoading(true);
    const url = `${base}/api/profile${targetUserId ? `?userId=${targetUserId}` : ""}`;
    fetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : r.json().then((e: { error: string }) => Promise.reject(e.error)))
      .then((data: UserProfile) => {
        setProfile(data);
        setForm(data);
        setEditing(false);
      })
      .catch((e: unknown) => toast({
        variant: "destructive",
        title: "Gagal memuat profil",
        description: typeof e === "string" ? e : "Terjadi kesalahan",
      }))
      .finally(() => setLoading(false));
  }, [targetUserId, base]);

  const handleSave = async () => {
    if (!profile?.writerId) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/api/writers/${profile.writerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName:     form.fullName ?? null,
          email:        form.email ?? null,
          phone:        form.phone ?? null,
          bankAccount:  form.bankAccount ?? null,
          bankName:     form.bankName ?? null,
          accountOwner: form.accountOwner ?? null,
          address:      form.address ?? null,
          joinDate:     form.joinDate ?? null,
          photoUrl:     form.photoUrl ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setProfile(prev => prev ? { ...prev, ...form } : prev);
      setEditing(false);
      toast({ title: "Profil berhasil disimpan" });
    } catch {
      toast({ variant: "destructive", title: "Gagal menyimpan profil" });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Foto terlalu besar", description: "Maksimal 2MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(prev => ({ ...prev, photoUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const canEdit = profile?.writerId && (
    currentUser?.role === "admin" ||
    currentUser?.role === "penulis" ||
    currentUser?.role === "cs" ||
    currentUser?.role === "editor"
  );

  const roleConf = ROLE_CONFIG[(profile?.role as keyof typeof ROLE_CONFIG) ?? "penulis"] ?? ROLE_CONFIG.penulis;
  const RoleIcon = roleConf.icon;

  // Daftar user untuk selector admin (exclude admin accounts)
  const userOptions = allUsers.filter(u => u.role !== "admin").sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username, "id"));

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold tracking-tight">Profil</h2>
          <p className="text-muted-foreground text-sm">Data diri dan kinerja bulan ini.</p>
        </div>
        {isAdmin && userOptions.length > 0 && (
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-[200px] h-9 bg-background shadow-sm">
              <SelectValue placeholder="Pilih pengguna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self">— Profil Saya —</SelectItem>
              {userOptions.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.displayName ?? u.username} ({u.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {profile && !loading && (
        <>
          {/* ── Kartu Profil ─────────────────────────────────────────────────── */}
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-6">
                {/* Foto */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div
                    className={cn(
                      "w-24 h-24 rounded-full overflow-hidden bg-muted flex items-center justify-center border-2 border-border",
                      editing && canEdit && "cursor-pointer hover:opacity-80 transition-opacity"
                    )}
                    onClick={() => editing && canEdit && fileRef.current?.click()}
                  >
                    {(editing ? form.photoUrl : profile.photoUrl) ? (
                      <img
                        src={(editing ? form.photoUrl : profile.photoUrl)!}
                        alt="Foto profil"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="h-10 w-10 text-muted-foreground" />
                    )}
                  </div>
                  {editing && canEdit && (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => fileRef.current?.click()}>
                      <Camera className="h-3 w-3 mr-1" />
                      Ganti Foto
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                  <Badge className={cn("text-xs font-medium", roleConf.color)}>
                    <RoleIcon className="h-3 w-3 mr-1" />
                    {roleConf.label}
                  </Badge>
                  {profile.isAlsoEditor && (
                    <Badge variant="outline" className="text-xs">Dual Role</Badge>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      {editing && canEdit ? (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Nama Lengkap</Label>
                            <Input value={form.fullName ?? ""} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))}
                              placeholder="Nama lengkap..." className="h-8 mt-1" />
                          </div>
                        </div>
                      ) : (
                        <>
                          <h3 className="text-xl font-bold">{profile.fullName || profile.name}</h3>
                          {profile.fullName && profile.name !== profile.fullName && (
                            <p className="text-sm text-muted-foreground">({profile.name})</p>
                          )}
                        </>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">@{profile.username}</p>
                    </div>
                    {canEdit && !editing && (
                      <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={() => { setEditing(true); setForm(profile); }}>
                        <Edit3 className="h-3.5 w-3.5 mr-1" />
                        Edit Profil
                      </Button>
                    )}
                    {editing && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
                          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                          Simpan
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setEditing(false); setForm(profile); }}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Info fields */}
                  {editing && canEdit ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { key: "email",        label: "Email",              type: "email" },
                        { key: "phone",        label: "No. WhatsApp",       type: "tel" },
                        { key: "bankAccount",  label: "No. Rekening",       type: "text" },
                        { key: "bankName",     label: "Nama Bank",          type: "text" },
                        { key: "accountOwner", label: "Nama Pemilik Rek.",  type: "text" },
                        { key: "joinDate",     label: "Tanggal Bergabung",  type: "date" },
                        { key: "address",      label: "Alamat",             type: "text" },
                      ].map(({ key, label, type }) => (
                        <div key={key}>
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <Input
                            type={type}
                            value={(form as Record<string, string | null>)[key] ?? ""}
                            onChange={e => setForm(p => ({ ...p, [key]: e.target.value || null }))}
                            className="h-8 mt-1"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      <InfoRow icon={Mail}       label="Email"             value={profile.email} />
                      <InfoRow icon={Phone}      label="No. WhatsApp"      value={profile.phone} />
                      <InfoRow icon={CreditCard} label="No. Rekening"
                        value={[profile.bankAccount, profile.bankName, profile.accountOwner ? `a.n. ${profile.accountOwner}` : null]
                          .filter(Boolean).join(" · ") || null} />
                      <InfoRow icon={Calendar}   label="Bergabung"
                        value={profile.joinDate
                          ? format(new Date(profile.joinDate + "T00:00:00"), "d MMMM yyyy", { locale: localeId })
                          : null}
                      />
                      <InfoRow icon={MapPin}     label="Alamat"            value={profile.address} />
                      <InfoRow icon={Gauge}      label="Maks. Kata/Hari"
                        value={profile.maxDailyWords
                          ? `${profile.maxDailyWords.toLocaleString("id")} kata per hari`
                          : null}
                      />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Kinerja Bulan Ini ─────────────────────────────────────────────── */}
          {(profile.writerId || profile.editorId) && (
            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Kinerja Bulan Ini — {format(new Date(), "MMMM yyyy", { locale: localeId })}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                  {[
                    { label: "Total Job",    value: profile.kinerja.allJobs,                        color: "text-primary" },
                    { label: "Selesai",      value: profile.kinerja.doneJobs,                       color: "text-emerald-600" },
                    { label: "Total Kata",   value: profile.kinerja.allWords.toLocaleString("id-ID"),  color: "text-primary" },
                    { label: "Kata Selesai", value: profile.kinerja.doneWords.toLocaleString("id-ID"), color: "text-emerald-600" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center p-3 rounded-lg bg-muted/40">
                      <p className={cn("text-xl font-bold font-mono", color)}>{value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Penyelesaian Job</p>
                  <ProgressBar value={pct(profile.kinerja.doneJobs, profile.kinerja.allJobs)} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Ganti Password — hanya tampil untuk profil sendiri ────────────── */}
          {!targetUserId && <ChangePasswordSection />}
        </>
      )}
    </div>
  );
}
