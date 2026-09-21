import { useState, useEffect, useRef } from "react";
import logoJaseo from "../assets/logo-jaseo.png";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import { Printer, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useGetMonthlySalary, useGetCsSalary, useListAdditionalIncome } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";

// ─── Helpers ────────────────────────────────────────────────────────────────────
function hitungGajiPenulis(kata: number): number {
  if (kata <= 0)      return 0;
  if (kata >= 115000) return kata * 32 - 1_650_000;
  if (kata >= 103000) return kata * 32 - 1_600_000;
  if (kata >= 91200)  return kata * 32 - 1_500_000;
  if (kata >= 79200)  return kata * 32 - 1_400_000;
  if (kata >= 76800)  return kata * 32 - 1_350_000;
  if (kata >= 72000)  return kata * 32 - 1_300_000;
  if (kata >= 67200)  return kata * 32 - 1_200_000;
  if (kata >= 55200)  return kata * 32 - 1_100_000;
  return Math.floor((kata * 25) / 2);
}

const fmt = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

const BULAN = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

interface UserProfile {
  name: string;
  fullName: string | null;
  role: string;
  bankAccount: string | null;
  bankName: string | null;
  accountOwner: string | null;
  joinDate: string | null;
}

interface SlipRow {
  label: string;
  value: number;
  muted?: boolean;
  separator?: boolean;
}

// ─── Slip Print Area ─────────────────────────────────────────────────────────────
function SlipPrintArea({
  profile, rows, total, tabungan, year, month, userId,
}: {
  profile: UserProfile;
  rows: SlipRow[];
  total: number;
  tabungan: number;
  year: number;
  month: number;
  userId: number;
}) {
  const today = format(new Date(), "d MMMM yyyy", { locale: localeId });
  const displayName = profile.fullName || profile.name;
  const rekeningInfo = [profile.bankAccount, profile.bankName].filter(Boolean).join(" – ");
  const aName = profile.accountOwner ?? displayName;

  return (
    <div className="font-sans text-sm text-foreground" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Kop surat */}
      <div className="flex items-center gap-4 pb-3 mb-4 border-b-2 border-foreground">
        <img
          src={logoJaseo}
          alt="Jaseo Logo"
          className="h-16 w-auto object-contain"
          style={{ height: "64px", width: "auto" }}
        />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-wide">JASEO KONTEN MEDIA</h1>
          <p className="text-xs text-muted-foreground">Agensi Penulisan Konten SEO Profesional</p>
          <p className="text-xs text-muted-foreground">🌐 jualartikelseo.com</p>
        </div>
        <div className="text-right">
          <div className="inline-block border border-foreground rounded px-3 py-1 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Slip Gaji</p>
            <p className="font-bold text-sm">{BULAN[month - 1]} {year}</p>
          </div>
        </div>
      </div>

      {/* Data pegawai */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4 text-xs">
        {[
          ["Nama",          displayName],
          ["Jabatan",       profile.role === "penulis" ? "Penulis Konten"
                          : profile.role === "editor"  ? "Editor Konten"
                          : profile.role === "cs"      ? "Customer Service"
                          : profile.role],
          ["No. Rekening",  rekeningInfo || "—"],
          ["A.n.",          aName],
          ["Periode",       `${BULAN[month - 1]} ${year}`],
          ["Tanggal Cetak", today],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-muted-foreground">{k}</span>
            <span className="font-medium">: {v}</span>
          </div>
        ))}
      </div>

      <Separator className="my-3" />

      {/* Rincian gaji */}
      <table className="w-full text-xs mb-3">
        <tbody>
          {rows.map((row, i) => (
            row.separator
              ? <tr key={`sep-${i}`}><td colSpan={2} className="py-1"><hr className="border-border" /></td></tr>
              : (
                <tr key={i} className={row.muted ? "opacity-60" : ""}>
                  <td className="py-0.5 text-left">{row.label}</td>
                  <td className="py-0.5 text-right font-mono">{fmt(row.value)}</td>
                </tr>
              )
          ))}
        </tbody>
      </table>

      <Separator className="my-3 border-2 border-foreground" />

      {/* Total */}
      <div className="flex justify-between font-bold text-sm mb-1">
        <span>TOTAL GAJI DITERIMA</span>
        <span className="font-mono">{fmt(total)}</span>
      </div>
      {tabungan > 0 && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Tabungan (dicairkan akhir kontrak)</span>
          <span className="font-mono">{fmt(tabungan)}</span>
        </div>
      )}

      <Separator className="my-4" />

      {/* Tanda tangan */}
      <div className="grid grid-cols-2 gap-8 mt-6 text-xs text-center">
        <div>
          <p className="mb-12">Hormat kami,</p>
          <p className="font-semibold border-t border-foreground pt-1">Jaseo Konten Media</p>
        </div>
        <div>
          <p className="mb-12">Penerima,</p>
          <p className="font-semibold border-t border-foreground pt-1">{displayName}</p>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-4">
        Slip gaji ini diterbitkan secara digital oleh sistem Jaseo Job Tracker · jualartikelseo.com
      </p>
    </div>
  );
}

// ─── Main Dialog ─────────────────────────────────────────────────────────────────
interface SlipGajiDialogProps {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  targetUserId: number | null;
  viewRole: string | null;
  isAdmin: boolean;
}

export function SlipGajiDialog({
  open, onClose, year, month, targetUserId, viewRole, isAdmin,
}: SlipGajiDialogProps) {
  const { currentUser } = useAuth();
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const printRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const isCS = viewRole === "cs";
  const isPenEditor = viewRole === "penulis" || viewRole === "editor";

  const salaryParams = targetUserId
    ? { year, month, ...(isAdmin ? { targetUserId } : {}) }
    : { year, month };

  const { data: salaryData, isLoading: salaryLoading } = useGetMonthlySalary(salaryParams, {
    query: { enabled: open && isPenEditor && (!!targetUserId || !isAdmin) } as any,
  });

  const { data: csData, isLoading: csLoading } = useGetCsSalary({ year, month }, {
    query: { enabled: open && isCS } as any,
  });

  const { data: additionalItems = [] } = useListAdditionalIncome(
    { userId: targetUserId ?? 0, year, month },
    { query: { enabled: open && !!targetUserId } as any }
  );

  // Fetch profile for bank info
  useEffect(() => {
    if (!open || !targetUserId) return;
    setProfileLoading(true);
    const url = `${base}/api/profile${isAdmin && targetUserId ? `?userId=${targetUserId}` : ""}`;
    fetch(url, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(setProfile)
      .finally(() => setProfileLoading(false));
  }, [open, targetUserId, isAdmin, base]);

  const isLoading = profileLoading || salaryLoading || csLoading;

  // ── Compute slip rows ─────────────────────────────────────────────────────────
  let rows: SlipRow[] = [];
  let total = 0;
  let tabungan = 0;

  const lainnya = additionalItems.reduce((s, i) => s + i.amount, 0);

  if (isPenEditor && salaryData) {
    const d = salaryData;
    const wKata = d.totalWords ?? 0;
    const eKata = d.editorTotalWords ?? 0;
    const wIncome = d.writerId ? hitungGajiPenulis(wKata) : 0;
    const eIncome = eKata > 0 ? Math.floor(eKata * 4.7) : 0;
    const pulsaOk = d.editorId ? true : wKata >= 48_100;
    const pulsa   = pulsaOk ? 70_000 : 0;
    const tabOk   = d.editorId ? true : wKata >= 70_000;
    tabungan      = tabOk ? 100_000 : 0;
    const bonusOk = (d.role === "penulis" || (d.role === "editor" && d.writerId)) && wKata >= 80_000;
    const bonus   = bonusOk ? Math.floor((wIncome + eIncome + pulsa) * 0.05) : 0;

    if (d.writerId) {
      rows.push({ label: `Pendapatan Penulis (${wKata.toLocaleString("id-ID")} kata)`, value: wIncome });
    }
    if (d.editorId) {
      rows.push({ label: `Pendapatan Editor (${eKata.toLocaleString("id-ID")} kata × Rp4,7)`, value: eIncome });
    }
    rows.push({ separator: true } as SlipRow);
    rows.push({ label: `Uang Pulsa${!pulsaOk ? " (belum memenuhi syarat)" : ""}`, value: pulsa, muted: !pulsaOk });
    rows.push({ label: `Tabungan${!tabOk ? " (belum memenuhi syarat)" : ""}`, value: tabungan, muted: !tabOk });
    if (bonusOk) rows.push({ label: "Bonus Kinerja 5%", value: bonus });
    if (lainnya > 0) {
      rows.push({ separator: true } as SlipRow);
      rows.push({ label: "Pendapatan Lainnya", value: lainnya });
    }
    total = wIncome + eIncome + pulsa + bonus + lainnya;
  }

  if (isCS && csData) {
    const pulsa = 70_000;
    tabungan = 100_000;
    rows = [
      { label: "Pencapaian Tertinggi Penulis", value: csData.topAchievement },
      { label: "Bonus 5% dari Pencapaian Tertinggi", value: csData.bonus },
      { separator: true } as SlipRow,
      { label: "Uang Pulsa", value: pulsa },
      { label: "Tabungan", value: tabungan, muted: true },
    ];
    if (lainnya > 0) {
      rows.push({ separator: true } as SlipRow);
      rows.push({ label: "Pendapatan Lainnya", value: lainnya });
    }
    total = csData.pendapatanArtikel + pulsa + lainnya;
  }

  // ── Print handler ────────────────────────────────────────────────────────────
  const handlePrint = async () => {
    const printContent = printRef.current?.innerHTML;
    if (!printContent) return;

    // Convert logo to base64 so it renders in the print window
    let logoDataUrl = logoJaseo;
    try {
      const res = await fetch(logoJaseo);
      const blob = await res.blob();
      logoDataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* fall back to original src */ }

    // Replace logo src in the HTML with the base64 version
    const printHTML = printContent.replace(
      new RegExp(`src="${logoJaseo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"),
      `src="${logoDataUrl}"`
    );

    const win = window.open("", "_blank", "width=794,height=1123");
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <title>Slip Gaji — ${BULAN[month - 1]} ${year}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; max-width: 720px; margin: auto; }
          h1 { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
          h2 { font-size: 15px; }
          .flex { display: flex; }
          .items-center { align-items: center; }
          .gap-4 { gap: 16px; }
          .flex-1 { flex: 1; }
          .text-right { text-align: right; }
          .inline-block { display: inline-block; }
          .border { border: 1px solid #111; }
          .rounded { border-radius: 4px; }
          .px-3 { padding-left: 12px; padding-right: 12px; }
          .py-1 { padding-top: 4px; padding-bottom: 4px; }
          .text-center { text-align: center; }
          .pb-3 { padding-bottom: 12px; }
          .mb-4 { margin-bottom: 16px; }
          .border-b-2 { border-bottom: 2px solid #111; }
          .text-xs { font-size: 11px; }
          .text-sm { font-size: 13px; }
          img { height: 56px; width: auto; object-fit: contain; }
          .grid-cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
          .contents { display: contents; }
          hr, .separator { border: none; border-top: 1px solid #ccc; margin: 8px 0; }
          .border-top-2 { border-top: 2px solid #111 !important; }
          table { width: 100%; border-collapse: collapse; }
          td { padding: 2px 0; }
          td:last-child { text-align: right; font-family: monospace; }
          .opacity-60 { opacity: 0.55; }
          .font-mono { font-family: monospace; }
          .font-bold { font-weight: bold; }
          .font-semibold { font-weight: 600; }
          .tracking-wide { letter-spacing: 0.5px; }
          .tracking-widest { letter-spacing: 2px; }
          .uppercase { text-transform: uppercase; }
          .text-muted-foreground { color: #666; }
          .grid { display: grid; }
          .gap-x-4 { column-gap: 16px; }
          .gap-y-1 { row-gap: 4px; }
          .my-3 { margin: 12px 0; }
          .my-4 { margin: 16px 0; }
          .mb-1 { margin-bottom: 4px; }
          .mb-3 { margin-bottom: 12px; }
          .mb-12 { margin-bottom: 48px; }
          .mt-6 { margin-top: 24px; }
          .mt-4 { margin-top: 16px; }
          .pt-1 { padding-top: 4px; }
          .gap-8 { gap: 32px; }
          .border-t { border-top: 1px solid #111; }
          .justify-between { justify-content: space-between; }
          .w-full { width: 100%; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        ${printHTML}
      </body>
      </html>
    `);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  const displayProfile: UserProfile = profile ?? {
    name: currentUser?.writerName ?? currentUser?.editorName ?? currentUser?.username ?? "",
    fullName: null,
    role: viewRole ?? currentUser?.role ?? "",
    bankAccount: null,
    bankName: null,
    accountOwner: null,
    joinDate: null,
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="w-full sm:max-w-[680px] max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Slip Gaji — {BULAN[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 pr-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-10">
              Tidak ada data gaji untuk periode ini.
            </p>
          ) : (
            <div ref={printRef} className="border rounded-lg p-6 bg-white dark:bg-card text-foreground">
              <SlipPrintArea
                profile={displayProfile}
                rows={rows}
                total={total}
                tabungan={tabungan}
                year={year}
                month={month}
                userId={targetUserId ?? 0}
              />
            </div>
          )}
        </div>

        {!isLoading && rows.length > 0 && (
          <div className="shrink-0 pt-3 flex justify-end gap-2 border-t">
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" /> Tutup
            </Button>
            <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Printer className="mr-2 h-4 w-4" />
              Cetak Slip Gaji
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
